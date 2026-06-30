// ============================================================
// shop.ts — ショップAPI
// GET  /api/shop/catalog  — piece_master 一覧（フィルタ付き）
// GET  /api/shop/wallet   — インゴット残高
// POST /api/shop/purchase — インゴットでコマ購入（D1で減算→付与）
// POST /api/shop/ingots   — インゴットをPlatform決済で購入
// ============================================================

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../worker';
import { callPlatformApi, getBearerToken, getPlatformGameId, PlatformApiError } from './auth';
import { costToDisplay, skuToPieceId, SHELF_NAMES } from '../types/piece';
import type { PieceMaster, ShopCatalogItem } from '../types/piece';

const shop = new Hono<{
  Bindings: Env['Bindings'];
  Variables: { userId?: string };
}>();

type PlatformPrice = {
  price_id: string;
  currency: string;
  amount_cents: number;
  provider: string;
  provider_price_id?: string | null;
  is_active: boolean;
};

type PlatformCurrencyPrice = {
  currency_code: string;
  amount: number;
  is_active: boolean;
};

type PlatformProduct = {
  product_id: string;
  game_id: string;
  slug: string;
  title: string;
  description?: string | null;
  product_type: string;
  sale_status: string;
  metadata?: Record<string, unknown> | null;
  prices?: PlatformPrice[];
  currency_prices?: PlatformCurrencyPrice[];
};

type IngotProduct = {
  product_id: string;
  price_id: string;
  slug: string;
  title: string;
  amount: number;
  currency: string;
  amount_cents: number;
  provider: string;
};

const INGOT_CURRENCY_CODE = 'INGOT';
const PRICE_CURRENCY_ORDER = ['JPY', 'USD', 'EUR'];

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numericMetadata(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isIngotProduct(product: PlatformProduct): boolean {
  const metadata = metadataRecord(product.metadata);
  return product.product_type === 'currency_pack'
    && String(metadata.currency_code ?? '').toUpperCase() === INGOT_CURRENCY_CODE;
}

function pickActivePrice(product: PlatformProduct, preferredPriceId?: string): PlatformPrice | null {
  const activePrices = (product.prices ?? []).filter((p) => p.is_active);
  if (preferredPriceId) {
    return activePrices.find((p) => p.price_id === preferredPriceId) ?? null;
  }
  return activePrices.sort((a, b) => {
    const ai = PRICE_CURRENCY_ORDER.indexOf(a.currency.toUpperCase());
    const bi = PRICE_CURRENCY_ORDER.indexOf(b.currency.toUpperCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  })[0] ?? null;
}

function toIngotProduct(product: PlatformProduct, price: PlatformPrice): IngotProduct {
  const metadata = metadataRecord(product.metadata);
  return {
    product_id: product.product_id,
    price_id: price.price_id,
    slug: product.slug,
    title: product.title,
    amount: numericMetadata(metadata.currency_amount ?? metadata.amount) ?? 0,
    currency: price.currency,
    amount_cents: price.amount_cents,
    provider: price.provider,
  };
}

/** Platform の販売中ゲーム商品一覧を取得（公開API・game token不要）。 */
async function fetchGameProducts(env: Env['Bindings']): Promise<PlatformProduct[]> {
  const gameId = getPlatformGameId(env);
  const params = new URLSearchParams({ game_id: gameId, sale_status: 'on_sale' });
  const result = await callPlatformApi<{ items: PlatformProduct[] }>(
    env,
    `/v1/commerce/products?${params.toString()}`,
    { authMode: 'none', timeoutMs: 5_000 },
  );
  return result.items ?? [];
}

async function listIngotProducts(env: Env['Bindings']): Promise<IngotProduct[]> {
  const products = await fetchGameProducts(env);
  return products
    .filter(isIngotProduct)
    .map((product) => {
      const price = pickActivePrice(product);
      return price ? toIngotProduct(product, price) : null;
    })
    .filter((p): p is IngotProduct => p !== null)
    .sort((a, b) => a.amount - b.amount || a.amount_cents - b.amount_cents);
}

/** product から SKU を導出（metadata.sku 優先、なければ slug）。 */
function productSku(product: PlatformProduct): string | null {
  const metadata = metadataRecord(product.metadata);
  const sku = metadata.sku ?? product.slug;
  return typeof sku === 'string' && sku.length > 0 ? sku : null;
}

/** product のアクティブな INGOT 価格を返す（なければ null）。 */
function activeIngotPrice(product: PlatformProduct): number | null {
  const price = (product.currency_prices ?? []).find(
    (p) => p.currency_code.toUpperCase() === INGOT_CURRENCY_CODE && p.is_active,
  );
  return price ? price.amount : null;
}

interface PieceProductInfo {
  product_id: string;
  ingot_price: number | null;
  is_on_sale: boolean;
  /** active な INGOT 価格を持つ＝INGOTで購入可能な状態か。 */
  platform_configured: boolean;
}

/** SKU → Platform product 情報のマップを作る（piece product のみ。§6.3）。 */
function buildPieceProductMap(products: PlatformProduct[]): Map<string, PieceProductInfo> {
  const map = new Map<string, PieceProductInfo>();
  for (const product of products) {
    if (product.product_type === 'currency_pack') continue;
    const sku = productSku(product);
    if (!sku) continue;
    const ingotPrice = activeIngotPrice(product);
    map.set(sku, {
      product_id: product.product_id,
      ingot_price: ingotPrice,
      is_on_sale: product.sale_status === 'on_sale',
      platform_configured: ingotPrice !== null,
    });
  }
  return map;
}

/** Platform 上の INGOT 残高を取得（user JWT 必須・§6.2）。 */
async function getIngotBalance(env: Env['Bindings'], userToken: string): Promise<number> {
  const gameId = getPlatformGameId(env);
  const res = await callPlatformApi<{
    balances?: Array<{ currency_code: string; balance: number }>;
  }>(env, `/v1/commerce/currencies/${encodeURIComponent(gameId)}`, {
    authMode: 'user',
    userToken,
    timeoutMs: 5_000,
  });
  const ingot = (res.balances ?? []).find(
    (b) => b.currency_code.toUpperCase() === INGOT_CURRENCY_CODE,
  );
  return ingot?.balance ?? 0;
}

function checkoutReturnUrl(c: Context<{ Bindings: Env['Bindings']; Variables: { userId?: string } }>): string {
  if (c.env.PLATFORM_CHECKOUT_RETURN_URL) return c.env.PLATFORM_CHECKOUT_RETURN_URL;
  return new URL('/purchase/success', c.req.url).toString();
}

function platformErrorBody(e: PlatformApiError): { code: string; message?: string } {
  try {
    const parsed = JSON.parse(e.body) as {
      error_code?: string;
      message?: string;
      error?: { code?: string; message?: string } | string;
    };
    if (typeof parsed.error === 'object' && parsed.error?.code) {
      return { code: parsed.error.code, message: parsed.error.message ?? parsed.message };
    }
    if (typeof parsed.error === 'string') return { code: parsed.error, message: parsed.message };
    return { code: parsed.error_code ?? 'PLATFORM_ERROR', message: parsed.message };
  } catch {
    return { code: 'PLATFORM_ERROR', message: e.message };
  }
}

/**
 * items/purchase の Platform エラーを FCMS レスポンスへ変換（§6.4 エラー変換表）。
 *   INSUFFICIENT_BALANCE      → 402 INSUFFICIENT_INGOTS
 *   ALREADY_OWNED             → 409 ALREADY_OWNED
 *   CURRENCY_PRICE_NOT_FOUND  → 503 PRODUCT_NOT_CONFIGURED
 *   INVALID_PRODUCT           → 400 INVALID_PRODUCT
 *   5xx / timeout             → 502 PLATFORM_UNAVAILABLE
 */
function mapItemsPurchaseError(e: PlatformApiError): { status: 400 | 402 | 409 | 502 | 503; error: string; message?: string } {
  const { code, message } = platformErrorBody(e);
  switch (code) {
    case 'INSUFFICIENT_BALANCE':
      return { status: 402, error: 'INSUFFICIENT_INGOTS', message };
    case 'ALREADY_OWNED':
      return { status: 409, error: 'ALREADY_OWNED', message };
    case 'CURRENCY_PRICE_NOT_FOUND':
      return { status: 503, error: 'PRODUCT_NOT_CONFIGURED', message };
    case 'INVALID_PRODUCT':
      return { status: 400, error: 'INVALID_PRODUCT', message };
    default:
      return e.status >= 500
        ? { status: 502, error: 'PLATFORM_UNAVAILABLE', message }
        : { status: 400, error: code, message };
  }
}

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

  // Platform product 情報をマージ（§6.3）。取得失敗時は platform_configured=false で返す。
  let pieceProducts = new Map<string, PieceProductInfo>();
  try {
    pieceProducts = buildPieceProductMap(await fetchGameProducts(c.env));
  } catch (e) {
    console.error('[shop] Failed to load Platform products for catalog:', e);
  }

  const items: ShopCatalogItem[] = result.results.map((p) => {
    const product = pieceProducts.get(p.sku) ?? null;
    return {
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
      product_id: product?.product_id ?? null,
      ingot_price: product?.ingot_price ?? null,
      is_on_sale: product?.is_on_sale ?? false,
      platform_configured: product?.platform_configured ?? false,
    };
  });

  return c.json({
    items,
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
});

/**
 * GET /api/shop/wallet
 * INGOT 残高を Platform（正の台帳）から返す（§6.2）。
 * Platform 障害時は 502 で障害を見える化する（サービスイン前方針）。
 */
shop.get('/wallet', async (c) => {
  const userId = c.get('userId');
  const userToken = getBearerToken(c.req.header('Authorization'));
  if (!userId || !userToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const ingots = await getIngotBalance(c.env, userToken);
    return c.json({ ingots });
  } catch (e) {
    if (e instanceof PlatformApiError && e.status === 401) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    console.error('[shop] Failed to load Platform balance:', e);
    return c.json({
      error: 'PLATFORM_UNAVAILABLE',
      message: 'Could not load INGOT balance from Platform',
    }, 502);
  }
});

/**
 * GET /api/shop/ingot-products
 * Platform の販売中 INGOT products を返す。
 */
shop.get('/ingot-products', async (c) => {
  try {
    const items = await listIngotProducts(c.env);
    return c.json({ items, game_id: getPlatformGameId(c.env) });
  } catch (e) {
    console.error('[shop] Failed to load ingot products:', e);
    return c.json({
      error: 'PLATFORM_PRODUCTS_UNAVAILABLE',
      message: 'Could not load Platform ingot products',
      items: [],
      game_id: getPlatformGameId(c.env),
    }, 502);
  }
});

/**
 * POST /api/shop/purchase
 * Body: { piece_id?: number; product_id?: string }
 * Platform の /v1/commerce/items/purchase を呼び、INGOT 減算 + 付与を原子的に確定する（§6.4）。
 * 互換: piece_id 入力時は piece_master.sku → Platform product に解決してから購入する。
 * 成功時は granted_items を user_pieces_v2 に即時同期（webhook 後着でも INSERT OR IGNORE で冪等）。
 */
shop.post('/purchase', async (c) => {
  const userId = c.get('userId');
  const userToken = getBearerToken(c.req.header('Authorization'));
  if (!userId || !userToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { piece_id?: unknown; product_id?: unknown };
  try {
    body = await c.req.json<{ piece_id?: unknown; product_id?: unknown }>();
  } catch {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON' }, 400);
  }

  const hasPieceId = typeof body.piece_id === 'number' && Number.isInteger(body.piece_id);
  const hasProductId = typeof body.product_id === 'string' && body.product_id.length > 0;
  if (!hasPieceId && !hasProductId) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'piece_id or product_id is required' }, 400);
  }

  // product_id の解決（piece_id 入力時は piece_master.sku 経由で Platform product を探す）
  let productId = hasProductId ? (body.product_id as string) : '';
  const requestedPieceId: number | null = hasPieceId ? (body.piece_id as number) : null;

  if (!productId) {
    const pieceId = body.piece_id as number;
    const piece = await c.env.DB.prepare(
      'SELECT piece_id, sku, is_purchasable FROM piece_master WHERE piece_id = ?',
    )
      .bind(pieceId)
      .first<{ piece_id: number; sku: string; is_purchasable: number }>();

    if (!piece) {
      return c.json({ error: 'INVALID_PIECE_ID', message: 'Piece not found' }, 400);
    }
    if (!piece.is_purchasable) {
      return c.json({ error: 'NOT_PURCHASABLE', message: 'This piece cannot be purchased' }, 400);
    }

    let product: PieceProductInfo | undefined;
    try {
      product = buildPieceProductMap(await fetchGameProducts(c.env)).get(piece.sku);
    } catch (e) {
      console.error('[shop] Failed to resolve Platform product for purchase:', e);
      return c.json({ error: 'PLATFORM_UNAVAILABLE', message: 'Could not reach Platform' }, 502);
    }
    if (!product || !product.platform_configured) {
      return c.json({ error: 'PRODUCT_NOT_CONFIGURED', message: 'Piece is not on sale on Platform' }, 503);
    }
    productId = product.product_id;
  }

  // Platform 購入（INGOT 減算 + 付与を原子的に確定）
  let result: {
    purchase_id?: string;
    status?: string;
    balance_after?: number;
    granted_items?: Array<{ item_ref_id: string; quantity?: number; inventory_item_id?: string }>;
  };
  try {
    result = await callPlatformApi(c.env, '/v1/commerce/items/purchase', {
      method: 'POST',
      authMode: 'user',
      userToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ product_id: productId }),
    });
  } catch (e) {
    if (e instanceof PlatformApiError) {
      const mapped = mapItemsPurchaseError(e);
      return c.json({ error: mapped.error, message: mapped.message ?? 'Platform purchase failed' }, mapped.status);
    }
    console.error('[shop] items/purchase error:', e);
    return c.json({ error: 'PLATFORM_UNAVAILABLE', message: 'Failed to reach Platform' }, 502);
  }

  // 付与アイテムを user_pieces_v2 に同期（item_ref_id=SKU, inventory_item_id=entitlement_id）
  const now = new Date().toISOString();
  const grantedPieceIds: number[] = [];
  for (const item of result.granted_items ?? []) {
    const pid = skuToPieceId(item.item_ref_id);
    if (pid === null) continue;
    try {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO user_pieces_v2 (user_id, piece_id, source, entitlement_id, acquired_at) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(userId, pid, 'purchase', item.inventory_item_id ?? null, now)
        .run();
      grantedPieceIds.push(pid);
    } catch (e) {
      console.error('[shop] Failed to sync granted piece (will reconcile via webhook):', e);
    }
  }

  // 所持コマキャッシュ無効化
  await c.env.KV.delete(`owned_pieces:${userId}`);

  const pieceId = requestedPieceId ?? grantedPieceIds[0] ?? null;
  return c.json(
    {
      piece_id: pieceId,
      balance: result.balance_after ?? null,
      granted_pieces: grantedPieceIds,
      purchase_id: result.purchase_id,
    },
    201,
  );
});

/**
 * POST /api/shop/ingots
 * Body: { product_id?: string; price_id?: string; provider?: 'stripe' | 'komoju' }
 * Platform の /v1/commerce/purchase を現行 product_id/price_id 方式で呼び checkout_url を返す。
 * インゴットはプラットフォーム決済で購入し、Webhook 経由でウォレットに加算される。
 */
shop.post('/ingots', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const userToken = getBearerToken(c.req.header('Authorization'));
  if (!userToken) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { product_id?: string; price_id?: string; provider?: 'stripe' | 'komoju' } = {};
  try {
    body = await c.req.json<typeof body>();
  } catch {
    // ボディなし → 最小INGOT productを使う
  }

  try {
    const products = await listIngotProducts(c.env);
    if (products.length === 0) {
      return c.json({
        error: 'INGOT_PRODUCTS_NOT_CONFIGURED',
        message: 'No on-sale INGOT products are registered for this game on Platform',
        game_id: getPlatformGameId(c.env),
      }, 503);
    }

    const selectedProduct = body.product_id
      ? products.find((p) => p.product_id === body.product_id)
      : products[0];
    if (!selectedProduct) {
      return c.json({ error: 'INVALID_PRODUCT', message: 'Unknown ingot product' }, 400);
    }

    const selectedPrice = body.price_id ?? selectedProduct.price_id;
    if (body.price_id && body.price_id !== selectedProduct.price_id) {
      return c.json({ error: 'INVALID_PRICE', message: 'Unknown ingot price' }, 400);
    }

    const result = await callPlatformApi<{
      purchase_id: string;
      checkout_url: string;
      status: string;
    }>(c.env, '/v1/commerce/purchase', {
      method: 'POST',
      authMode: 'user',
      userToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        product_id: selectedProduct.product_id,
        price_id: selectedPrice,
        provider: body.provider ?? selectedProduct.provider,
        return_url: checkoutReturnUrl(c),
      }),
    });

    return c.json(
      {
        purchase_id: result.purchase_id,
        checkout_url: result.checkout_url,
        status: result.status,
        product: selectedProduct,
      },
      201,
    );
  } catch (e) {
    if (e instanceof PlatformApiError) {
      const details = platformErrorBody(e);
      const status = e.status >= 400 && e.status < 500 ? 400 : 502;
      return c.json({
        error: details.code,
        message: details.message ?? 'Platform purchase failed',
      }, status);
    }
    console.error('[shop] Ingot purchase API error:', e);
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to initiate ingot purchase' }, 500);
  }
});

export default shop;
