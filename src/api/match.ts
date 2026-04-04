// ============================================================
// match.ts — マッチングAPI（§4-2）
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';

const match = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();

/** リージョン判定（クライアントのCFヘッダーから） */
function resolveRegion(country: string | undefined): string {
  if (!country) return 'europe';

  const asiaCountries = new Set([
    'JP', 'KR', 'CN', 'TW', 'HK', 'SG', 'TH', 'VN', 'PH', 'MY',
    'ID', 'IN', 'AU', 'NZ',
  ]);
  const americasCountries = new Set([
    'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE',
  ]);

  if (asiaCountries.has(country)) return 'asia';
  if (americasCountries.has(country)) return 'americas';
  return 'europe';
}

// ── マッチメイキング開始（WebSocket upgrade）──
match.get('/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  // §7-2: upgradeハンドラでJWT検証
  const token = c.req.query('token');
  if (!token) {
    return c.text('Missing token', 401);
  }

  // JWTはDO内で検証（upgradeを拒否可能にするため）
  const country = c.req.header('CF-IPCountry') ?? undefined;
  const region = resolveRegion(country);
  const shardId = `matchmaking:${region}`;

  const doId = c.env.MATCHMAKING.idFromName(shardId);
  const stub = c.env.MATCHMAKING.get(doId);

  // トークンとリージョン情報をDOに転送
  const url = new URL(c.req.url);
  url.searchParams.set('token', token);
  url.searchParams.set('region', region);

  return stub.fetch(url.toString(), c.req.raw);
});

// ── マッチ状態取得（REST） ──
match.get('/:matchId', async (c) => {
  const userId = c.get('userId');
  const matchId = c.req.param('matchId');

  const result = await c.env.DB.prepare(
    'SELECT id, home_user_id, away_user_id, status, score_home, score_away, created_at FROM matches WHERE id = ? AND (home_user_id = ? OR away_user_id = ?)',
  )
    .bind(matchId, userId, userId)
    .first();

  if (!result) {
    return c.json({ error: 'Match not found' }, 404);
  }

  return c.json(result);
});

// ── マッチ履歴取得 ──
match.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');

  const result = await c.env.DB.prepare(
    'SELECT id, home_user_id, away_user_id, status, score_home, score_away, created_at FROM matches WHERE home_user_id = ? OR away_user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(userId, userId, limit, offset)
    .all();

  return c.json({ matches: result.results });
});

// ── ゲームセッションWebSocket接続 ──
match.get('/:matchId/ws', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  // §7-2: upgradeハンドラでJWT検証
  const token = c.req.query('token');
  if (!token) {
    return c.text('Missing token', 401);
  }

  const matchId = c.req.param('matchId');
  const doId = c.env.GAME_SESSION.idFromName(matchId);
  const stub = c.env.GAME_SESSION.get(doId);

  // DOにリクエスト転送（JWT検証はDO内で実行）
  return stub.fetch(c.req.raw);
});

export default match;
