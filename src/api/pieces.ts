// ============================================================
// pieces.ts — 所持コマAPI（Platform連携版）
// user_pieces_v2 JOIN piece_master でリッチなレスポンスを返す
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';
import { callPlatformUserApi } from './auth';
import { grantFoundingEleven } from '../lib/founding_eleven';
import { skuToPieceId } from '../types/piece';
import type { OwnedPieceDetail } from '../types/piece';

const pieces = new Hono<{
  Bindings: Env['Bindings'];
  Variables: { userId: string };
}>();

/**
 * GET /api/pieces — 所持コマ一覧（piece_master JOIN）
 */
pieces.get('/', async (c) => {
  const userId = c.get('userId');

  const result = await c.env.DB.prepare(`
    SELECT
      p.piece_id, p.sku, p.name_ja, p.name_en, p.position, p.cost,
      p.era, p.era_shelf, p.family, p.nationality, p.is_founding,
      p.summary_ja, p.image_url, p.image_status,
      u.source, u.entitlement_id, u.acquired_at
    FROM user_pieces_v2 u
    JOIN piece_master p ON u.piece_id = p.piece_id
    WHERE u.user_id = ?
    ORDER BY p.piece_id ASC
  `)
    .bind(userId)
    .all<OwnedPieceDetail>();

  return c.json({
    items: result.results,
    total: result.results.length,
    max_allowed: 200,
  });
});

/**
 * GET /api/pieces/count — 所持数のみ
 */
pieces.get('/count', async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM user_pieces_v2 WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ cnt: number }>();

  return c.json({ count: result?.cnt ?? 0, max: 200 });
});

/**
 * POST /api/pieces/sync — Platform entitlements と差分同期
 * Founding Eleven の補完も行う
 */
pieces.post('/sync', async (c) => {
  const userId = c.get('userId');

  // 1. Founding Eleven を確保
  const { granted: foundingGranted } = await grantFoundingEleven(c.env.DB, userId);

  // 2. Platform entitlements を取得（User JWT 認証）
  let platformAdded = 0;
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('No user JWT available for Platform sync');
    }
    const userJwt = authHeader.slice(7);

    const entitlements = await callPlatformUserApi<{
      items: Array<{
        sku: string;
        entitlement_id: string;
        state: string;
      }>;
    }>(c.env, `/v1/entitlements?game_id=football_chess_maniacs`, userJwt);

    // active な entitlement のみ処理
    const activeEntitlements = entitlements.items.filter((e) => e.state === 'active');

    for (const ent of activeEntitlements) {
      const pieceId = skuToPieceId(ent.sku);
      if (pieceId === null) continue;

      // 存在確認 + INSERT OR IGNORE
      const exists = await c.env.DB.prepare(
        'SELECT 1 FROM piece_master WHERE piece_id = ?',
      )
        .bind(pieceId)
        .first();

      if (!exists) continue;

      const result = await c.env.DB.prepare(
        'INSERT OR IGNORE INTO user_pieces_v2 (user_id, piece_id, source, entitlement_id, acquired_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(userId, pieceId, 'purchase', ent.entitlement_id, new Date().toISOString())
        .run();

      if (result.meta.changes > 0) platformAdded++;
    }
  } catch (e) {
    console.error('[pieces/sync] Platform API error:', e);
    // Platform障害時はFounding Elevenの付与結果のみ返す
  }

  // 合計数を取得
  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM user_pieces_v2 WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ cnt: number }>();

  return c.json({
    synced: foundingGranted + platformAdded,
    founding_granted: foundingGranted,
    platform_added: platformAdded,
    total: countResult?.cnt ?? 0,
  });
});

export default pieces;
