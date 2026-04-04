// ============================================================
// replay.ts — リプレイAPI（§5-1 R2, §9-2）
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';

const replay = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();

// ── リプレイデータ取得（R2からJSON） ──
replay.get('/:matchId', async (c) => {
  const matchId = c.req.param('matchId');
  const userId = c.get('userId');

  // まずD1で試合の存在・参加権を確認
  const matchRecord = await c.env.DB.prepare(
    'SELECT id, home_user_id, away_user_id, status FROM matches WHERE id = ?',
  )
    .bind(matchId)
    .first<{ id: string; home_user_id: string; away_user_id: string; status: string }>();

  if (!matchRecord) {
    return c.json({ error: 'Match not found' }, 404);
  }

  // 完了した試合のみリプレイ可能
  if (matchRecord.status !== 'completed') {
    return c.json({ error: 'Match not yet completed' }, 400);
  }

  // R2からリプレイデータ取得
  const r2Key = `replays/${matchId}.json.gz`;
  const object = await c.env.R2.get(r2Key);

  if (!object) {
    return c.json({ error: 'Replay data not found' }, 404);
  }

  // gzip圧縮されたJSONをそのまま返す
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});

// ── リプレイ一覧（ユーザーの試合履歴からリプレイ可能なもの） ──
replay.get('/', async (c) => {
  const userId = c.get('userId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = parseInt(c.req.query('offset') ?? '0');

  const result = await c.env.DB.prepare(
    `SELECT id, home_user_id, away_user_id, score_home, score_away, created_at
     FROM matches
     WHERE status = 'completed'
       AND (home_user_id = ? OR away_user_id = ?)
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(userId, userId, limit, offset)
    .all();

  return c.json({ replays: result.results });
});

// ── 特定ターンのデータ取得 ──
replay.get('/:matchId/turn/:turn', async (c) => {
  const matchId = c.req.param('matchId');
  const turn = parseInt(c.req.param('turn'));

  if (isNaN(turn) || turn < 1) {
    return c.json({ error: 'Invalid turn number' }, 400);
  }

  // R2からターン単位のログ取得
  const r2Key = `replays/${matchId}/turn_${String(turn).padStart(3, '0')}.json`;
  const object = await c.env.R2.get(r2Key);

  if (!object) {
    return c.json({ error: 'Turn data not found' }, 404);
  }

  const data = await object.text();
  return c.json(JSON.parse(data));
});

export default replay;
