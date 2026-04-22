// ============================================================
// match.ts — マッチングAPI（§4-2）
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';

import { MATCH_ID_PATTERN } from '../middleware/crypto_utils';

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
  if (!MATCH_ID_PATTERN.test(matchId)) {
    return c.json({ error: 'Invalid matchId format' }, 400);
  }

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
  const limit = Math.max(1, Math.min(parseInt(c.req.query('limit') ?? '20') || 20, 100));
  const offset = Math.max(0, parseInt(c.req.query('offset') ?? '0') || 0);

  const result = await c.env.DB.prepare(
    'SELECT id, home_user_id, away_user_id, status, score_home, score_away, created_at FROM matches WHERE home_user_id = ? OR away_user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(userId, userId, limit, offset)
    .all();

  return c.json({ matches: result.results });
});

// ── COM対戦セッション作成（サーバーサイドAI用） ──
// VITE_USE_GEMMA=true 時に Matching.tsx から呼ばれる
// GameSession DO を作成し /init を COM パラメータ付きで呼び出す
match.post('/com', async (c) => {
  let body: { comDifficulty?: string; comEra?: string };
  try {
    body = await c.req.json() as { comDifficulty?: string; comEra?: string };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const randomSuffix = crypto.randomUUID().slice(0, 12);
  const matchId = `gemma_com_${Date.now()}_${randomSuffix}`;
  const userId = `com_player_${randomSuffix}`;
  // セッショントークン: WebSocket認証に使用（推測不能なランダム値）
  const sessionToken = crypto.randomUUID();

  // GameSession DO を作成
  const doId = c.env.GAME_SESSION.idFromName(matchId);
  const stub = c.env.GAME_SESSION.get(doId);

  // /init を呼び出して COM パラメータを設定
  const initRes = await stub.fetch(new Request('https://do/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matchId,
      homeUserId: userId,
      awayUserId: 'com_ai',
      isComMatch: true,
      comSessionToken: sessionToken,
      comDifficulty: body.comDifficulty ?? 'regular',
      comEra: body.comEra ?? '現代',
    }),
  }));

  if (!initRes.ok) {
    const errBody = await initRes.text();
    return c.json({ error: 'Failed to initialize COM session', detail: errBody }, 500);
  }

  return c.json({ matchId, userId, team: 'home' as const, token: sessionToken });
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
  if (!MATCH_ID_PATTERN.test(matchId)) {
    return c.text('Invalid matchId format', 400);
  }
  const doId = c.env.GAME_SESSION.idFromName(matchId);
  const stub = c.env.GAME_SESSION.get(doId);

  // DOにリクエスト転送（JWT検証はDO内で実行）
  return stub.fetch(c.req.raw);
});

export default match;
