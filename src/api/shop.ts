// ============================================================
// shop.ts — ショップAPI（カタログ閲覧 + 購入開始）
// GET /api/shop/catalog — piece_master 一覧（フィルタ付き）
// POST /api/shop/purchase — Platform経由で購入開始
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';
import { callPlatformUserApi } from './auth';
import { costToDisplay, SHELF_NAMES } from '../types/piece';
import type { PieceMaster, ShopCatalogItem } from '../types/piece';

const shop = new Hono<{
  Bindings: Env['Bindings'];
  Variables: { userId?: string };
}>();

/**
 * GET /api/shop/catalog
 * クエリパラメータ: position, era_shelf, family, category(ss), limit, offset
 * userId があれば is_owned を返す（JWT optional）
 */
shop.get('/catalog', async (c) => {
  const position = c.req.query('position');
  const eraShelf = c.req.query('era_shelf');
  const family = c.req.query('family');
  const category = c.req.query('category'); // 'ss' for cost=3
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);

  // クエリ構築
  const conditions: string[] = ['is_purchasable = 1'];
  const binds: (string | number)[] = [];

  if (position) {
    conditions.push('position = ?');
    binds.push(position.toUpperCase());
  }
  if (eraShelf) {
    const shelf = parseInt(eraShelf, 10);
    if (shelf >= 1 && shelf <= 7) {
      conditions.push('era_shelf = ?');
      binds.push(shelf);
    }
  }
  if (family) {
    conditions.push('family = ?');
    binds.push(family.toLowerCase());
  }
  if (category === 'ss') {
    conditions.push('cost = 3');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // カウント取得
  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM piece_master ${whereClause}`,
  )
    .bind(...binds)
    .first<{ total: number }>();

  // データ取得
  const result = await c.env.DB.prepare(
    `SELECT * FROM piece_master ${whereClause} ORDER BY piece_id ASC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all<PieceMaster>();

  // is_owned 判定（userIdがある場合のみ）
  const userId = c.get('userId');
  let ownedSet = new Set<number>();
  if (userId && result.results.length > 0) {
    const pieceIds = result.results.map((r) => r.piece_id);
    const placeholders = pieceIds.map(() => '?').join(',');
    const owned = await c.env.DB.prepare(
      `SELECT piece_id FROM user_pieces_v2 WHERE user_id = ? AND piece_id IN (${placeholders})`,
    )
      .bind(userId, ...pieceIds)
      .all<{ piece_id: number }>();
    ownedSet = new Set(owned.results.map((r) => r.piece_id));
  }

  const items: ShopCatalogItem[] = result.results.map((p) => ({
    piece_id: p.piece_id,
    sku: p.sku,
    name_ja: p.name_ja,
    name_en: p.name_en,
    position: p.position,
    cost: p.cost,
    cost_display: costToDisplay(p.cost),
    era: p.era,
    era_shelf: p.era_shelf,
    era_shelf_name: SHELF_NAMES[p.era_shelf]?.en ?? 'Unknown',
    family: p.family,
    nationality: p.nationality,
    summary_ja: p.summary_ja,
    image_url: p.image_url,
    is_owned: ownedSet.has(p.piece_id),
  }));

  return c.json({
    items,
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
});

/**
 * POST /api/shop/purchase
 * Body: { piece_id: number }
 * Platform の /v1/commerce/purchase を呼んで checkout_url を返す
 */
shop.post('/purchase', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json<{ piece_id: number }>();
  if (!body.piece_id || typeof body.piece_id !== 'number') {
    return c.json({ error: 'VALIDATION_ERROR', message: 'piece_id is required' }, 400);
  }

  // piece_master 存在確認 + is_purchasable チェック
  const piece = await c.env.DB.prepare(
    'SELECT piece_id, sku, is_purchasable FROM piece_master WHERE piece_id = ?',
  )
    .bind(body.piece_id)
    .first<{ piece_id: number; sku: string; is_purchasable: number }>();

  if (!piece) {
    return c.json({ error: 'INVALID_PIECE_ID', message: 'Piece not found' }, 400);
  }
  if (!piece.is_purchasable) {
    return c.json({ error: 'NOT_PURCHASABLE', message: 'This piece cannot be purchased' }, 400);
  }

  // 所持確認（二重購入防止）
  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM user_pieces_v2 WHERE user_id = ? AND piece_id = ?',
  )
    .bind(userId, body.piece_id)
    .first();

  if (existing) {
    return c.json({ error: 'ALREADY_OWNED', message: 'You already own this piece' }, 409);
  }

  // Platform v2 purchase (product_id + price_id + provider required)
  try {
    // piece_master から Platform product/price ID を取得
    const platformProduct = await c.env.DB.prepare(
      'SELECT platform_product_id, platform_price_id FROM piece_master WHERE piece_id = ?',
    )
      .bind(body.piece_id)
      .first<{ platform_product_id: string | null; platform_price_id: string | null }>();

    if (!platformProduct?.platform_product_id || !platformProduct?.platform_price_id) {
      return c.json({
        error: 'PRODUCT_NOT_CONFIGURED',
        message: 'This piece is not yet registered on Platform. Purchase unavailable.',
      }, 503);
    }

    // User JWT をリクエストヘッダーから取得
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', message: 'Valid JWT required for purchase' }, 401);
    }
    const userJwt = authHeader.slice(7);

    const result = await callPlatformUserApi<{
      purchase_id: string;
      checkout_url: string;
      status: string;
    }>(c.env, '/v1/commerce/purchase', userJwt, {
      method: 'POST',
      body: JSON.stringify({
        product_id: platformProduct.platform_product_id,
        price_id: platformProduct.platform_price_id,
        provider: 'stripe',
      }),
    });

    return c.json(
      {
        purchase_id: result.purchase_id,
        checkout_url: result.checkout_url,
        status: result.status,
      },
      201,
    );
  } catch (e) {
    console.error('[shop] Purchase API error:', e);
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to initiate purchase' }, 500);
  }
});

export default shop;
