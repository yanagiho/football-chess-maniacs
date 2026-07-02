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

// ── 進行中マッチの棄権（リロード復帰バナーの「棄権する」用） ──
// GameSession DO に離脱を通知し、即座に不戦敗処理（endMatch reason=disconnect）を行う。
// （通知しなくてもDISCONNECT_GRACE_MS超過で同じ結果になるが、相手を30秒待たせない）
match.post('/:matchId/leave', async (c) => {
  const userId = c.get('userId');
  const matchId = c.req.param('matchId');
  if (!MATCH_ID_PATTERN.test(matchId)) {
    return c.json({ error: 'Invalid matchId format' }, 400);
  }

  // 参加者チェック（D1のマッチレコードで確認）
  const row = await c.env.DB.prepare(
    'SELECT id FROM matches WHERE id = ? AND (home_user_id = ? OR away_user_id = ?)',
  ).bind(matchId, userId, userId).first();
  if (!row) {
    return c.json({ error: 'Match not found' }, 404);
  }

  const doId = c.env.GAME_SESSION.idFromName(matchId);
  const stub = c.env.GAME_SESSION.get(doId);
  const res = await stub.fetch(new Request('https://do/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  }));
  return c.json(await res.json(), res.status as 200);
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

// ── フレンド対戦: 招待コード発行/参加 ──
// KV: friend_room:{roomId} = { hostUserId, hostTeamId, matchId?, createdAt } (TTL FRIEND_ROOM_TTL_SEC)
// isRatedMatch(server/rating.ts) は matchId が 'friend_' で始まる試合をレーティング対象外として扱う。
const FRIEND_ROOM_TTL_SEC = 600; // 10分（未参加なら失効）
const FRIEND_ROOM_ID_PATTERN = /^[A-Z0-9]{6}$/;
const FRIEND_ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい0/O, 1/I 除外

function generateFriendRoomId(): string {
  return Array.from({ length: 6 }, () => FRIEND_ROOM_ID_CHARS[Math.floor(Math.random() * FRIEND_ROOM_ID_CHARS.length)]).join('');
}

interface FriendRoom {
  hostUserId: string;
  hostTeamId: string;
  matchId?: string;
  createdAt: number;
}

// 招待する側: ルーム作成（既存IDと衝突したら最大5回まで再抽選）
match.post('/friend/create', async (c) => {
  const userId = c.get('userId');
  let body: { teamId?: string };
  try {
    body = await c.req.json() as { teamId?: string };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  let roomId = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateFriendRoomId();
    const existing = await c.env.KV.get(`friend_room:${candidate}`);
    if (!existing) {
      roomId = candidate;
      break;
    }
  }
  if (!roomId) {
    return c.json({ error: 'Failed to allocate room id' }, 500);
  }

  const room: FriendRoom = {
    hostUserId: userId,
    hostTeamId: body.teamId ?? 'default',
    createdAt: Date.now(),
  };
  await c.env.KV.put(`friend_room:${roomId}`, JSON.stringify(room), { expirationTtl: FRIEND_ROOM_TTL_SEC });

  return c.json({ roomId, expiresInSec: FRIEND_ROOM_TTL_SEC });
});

// 招待する側: 参加待ちポーリング（参加者がいればmatchIdを返しルームを消費する）
match.get('/friend/status/:roomId', async (c) => {
  const userId = c.get('userId');
  const roomId = c.req.param('roomId');
  if (!FRIEND_ROOM_ID_PATTERN.test(roomId)) {
    return c.json({ error: 'Invalid room id' }, 400);
  }

  const raw = await c.env.KV.get(`friend_room:${roomId}`);
  if (!raw) {
    return c.json({ matched: false, expired: true });
  }
  const room = JSON.parse(raw) as FriendRoom;
  if (room.hostUserId !== userId) {
    return c.json({ error: 'Not the room host' }, 403);
  }
  if (!room.matchId) {
    return c.json({ matched: false });
  }

  await c.env.KV.delete(`friend_room:${roomId}`);
  return c.json({ matched: true, matchId: room.matchId, team: 'home' as const });
});

// 参加する側: ルームコードでGameSession DOを作成し合流する
match.post('/friend/join', async (c) => {
  const userId = c.get('userId');
  let body: { roomId?: string; teamId?: string };
  try {
    body = await c.req.json() as { roomId?: string; teamId?: string };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const roomId = (body.roomId ?? '').toUpperCase();
  if (!FRIEND_ROOM_ID_PATTERN.test(roomId)) {
    return c.json({ error: 'INVALID_ROOM_ID' }, 400);
  }

  const kvKey = `friend_room:${roomId}`;
  const raw = await c.env.KV.get(kvKey);
  if (!raw) {
    return c.json({ error: 'ROOM_NOT_FOUND' }, 404);
  }
  const room = JSON.parse(raw) as FriendRoom;
  if (room.matchId) {
    return c.json({ error: 'ROOM_ALREADY_USED' }, 409);
  }
  if (room.hostUserId === userId) {
    return c.json({ error: 'CANNOT_JOIN_OWN_ROOM' }, 400);
  }

  const matchId = `friend_${crypto.randomUUID()}`;
  const doId = c.env.GAME_SESSION.idFromName(matchId);
  const stub = c.env.GAME_SESSION.get(doId);
  const initRes = await stub.fetch(new Request('https://do/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      matchId,
      homeUserId: room.hostUserId,
      awayUserId: userId,
      homeTeamId: room.hostTeamId,
      awayTeamId: body.teamId ?? 'default',
    }),
  }));
  if (!initRes.ok) {
    const errBody = await initRes.text();
    return c.json({ error: 'Failed to initialize session', detail: errBody }, 500);
  }

  await c.env.DB.prepare(
    'INSERT INTO matches (id, home_user_id, away_user_id, status, score_home, score_away, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)',
  )
    .bind(matchId, room.hostUserId, userId, 'playing', new Date().toISOString())
    .run();

  // ホストのポーリング用にmatchIdを書き戻す（残りTTLは短縮し、参加後の放置滞留を防ぐ）
  await c.env.KV.put(kvKey, JSON.stringify({ ...room, matchId }), { expirationTtl: 60 });

  return c.json({ matchId, team: 'away' as const });
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
