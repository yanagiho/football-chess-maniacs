// ============================================================
// webhooks.ts — Platform Webhook 受信（HMAC検証 + 冪等化）
// POST /webhook/purchase — entitlement.created / entitlement.revoked
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';
import { verifyHmacSignature } from './auth';
import { skuToPieceId, INGOT_SKU_AMOUNTS } from '../types/piece';
import type { WebhookPurchasePayload } from '../types/piece';

const webhooks = new Hono<{
  Bindings: Env['Bindings'];
  Variables: { userId: string };
}>();

/**
 * POST /webhook/purchase
 * Platform から HMAC-SHA256 署名付きで送信される購入Webhook
 *
 * ヘッダー:
 *   X-Webhook-Signature: sha256=<hex>
 *   X-Webhook-Event: entitlement.created | entitlement.revoked
 *   X-Webhook-Delivery-Id: <UUID>
 */
webhooks.post('/purchase', async (c) => {
  // 1. HMAC 署名検証
  const signatureHeader = c.req.header('X-Webhook-Signature');
  if (!signatureHeader) {
    return c.json({ error: 'WEBHOOK_SIGNATURE_INVALID', message: 'Missing signature' }, 401);
  }

  const body = await c.req.text();

  // sha256=<hex> 形式からhex部分を抽出
  const sigPrefix = 'sha256=';
  if (!signatureHeader.startsWith(sigPrefix)) {
    return c.json({ error: 'WEBHOOK_SIGNATURE_INVALID', message: 'Invalid signature format' }, 401);
  }
  const signature = signatureHeader.slice(sigPrefix.length);

  let valid = false;
  try {
    valid = await verifyHmacSignature(body, signature, c.env.PLATFORM_HMAC_SECRET);
  } catch {
    valid = false;
  }
  if (!valid) {
    return c.json({ error: 'WEBHOOK_SIGNATURE_INVALID', message: 'Signature mismatch' }, 401);
  }

  // 2. Delivery-Id 必須チェック（署名検証後にのみ扱う）
  const deliveryId = c.req.header('X-Webhook-Delivery-Id');
  if (!deliveryId) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Missing Delivery-Id' }, 400);
  }

  // 3. ペイロードパース + 最低限の妥当性検証
  let payload: WebhookPurchasePayload;
  try {
    payload = JSON.parse(body) as WebhookPurchasePayload;
  } catch {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON' }, 400);
  }

  const { event_type, data } = payload;
  if (typeof event_type !== 'string' || event_type.length === 0) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Missing event_type' }, 400);
  }
  if (typeof data?.user_id !== 'string' || data.user_id.length === 0) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Missing user_id' }, 400);
  }

  const now = new Date().toISOString();

  // 4. 実処理前に deliveryId をclaimする。changes=1のリクエストだけが副作用を実行できる。
  const claimResult = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO webhook_deliveries_received
       (delivery_id, event_type, received_at, processed, result)
     VALUES (?, ?, ?, 0, 'processing')`,
  )
    .bind(deliveryId, event_type, now)
    .run();

  if ((claimResult.meta?.changes ?? 0) === 0) {
    const existing = await c.env.DB.prepare(
      'SELECT processed, result FROM webhook_deliveries_received WHERE delivery_id = ?',
    )
      .bind(deliveryId)
      .first<{ processed: number; result: string | null }>();

    if (existing?.processed === 1) {
      return c.json({ ok: true, duplicate: true, result: existing.result ?? undefined });
    }

    return c.json({ error: 'WEBHOOK_IN_PROGRESS', duplicate: true }, 409);
  }

  async function markProcessed(result: string): Promise<void> {
    await c.env.DB.prepare(
      'UPDATE webhook_deliveries_received SET processed = 1, result = ? WHERE delivery_id = ?',
    )
      .bind(result, deliveryId)
      .run();
  }

  // 4-A. 現行Platform: currency.granted / currency.revoked → INGOTウォレットへ反映
  if (event_type === 'currency.granted' || event_type === 'currency.revoked') {
    const currencyCode = String(data.currency_code ?? '').toUpperCase();
    const amount = Number(data.amount);
    if (currencyCode !== 'INGOT' || !Number.isFinite(amount) || amount <= 0) {
      await markProcessed('currency event ignored');
      return c.json({ ok: true });
    }

    let result = 'ok';
    try {
      if (event_type === 'currency.granted') {
        await c.env.DB.prepare(
          `INSERT INTO user_wallets (user_id, ingots, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET ingots = ingots + ?, updated_at = ?`,
        )
          .bind(data.user_id, amount, now, amount, now)
          .run();
      } else {
        await c.env.DB.prepare(
          `INSERT INTO user_wallets (user_id, ingots, updated_at) VALUES (?, 0, ?)
           ON CONFLICT(user_id) DO UPDATE SET ingots = MAX(ingots - ?, 0), updated_at = ?`,
        )
          .bind(data.user_id, now, amount, now)
          .run();
      }
    } catch (e) {
      result = `error: ${e instanceof Error ? e.message : String(e)}`;
      console.error('[webhook/purchase] Currency wallet error:', e);
    }
    await markProcessed(result);
    return c.json({ ok: true });
  }

  // 4-B. inventory eventsは将来拡張用。現行FCMSでは副作用なしで受理する。
  if (event_type === 'inventory.granted' || event_type === 'inventory.revoked' || event_type === 'purchase.completed') {
    await markProcessed(`${event_type} ignored`);
    return c.json({ ok: true });
  }

  if (typeof data.sku !== 'string' || data.sku.length === 0) {
    await markProcessed('missing sku');
    return c.json({ error: 'VALIDATION_ERROR', message: 'Missing sku' }, 400);
  }

  // 4-C. 旧INGOT SKU互換 → ウォレットに加算（entitlement.created のみ）
  const ingotAmount = INGOT_SKU_AMOUNTS[data.sku];
  if (ingotAmount !== undefined) {
    let result = 'ok';
    try {
      if (event_type === 'entitlement.created') {
        await c.env.DB.prepare(
          `INSERT INTO user_wallets (user_id, ingots, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET ingots = ingots + ?, updated_at = ?`,
        )
          .bind(data.user_id, ingotAmount, now, ingotAmount, now)
          .run();
      } else {
        // インゴット(consumable)は revoke 対象外
        result = `ingot ${event_type} ignored`;
      }
    } catch (e) {
      result = `error: ${e instanceof Error ? e.message : String(e)}`;
      console.error('[webhook/purchase] Ingot credit error:', e);
    }
    await markProcessed(result);
    return c.json({ ok: true });
  }

  // 4-D. SKU → piece_id 変換
  const pieceId = skuToPieceId(data.sku);
  if (pieceId === null) {
    await markProcessed('invalid sku');
    return c.json({ error: 'INVALID_SKU', message: `Unknown SKU: ${data.sku}` }, 400);
  }

  // 5. piece_master 存在確認
  const piece = await c.env.DB.prepare(
    'SELECT piece_id FROM piece_master WHERE piece_id = ?',
  )
    .bind(pieceId)
    .first();

  if (!piece) {
    await markProcessed('invalid piece_id');
    return c.json({ error: 'INVALID_PIECE_ID', message: `Unknown piece_id: ${pieceId}` }, 400);
  }

  // 6. イベント処理
  let result = 'ok';

  try {
    if (event_type === 'entitlement.created') {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO user_pieces_v2 (user_id, piece_id, source, entitlement_id, acquired_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(data.user_id, pieceId, 'purchase', data.entitlement_id ?? null, now)
        .run();
    } else if (event_type === 'entitlement.revoked') {
      // founding / gift は revoke しない（purchase のみ）
      await c.env.DB.prepare(
        "DELETE FROM user_pieces_v2 WHERE user_id = ? AND piece_id = ? AND source = 'purchase'",
      )
        .bind(data.user_id, pieceId)
        .run();
    } else {
      result = `unknown event_type: ${event_type}`;
    }
  } catch (e) {
    result = `error: ${e instanceof Error ? e.message : String(e)}`;
    console.error('[webhook/purchase] Processing error:', e);
  }

  // 7. 配信記録を保存
  await markProcessed(result);

  // 8. KV キャッシュ無効化
  await c.env.KV.delete(`owned_pieces:${data.user_id}`);

  return c.json({ ok: true });
});

export default webhooks;
