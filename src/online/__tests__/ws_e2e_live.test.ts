// ============================================================
// ws_e2e_live.test.ts — WebSocket E2Eテスト（wrangler dev接続）
//
// 前提: `cd src && wrangler dev --local` が localhost:8787 で起動中
// 実行: LIVE_E2E=1 npx vitest run src/online/__tests__/ws_e2e_live.test.ts
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = 'http://localhost:8787';
const WS_BASE = 'ws://localhost:8787';
const IS_LIVE = process.env.LIVE_E2E === '1';

interface Session {
  matchId: string;
  userId: string;
  team: string;
  token: string;
}

type Msg = { type: string; [key: string]: unknown };

async function createComSession(difficulty = 'beginner'): Promise<Session> {
  const res = await fetch(`${BASE_URL}/match/com`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comDifficulty: difficulty }),
  });
  if (!res.ok) throw new Error(`POST /match/com failed: ${res.status}`);
  return res.json() as Promise<Session>;
}

function connectWs(url: string): Promise<{
  ws: WebSocket;
  messages: Msg[];
  waitForMessage: (type: string, timeoutMs?: number) => Promise<Msg>;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: Msg[] = [];
    const waiters: Array<{ type: string; resolve: (v: Msg) => void; timer: ReturnType<typeof setTimeout> }> = [];

    ws.addEventListener('message', (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : String(ev.data);
      let data: Msg;
      try { data = JSON.parse(raw); } catch { return; }
      messages.push(data);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (data.type === waiters[i].type) {
          clearTimeout(waiters[i].timer);
          waiters[i].resolve(data);
          waiters.splice(i, 1);
        }
      }
    });

    ws.addEventListener('open', () => {
      resolve({
        ws,
        messages,
        waitForMessage(type: string, timeoutMs = 10000) {
          // Find unprocessed message of this type
          const idx = messages.findIndex(m => m.type === type);
          if (idx >= 0) {
            const found = messages[idx];
            messages.splice(idx, 1);
            return Promise.resolve(found);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const wi = waiters.findIndex(w => w.type === type);
              if (wi >= 0) waiters.splice(wi, 1);
              rej(new Error(`Timeout waiting for ${type} (${timeoutMs}ms)`));
            }, timeoutMs);
            waiters.push({ type, resolve: (v) => { messages.splice(messages.indexOf(v), 1); res(v); }, timer });
          });
        },
        close() { ws.close(); },
      });
    });

    ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
  });
}

function makeTurnInput(session: Session, turn: number, seq: number) {
  return {
    type: 'TURN_INPUT',
    match_id: session.matchId,
    turn,
    player_id: session.userId,
    sequence: seq,
    nonce: crypto.randomUUID(),
    timestamp: Date.now(),
    client_hash: 'e2e_test',
    orders: [],
  };
}

// Skip all if not running in live mode
describe.skipIf(!IS_LIVE)('WebSocket E2E (wrangler dev)', () => {

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.ok).toBe(true);
  });

  it('COM対戦: セッション作成→WS接続→ターン入力→結果受信', async () => {
    const session = await createComSession();
    expect(session.matchId).toMatch(/^gemma_com_/);

    const client = await connectWs(`${WS_BASE}/match/${session.matchId}/ws?token=${session.token}`);

    client.ws.send(JSON.stringify(makeTurnInput(session, 1, 0)));

    const accepted = await client.waitForMessage('INPUT_ACCEPTED', 5000);
    expect(accepted.turn).toBe(1);

    const result = await client.waitForMessage('TURN_RESULT', 15000);
    expect(result.turn).toBe(2);
    expect(result.board).toBeTruthy();
    expect(Array.isArray(result.events)).toBe(true);

    client.close();
  }, 20000);

  it('COM対戦: 3ターン連続進行', async () => {
    const session = await createComSession();
    const client = await connectWs(`${WS_BASE}/match/${session.matchId}/ws?token=${session.token}`);

    for (let turn = 1; turn <= 3; turn++) {
      client.ws.send(JSON.stringify(makeTurnInput(session, turn, turn - 1)));

      await client.waitForMessage('INPUT_ACCEPTED', 5000);
      const result = await client.waitForMessage('TURN_RESULT', 15000);
      expect(result.turn).toBe(turn + 1);
      expect(Array.isArray(result.events)).toBe(true);
    }

    client.close();
  }, 60000);

  it('PING → PONGが返る', async () => {
    const session = await createComSession();
    const client = await connectWs(`${WS_BASE}/match/${session.matchId}/ws?token=${session.token}`);

    client.ws.send(JSON.stringify({ type: 'PING' }));
    const pong = await client.waitForMessage('PONG', 3000);
    expect(pong.timestamp).toBeGreaterThan(0);

    client.close();
  }, 10000);

  it('不正なCOMトークンでWebSocket接続拒否', async () => {
    const session = await createComSession();

    // WebSocket接続で偽トークンを使用 → onerrorで拒否される
    await expect(
      connectWs(`${WS_BASE}/match/${session.matchId}/ws?token=fake_invalid_token`),
    ).rejects.toThrow();
  }, 10000);

  it('不正JSONでERROR返信', async () => {
    const session = await createComSession();
    const client = await connectWs(`${WS_BASE}/match/${session.matchId}/ws?token=${session.token}`);

    client.ws.send('not json');
    const err = await client.waitForMessage('ERROR', 3000);
    expect(String(err.message)).toContain('Invalid JSON');

    client.close();
  }, 10000);

  it('不明なメッセージタイプでERROR返信', async () => {
    const session = await createComSession();
    const client = await connectWs(`${WS_BASE}/match/${session.matchId}/ws?token=${session.token}`);

    client.ws.send(JSON.stringify({ type: 'UNKNOWN_TYPE' }));
    const err = await client.waitForMessage('ERROR', 3000);
    expect(String(err.message)).toContain('Unknown message type');

    client.close();
  }, 10000);

  it('nonce重複でINPUT_REJECTED', async () => {
    const session = await createComSession();
    const client = await connectWs(`${WS_BASE}/match/${session.matchId}/ws?token=${session.token}`);

    const nonce = crypto.randomUUID();

    // 1回目: 正常
    client.ws.send(JSON.stringify({ ...makeTurnInput(session, 1, 0), nonce }));
    await client.waitForMessage('INPUT_ACCEPTED', 5000);
    await client.waitForMessage('TURN_RESULT', 15000);

    // 2回目: 同じnonce（リプレイ攻撃）
    client.ws.send(JSON.stringify({ ...makeTurnInput(session, 2, 1), nonce }));
    const rejected = await client.waitForMessage('INPUT_REJECTED', 5000);
    expect(rejected.type).toBe('INPUT_REJECTED');
    // violations = [{order, rule, reason}]
    const violations = rejected.violations as Array<{ reason: string }>;
    expect(violations.some(v => v.reason.toLowerCase().includes('nonce'))).toBe(true);

    client.close();
  }, 30000);

  it('sequence非単調増加でINPUT_REJECTED', async () => {
    const session = await createComSession();
    const client = await connectWs(`${WS_BASE}/match/${session.matchId}/ws?token=${session.token}`);

    // sequence=0（正常、lastSeq=-1 → 0 = -1+1 ✓）
    client.ws.send(JSON.stringify(makeTurnInput(session, 1, 0)));
    await client.waitForMessage('INPUT_ACCEPTED', 5000);
    await client.waitForMessage('TURN_RESULT', 15000);

    // sequence=5（不正、lastSeq=0 → 5 !== 0+1）
    client.ws.send(JSON.stringify(makeTurnInput(session, 2, 5)));
    const rejected = await client.waitForMessage('INPUT_REJECTED', 5000);
    expect(rejected.type).toBe('INPUT_REJECTED');
    const violations = rejected.violations as Array<{ reason: string }>;
    expect(violations.some(v => v.reason.includes('sequence'))).toBe(true);

    client.close();
  }, 30000);
});
