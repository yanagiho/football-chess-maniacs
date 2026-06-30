import { describe, expect, it } from 'vitest';
import webhooks from '../webhooks';
import type { Env } from '../../worker';

type Delivery = { delivery_id: string; event_type: string; received_at: string; processed: number; result: string | null };

class MockStatement {
  private args: unknown[] = [];

  constructor(private db: MockD1Database, private sql: string) {}

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    if (this.sql.includes('FROM webhook_deliveries_received')) {
      const delivery = this.db.deliveries.get(String(this.args[0]));
      if (!delivery) return null;
      if (this.sql.includes('SELECT processed, result')) {
        return { processed: delivery.processed, result: delivery.result } as T;
      }
      return { delivery_id: delivery.delivery_id } as T;
    }

    if (this.sql.includes('FROM piece_master')) {
      const pieceId = Number(this.args[0]);
      return this.db.pieceMaster.has(pieceId) ? ({ piece_id: pieceId } as T) : null;
    }

    return null;
  }

  async run(): Promise<D1Result> {
    if (this.sql.includes('INSERT OR IGNORE INTO webhook_deliveries_received')) {
      const deliveryId = String(this.args[0]);
      if (this.db.deliveries.has(deliveryId)) {
        return { success: true, meta: { changes: 0 } } as D1Result;
      }
      this.db.deliveries.set(deliveryId, {
        delivery_id: deliveryId,
        event_type: String(this.args[1]),
        received_at: String(this.args[2]),
        processed: Number(this.args[3] ?? 0),
        result: String(this.args[4] ?? 'processing'),
      });
      return { success: true, meta: { changes: 1 } } as D1Result;
    }

    if (this.sql.includes('UPDATE webhook_deliveries_received')) {
      const result = String(this.args[0]);
      const deliveryId = String(this.args[1]);
      const delivery = this.db.deliveries.get(deliveryId);
      if (delivery) {
        delivery.processed = 1;
        delivery.result = result;
      }
      return { success: true, meta: { changes: delivery ? 1 : 0 } } as D1Result;
    }

    if (this.sql.includes('INSERT INTO user_wallets')) {
      const userId = String(this.args[0]);
      if (this.sql.includes('MAX(ingots - ?')) {
        const amount = Number(this.args[2]);
        this.db.wallets.set(userId, Math.max((this.db.wallets.get(userId) ?? 0) - amount, 0));
      } else {
        const amount = Number(this.args[1]);
        this.db.wallets.set(userId, (this.db.wallets.get(userId) ?? 0) + amount);
      }
      return { success: true, meta: { changes: 1 } } as D1Result;
    }

    if (this.sql.includes('INSERT OR IGNORE INTO user_pieces_v2')) {
      const key = `${String(this.args[0])}:${Number(this.args[1])}`;
      const before = this.db.userPieces.size;
      this.db.userPieces.add(key);
      return { success: true, meta: { changes: this.db.userPieces.size === before ? 0 : 1 } } as D1Result;
    }

    if (this.sql.includes('DELETE FROM user_pieces_v2')) {
      const key = `${String(this.args[0])}:${Number(this.args[1])}`;
      const deleted = this.db.userPieces.delete(key);
      return { success: true, meta: { changes: deleted ? 1 : 0 } } as D1Result;
    }

    return { success: true, meta: { changes: 0 } } as D1Result;
  }
}

class MockD1Database {
  deliveries = new Map<string, Delivery>();
  wallets = new Map<string, number>();
  userPieces = new Set<string>();
  pieceMaster = new Set<number>([1]);

  prepare(sql: string) {
    return new MockStatement(this, sql);
  }
}

class MockKVNamespace {
  deleted: string[] = [];
  async delete(key: string) {
    this.deleted.push(key);
  }
}

function env(db = new MockD1Database(), kv = new MockKVNamespace()): Env['Bindings'] {
  return {
    DB: db,
    KV: kv,
    PLATFORM_HMAC_SECRET: 'secret',
  } as unknown as Env['Bindings'];
}

async function hmac(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signedRequest(
  payload: unknown,
  deliveryId = 'delivery-1',
  envBindings: Env['Bindings'] = env(),
) {
  const body = JSON.stringify(payload);
  return webhooks.request('/purchase', {
    method: 'POST',
    headers: {
      'X-Webhook-Signature': `sha256=${await hmac(body)}`,
      'X-Webhook-Delivery-Id': deliveryId,
      'Content-Type': 'application/json',
    },
    body,
  }, envBindings);
}

describe('webhook purchase idempotency', () => {
  it('署名不正は401でdeliveryを記録しない', async () => {
    const db = new MockD1Database();
    const body = JSON.stringify({ event_type: 'entitlement.created', data: { user_id: 'u1', sku: 'fcms_ingots_standard' } });
    const res = await webhooks.request('/purchase', {
      method: 'POST',
      headers: { 'X-Webhook-Signature': 'sha256=00', 'X-Webhook-Delivery-Id': 'bad-1' },
      body,
    }, env(db));

    expect(res.status).toBe(401);
    expect(db.deliveries.size).toBe(0);
  });

  it('Delivery-Id 欠落は400', async () => {
    const body = JSON.stringify({ event_type: 'entitlement.created', data: { user_id: 'u1', sku: 'fcms_ingots_standard' } });
    const res = await webhooks.request('/purchase', {
      method: 'POST',
      headers: { 'X-Webhook-Signature': `sha256=${await hmac(body)}` },
      body,
    }, env());
    expect(res.status).toBe(400);
  });

  it('同じ Delivery-Id の2回目は副作用なしでduplicate', async () => {
    const db = new MockD1Database();
    const bindings = env(db);
    const payload = { event_type: 'entitlement.created', data: { user_id: 'u1', sku: 'fcms_ingots_standard' } };

    expect((await signedRequest(payload, 'dup-1', bindings)).status).toBe(200);
    const second = await signedRequest(payload, 'dup-1', bindings);

    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ok: true, duplicate: true });
    expect(db.wallets.get('u1')).toBe(5);
  });

  it('ingot SKU の同一 Delivery-Id 二重送信でingotsが1回分しか増えない', async () => {
    const db = new MockD1Database();
    const bindings = env(db);
    const payload = { event_type: 'entitlement.created', data: { user_id: 'u1', sku: 'fcms_ingots_plus' } };

    await signedRequest(payload, 'ingot-1', bindings);
    await signedRequest(payload, 'ingot-1', bindings);

    expect(db.wallets.get('u1')).toBe(12);
  });

  it('currency.granted でINGOTウォレットが加算される', async () => {
    const db = new MockD1Database();
    const bindings = env(db);
    const payload = {
      event_type: 'currency.granted',
      game_id: 'football_chess_maniacs',
      data: { user_id: 'u1', currency_code: 'INGOT', amount: 5, ledger_id: 'ledger-1' },
    };

    const res = await signedRequest(payload, 'currency-1', bindings);

    expect(res.status).toBe(200);
    expect(db.wallets.get('u1')).toBe(5);
  });

  it('currency.revoked でINGOTウォレットが0未満にならない', async () => {
    const db = new MockD1Database();
    db.wallets.set('u1', 3);
    const bindings = env(db);
    const payload = {
      event_type: 'currency.revoked',
      game_id: 'football_chess_maniacs',
      data: { user_id: 'u1', currency_code: 'INGOT', amount: 5, ledger_id: 'ledger-1' },
    };

    const res = await signedRequest(payload, 'currency-revoke-1', bindings);

    expect(res.status).toBe(200);
    expect(db.wallets.get('u1')).toBe(0);
  });

  it('piece SKU の同一 Delivery-Id 二重送信でuser_pieces_v2が1回しか変わらない', async () => {
    const db = new MockD1Database();
    const bindings = env(db);
    const payload = { event_type: 'entitlement.created', data: { user_id: 'u1', sku: 'fcms_piece_001', entitlement_id: 'ent-1' } };

    await signedRequest(payload, 'piece-1', bindings);
    await signedRequest(payload, 'piece-1', bindings);

    expect(db.userPieces.has('u1:1')).toBe(true);
    expect(db.userPieces.size).toBe(1);
  });

  it('entitlement.revoked の重複送信も安全', async () => {
    const db = new MockD1Database();
    db.userPieces.add('u1:1');
    const bindings = env(db);
    const payload = { event_type: 'entitlement.revoked', data: { user_id: 'u1', sku: 'fcms_piece_001', entitlement_id: 'ent-1' } };

    await signedRequest(payload, 'revoke-1', bindings);
    await signedRequest(payload, 'revoke-1', bindings);

    expect(db.userPieces.has('u1:1')).toBe(false);
    expect(db.deliveries.get('revoke-1')?.processed).toBe(1);
  });
});
