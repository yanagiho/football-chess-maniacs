// ============================================================
// shop.test.ts — ショップAPI（Platform 連携経路）
//   /purchase: piece_id/product_id → Platform items/purchase → granted 同期・エラー変換
//   /ingots:   Platform product/price → checkout 作成
// ============================================================

import { afterEach, describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import shop from '../shop';

// ── フェイク D1 ───────────────────────────────────────────
interface FakeState {
  pieceMaster: Record<number, { is_purchasable: number; sku?: string }>;
  owned: Set<string>; // `${userId}:${pieceId}`
  wallets: Record<string, number>; // userId → ingots（現行は表示キャッシュ用途）
  inserts: Array<{ pieceId: number; entitlementId: string | null }>;
}

function makeFakeDb(state: FakeState) {
  const stmt = (sql: string) => ({
    _args: [] as unknown[],
    bind(...args: unknown[]) { this._args = args; return this; },
    async first<T>(): Promise<T | null> {
      if (sql.includes('FROM piece_master')) {
        const pid = this._args[0] as number;
        const p = state.pieceMaster[pid];
        return p
          ? ({ piece_id: pid, sku: p.sku ?? `fcms_piece_${String(pid).padStart(3, '0')}`, is_purchasable: p.is_purchasable } as T)
          : null;
      }
      if (sql.includes('SELECT 1 FROM user_pieces_v2')) {
        const [uid, pid] = this._args as [string, number];
        return state.owned.has(`${uid}:${pid}`) ? ({ 1: 1 } as T) : null;
      }
      if (sql.includes('SELECT ingots FROM user_wallets')) {
        const uid = this._args[0] as string;
        return ({ ingots: state.wallets[uid] ?? 0 } as T);
      }
      return null;
    },
    async run(): Promise<{ meta: { changes: number } }> {
      // コマ付与（granted 同期）
      if (sql.includes('INSERT') && sql.includes('user_pieces_v2')) {
        const [uid, pid, , entitlementId] = this._args as [string, number, string, string | null];
        state.owned.add(`${uid}:${pid}`);
        state.inserts.push({ pieceId: pid, entitlementId: entitlementId ?? null });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}

function emptyState(overrides: Partial<FakeState> = {}): FakeState {
  return { pieceMaster: {}, owned: new Set(), wallets: {}, inserts: [], ...overrides };
}

// userId を注入して shop をマウントしたテスト用アプリ
function makeApp(userId: string | null, db: D1Database, extraEnv: Record<string, unknown> = {}) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', async (c, next) => { if (userId) c.set('userId', userId); await next(); });
  app.route('/', shop);
  const fakeKv = { delete: async () => {}, get: async () => null, put: async () => {} };
  const env = {
    DB: db,
    KV: fakeKv,
    PLATFORM_API_BASE: 'https://platform.example.test',
    PLATFORM_GAME_ID: 'football_chess_maniacs',
    ...extraEnv,
  } as unknown as Parameters<typeof app.request>[2];
  return { app, env };
}

// ── Platform 応答のヘルパー ────────────────────────────────
function pieceProduct(pieceId: number, ingotPrice: number | null) {
  const sku = `fcms_piece_${String(pieceId).padStart(3, '0')}`;
  return {
    product_id: `prod-${sku}`,
    game_id: 'football_chess_maniacs',
    slug: sku,
    title: `Piece ${pieceId}`,
    product_type: 'piece',
    sale_status: 'on_sale',
    metadata: { sku, piece_id: pieceId },
    currency_prices: ingotPrice === null ? [] : [{ currency_code: 'INGOT', amount: ingotPrice, is_active: true }],
  };
}

/** products と items/purchase をモックする fetch を組む */
function stubPlatform(opts: {
  products?: unknown[];
  purchase?: { status: number; body: unknown };
  onPurchase?: (init?: RequestInit) => void;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/v1/commerce/products')) {
      return new Response(JSON.stringify({ items: opts.products ?? [] }), { status: 200 });
    }
    if (url.includes('/v1/commerce/items/purchase')) {
      opts.onPurchase?.(init);
      const p = opts.purchase ?? { status: 200, body: {} };
      return new Response(JSON.stringify(p.body), { status: p.status });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function purchase(
  app: Hono<{ Variables: { userId: string } }>,
  env: unknown,
  body: Record<string, unknown>,
  token: string | null = 'user-token',
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.request('/purchase', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, env as Parameters<typeof app.request>[2]);
}

describe('POST /api/shop/purchase（Platform items/purchase 経由）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('piece_id → Platform product 解決 → 201・granted 同期・balance_after 返却', async () => {
    const state = emptyState({ pieceMaster: { 5: { is_purchasable: 1 } } });
    const { app, env } = makeApp('u1', makeFakeDb(state));
    let purchaseBody: unknown;
    stubPlatform({
      products: [pieceProduct(5, 2)],
      purchase: {
        status: 200,
        body: { purchase_id: 'pur-1', status: 'completed', balance_after: 8, granted_items: [{ item_ref_id: 'fcms_piece_005', quantity: 1, inventory_item_id: 'ent-1' }] },
      },
      onPurchase: (init) => {
        const headers = init?.headers as Headers;
        expect(headers.get('Authorization')).toBe('Bearer user-token');
        expect(headers.get('Idempotency-Key')).toBeTruthy();
        purchaseBody = JSON.parse(String(init?.body));
      },
    });

    const res = await purchase(app, env, { piece_id: 5 });
    expect(res.status).toBe(201);
    expect(purchaseBody).toMatchObject({ product_id: 'prod-fcms_piece_005' });
    await expect(res.json()).resolves.toMatchObject({ piece_id: 5, balance: 8, granted_pieces: [5] });
    expect(state.owned.has('u1:5')).toBe(true);
    expect(state.inserts).toEqual([{ pieceId: 5, entitlementId: 'ent-1' }]);
  });

  it('product_id 直指定でも購入できる（product 解決をスキップ）', async () => {
    const state = emptyState();
    const { app, env } = makeApp('u1', makeFakeDb(state));
    let purchaseBody: unknown;
    stubPlatform({
      purchase: {
        status: 200,
        body: { purchase_id: 'pur-2', status: 'completed', balance_after: 3, granted_items: [{ item_ref_id: 'fcms_piece_010' }] },
      },
      onPurchase: (init) => { purchaseBody = JSON.parse(String(init?.body)); },
    });

    const res = await purchase(app, env, { product_id: 'prod-direct' });
    expect(res.status).toBe(201);
    expect(purchaseBody).toMatchObject({ product_id: 'prod-direct' });
    await expect(res.json()).resolves.toMatchObject({ piece_id: 10, balance: 3, granted_pieces: [10] });
  });

  it('INSUFFICIENT_BALANCE → 402 INSUFFICIENT_INGOTS', async () => {
    const state = emptyState({ pieceMaster: { 5: { is_purchasable: 1 } } });
    const { app, env } = makeApp('u1', makeFakeDb(state));
    stubPlatform({
      products: [pieceProduct(5, 3)],
      purchase: { status: 402, body: { error_code: 'INSUFFICIENT_BALANCE', message: 'not enough' } },
    });

    const res = await purchase(app, env, { piece_id: 5 });
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ error: 'INSUFFICIENT_INGOTS' });
    expect(state.owned.size).toBe(0);
  });

  it('ALREADY_OWNED → 409', async () => {
    const state = emptyState({ pieceMaster: { 5: { is_purchasable: 1 } } });
    const { app, env } = makeApp('u1', makeFakeDb(state));
    stubPlatform({
      products: [pieceProduct(5, 2)],
      purchase: { status: 409, body: { error_code: 'ALREADY_OWNED' } },
    });

    const res = await purchase(app, env, { piece_id: 5 });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: 'ALREADY_OWNED' });
  });

  it('Platform に INGOT 価格未登録（platform_configured=false） → 503 PRODUCT_NOT_CONFIGURED', async () => {
    const state = emptyState({ pieceMaster: { 5: { is_purchasable: 1 } } });
    const { app, env } = makeApp('u1', makeFakeDb(state));
    stubPlatform({ products: [pieceProduct(5, null)] }); // currency_prices なし

    const res = await purchase(app, env, { piece_id: 5 });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: 'PRODUCT_NOT_CONFIGURED' });
  });

  it('存在しない piece_id → 400（Platform 呼び出し前）', async () => {
    const state = emptyState();
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const fetchMock = stubPlatform({});
    const res = await purchase(app, env, { piece_id: 999 });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('購入不可コマ → 400', async () => {
    const state = emptyState({ pieceMaster: { 7: { is_purchasable: 0 } } });
    const { app, env } = makeApp('u1', makeFakeDb(state));
    stubPlatform({});
    const res = await purchase(app, env, { piece_id: 7 });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'NOT_PURCHASABLE' });
  });

  it('未認証（Bearer なし） → 401', async () => {
    const state = emptyState({ pieceMaster: { 5: { is_purchasable: 1 } } });
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const res = await purchase(app, env, { piece_id: 5 }, null);
    expect(res.status).toBe(401);
  });

  it('piece_id も product_id も無い → 400', async () => {
    const state = emptyState();
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const res = await purchase(app, env, {});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/shop/wallet（Platform 残高）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function getWallet(app: Hono<{ Variables: { userId: string } }>, env: unknown, token: string | null = 'user-token') {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    return app.request('/wallet', { headers }, env as Parameters<typeof app.request>[2]);
  }

  it('Platform の INGOT 残高を返す', async () => {
    const { app, env } = makeApp('u1', makeFakeDb(emptyState()));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/v1/commerce/currencies/football_chess_maniacs');
      expect((init?.headers as Headers).get('Authorization')).toBe('Bearer user-token');
      return new Response(JSON.stringify({ balances: [{ currency_code: 'INGOT', balance: 42 }] }), { status: 200 });
    }));

    const res = await getWallet(app, env);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ingots: 42 });
  });

  it('Platform 障害 → 502', async () => {
    const { app, env } = makeApp('u1', makeFakeDb(emptyState()));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const res = await getWallet(app, env);
    expect(res.status).toBe(502);
  });

  it('Bearer なし → 401', async () => {
    const { app, env } = makeApp('u1', makeFakeDb(emptyState()));
    const res = await getWallet(app, env, null);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/shop/catalog（Platform product マージ）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // catalog は piece_master を all() で返すため、専用フェイク D1 を使う
  function makeCatalogDb(rows: Array<{ piece_id: number; sku: string }>) {
    const stmt = (sql: string) => ({
      bind() { return this; },
      async first<T>(): Promise<T | null> {
        if (sql.includes('COUNT(*)')) return ({ total: rows.length } as T);
        return null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        if (sql.includes('FROM piece_master')) {
          return {
            results: rows.map((r) => ({
              piece_id: r.piece_id, sku: r.sku, name_ja: 'x', name_en: 'x', position: 'FW',
              cost: 2, era: 1, era_shelf: 1, family: null, nationality: 'JP', summary_ja: null, image_url: null,
            })) as T[],
          };
        }
        return { results: [] };
      },
    });
    return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
  }

  it('Platform product がある SKU は platform_configured=true・ingot_price 付き', async () => {
    const db = makeCatalogDb([{ piece_id: 5, sku: 'fcms_piece_005' }, { piece_id: 6, sku: 'fcms_piece_006' }]);
    const { app, env } = makeApp(null, db);
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ items: [pieceProduct(5, 2)] }), { status: 200 }),
    ));

    const res = await app.request('/catalog', {}, env);
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<Record<string, unknown>> };
    const p5 = data.items.find((i) => i.piece_id === 5)!;
    const p6 = data.items.find((i) => i.piece_id === 6)!;
    expect(p5).toMatchObject({ product_id: 'prod-fcms_piece_005', ingot_price: 2, is_on_sale: true, platform_configured: true });
    expect(p6).toMatchObject({ product_id: null, platform_configured: false });
  });

  it('Platform 取得失敗でも catalog は返る（platform_configured=false）', async () => {
    const db = makeCatalogDb([{ piece_id: 5, sku: 'fcms_piece_005' }]);
    const { app, env } = makeApp(null, db);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));

    const res = await app.request('/catalog', {}, env);
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<Record<string, unknown>> };
    expect(data.items[0]).toMatchObject({ platform_configured: false, product_id: null });
  });
});

describe('POST /api/shop/ingots', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('Platform product/priceでcheckoutを作成する', async () => {
    const { app, env } = makeApp('u1', makeFakeDb(emptyState()));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/v1/commerce/products')) {
        return new Response(JSON.stringify({
          items: [{
            product_id: 'prod-1',
            game_id: 'football_chess_maniacs',
            slug: 'ingot-5',
            title: 'INGOT x5',
            product_type: 'currency_pack',
            sale_status: 'on_sale',
            metadata: { currency_code: 'INGOT', amount: 5 },
            prices: [{
              price_id: 'price-1',
              product_id: 'prod-1',
              currency: 'JPY',
              amount_cents: 500,
              provider: 'stripe',
              is_active: true,
            }],
          }],
        }), { status: 200 });
      }
      if (url.includes('/v1/commerce/purchase')) {
        const headers = init?.headers as Headers;
        expect(headers.get('Authorization')).toBe('Bearer user-token');
        expect(headers.get('Idempotency-Key')).toBeTruthy();
        expect(JSON.parse(String(init?.body))).toMatchObject({
          product_id: 'prod-1',
          price_id: 'price-1',
          provider: 'stripe',
        });
        return new Response(JSON.stringify({
          purchase_id: 'purchase-1',
          checkout_url: 'https://checkout.example/session',
          status: 'pending',
        }), { status: 201 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/ingots', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer user-token',
      },
      body: JSON.stringify({ product_id: 'prod-1', price_id: 'price-1' }),
    }, env);

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      purchase_id: 'purchase-1',
      checkout_url: 'https://checkout.example/session',
    });
  });

  it('FCMS用INGOT商品が未登録なら503', async () => {
    const { app, env } = makeApp('u1', makeFakeDb(emptyState()));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));

    const res = await app.request('/ingots', {
      method: 'POST',
      headers: { authorization: 'Bearer user-token' },
      body: JSON.stringify({}),
    }, env);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: 'INGOT_PRODUCTS_NOT_CONFIGURED' });
  });
});
