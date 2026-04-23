// ============================================================
// webhooks.ts — Platform Webhook 受信（HMAC検証 + 冪等化）
// POST /webhook/purchase — entitlement.created / entitlement.revoked
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';
import { verifyHmacSignature } from './auth';
import { timingSafeEqual } from '../middleware/crypto_utils';
import { skuToPieceId } from '../types/piece';
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

  const valid = await verifyHmacSignature(body, signature, c.env.PLATFORM_HMAC_SECRET);
  if (!valid) {
    return c.json({ error: 'WEBHOOK_SIGNATURE_INVALID', message: 'Signature mismatch' }, 401);
  }

  // 2. 冪等性チェック (X-Webhook-Delivery-Id)
  const deliveryId = c.req.header('X-Webhook-Delivery-Id');
  if (!deliveryId) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Missing Delivery-Id' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT delivery_id FROM webhook_deliveries_received WHERE delivery_id = ?',
  )
    .bind(deliveryId)
    .first();

  if (existing) {
    // 既に処理済み → 冪等に200を返す
    return c.json({ ok: true, duplicate: true });
  }

  // 3. ペイロードパース
  let payload: WebhookPurchasePayload;
  try {
    payload = JSON.parse(body) as WebhookPurchasePayload;
  } catch {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON' }, 400);
  }

  const { event_type, data } = payload;
  if (!data?.user_id || !data?.sku) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Missing user_id or sku' }, 400);
  }

  // 4. SKU → piece_id 変換
  const pieceId = skuToPieceId(data.sku);
  if (pieceId === null) {
    return c.json({ error: 'INVALID_SKU', message: `Unknown SKU: ${data.sku}` }, 400);
  }

  // 5. piece_master 存在確認
  const piece = await c.env.DB.prepare(
    'SELECT piece_id FROM piece_master WHERE piece_id = ?',
  )
    .bind(pieceId)
    .first();

  if (!piece) {
    return c.json({ error: 'INVALID_PIECE_ID', message: `Unknown piece_id: ${pieceId}` }, 400);
  }

  // 6. イベント処理
  const now = new Date().toISOString();
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
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO webhook_deliveries_received (delivery_id, event_type, received_at, processed, result) VALUES (?, ?, ?, 1, ?)',
  )
    .bind(deliveryId, event_type, now, result)
    .run();

  // 8. KV キャッシュ無効化
  await c.env.KV.delete(`owned_pieces:${data.user_id}`);

  return c.json({ ok: true });
});

export default webhooks;
