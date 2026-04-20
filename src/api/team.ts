// ============================================================
// team.ts — チーム編成API（§5-1 D1）
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';
import { getOwnedPieces } from './auth';

const team = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();

/** チーム編成レコード */
interface TeamComposition {
  id: string;
  user_id: string;
  name: string;
  /** フィールドコマ（JSON文字列） */
  field_pieces: string;
  /** ベンチコマ（JSON文字列） */
  bench_pieces: string;
  created_at: string;
  updated_at: string;
}

interface FieldPiece {
  piece_id: string;
  position: string;
  cost: number;
}

// ── チーム一覧取得 ──
team.get('/', async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare(
    'SELECT id, name, field_pieces, bench_pieces, updated_at FROM teams WHERE user_id = ? ORDER BY updated_at DESC',
  )
    .bind(userId)
    .all<TeamComposition>();

  return c.json({
    teams: result.results.map((t) => {
      try {
        return {
          id: t.id,
          name: t.name,
          fieldPieces: JSON.parse(t.field_pieces),
          benchPieces: JSON.parse(t.bench_pieces),
          updatedAt: t.updated_at,
        };
      } catch {
        return { id: t.id, name: t.name, fieldPieces: [], benchPieces: [], updatedAt: t.updated_at };
      }
    }),
  });
});

// ── チーム取得 ──
team.get('/:teamId', async (c) => {
  const userId = c.get('userId');
  const teamId = c.req.param('teamId');

  const result = await c.env.DB.prepare(
    'SELECT * FROM teams WHERE id = ? AND user_id = ?',
  )
    .bind(teamId, userId)
    .first<TeamComposition>();

  if (!result) {
    return c.json({ error: 'Team not found' }, 404);
  }

  try {
    return c.json({
      id: result.id,
      name: result.name,
      fieldPieces: JSON.parse(result.field_pieces),
      benchPieces: JSON.parse(result.bench_pieces),
      updatedAt: result.updated_at,
    });
  } catch {
    return c.json({ error: 'Corrupted team data' }, 500);
  }
});

// ── チーム作成 ──
team.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    name: string;
    fieldPieces: FieldPiece[];
    benchPieces: FieldPiece[];
  }>();

  // バリデーション
  if (!body.name || body.name.length > 50) {
    return c.json({ error: 'Invalid team name' }, 400);
  }

  if (!body.fieldPieces || body.fieldPieces.length !== 11) {
    return c.json({ error: 'Field must have exactly 11 pieces' }, 400);
  }

  // フィールド総コスト16以下チェック
  const totalCost = body.fieldPieces.reduce((sum, p) => sum + p.cost, 0);
  if (totalCost > 16) {
    return c.json({ error: 'Field cost exceeds 16' }, 400);
  }

  // GK1枚チェック
  const gkCount = body.fieldPieces.filter(p => p.position === 'GK').length;
  if (gkCount !== 1) {
    return c.json({ error: 'Field must have exactly 1 GK' }, 400);
  }

  // 所持コマ検証（プラットフォームAPI経由）
  const { pieces: owned } = await getOwnedPieces(c.env, userId);
  const ownedIds = new Set(owned.map((p) => p.piece_master_id));
  const allPieceIds = [...body.fieldPieces, ...body.benchPieces].map((p) => p.piece_id);
  for (const pid of allPieceIds) {
    if (!ownedIds.has(pid)) {
      return c.json({ error: `Piece ${pid} not owned` }, 400);
    }
  }

  const teamId = `team_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'INSERT INTO teams (id, user_id, name, field_pieces, bench_pieces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(teamId, userId, body.name, JSON.stringify(body.fieldPieces), JSON.stringify(body.benchPieces), now, now)
    .run();

  return c.json({ id: teamId }, 201);
});

// ── チーム更新 ──
team.put('/:teamId', async (c) => {
  const userId = c.get('userId');
  const teamId = c.req.param('teamId');
  const body = await c.req.json<{
    name?: string;
    fieldPieces?: FieldPiece[];
    benchPieces?: FieldPiece[];
  }>();

  // 所有権チェック
  const existing = await c.env.DB.prepare(
    'SELECT id FROM teams WHERE id = ? AND user_id = ?',
  )
    .bind(teamId, userId)
    .first();

  if (!existing) {
    return c.json({ error: 'Team not found' }, 404);
  }

  if (body.fieldPieces) {
    if (body.fieldPieces.length !== 11) {
      return c.json({ error: 'Field must have exactly 11 pieces' }, 400);
    }
    const totalCost = body.fieldPieces.reduce((sum, p) => sum + p.cost, 0);
    if (totalCost > 16) {
      return c.json({ error: 'Field cost exceeds 16' }, 400);
    }
    // GK1枚チェック（Bug 23も合わせて修正）
    const gkCount = body.fieldPieces.filter(p => p.position === 'GK').length;
    if (gkCount !== 1) {
      return c.json({ error: 'Field must have exactly 1 GK' }, 400);
    }
  }

  // 所持コマ検証（Bug 19: PUT時にも所持チェック）
  if (body.fieldPieces || body.benchPieces) {
    const { pieces: owned } = await getOwnedPieces(c.env, userId);
    const ownedIds = new Set(owned.map(p => p.piece_master_id));
    const allPieceIds = [
      ...(body.fieldPieces ?? []),
      ...(body.benchPieces ?? []),
    ].map(p => p.piece_id);
    for (const pid of allPieceIds) {
      if (!ownedIds.has(pid)) {
        return c.json({ error: `Piece ${pid} not owned` }, 400);
      }
    }
  }

  const now = new Date().toISOString();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    values.push(body.name);
  }
  if (body.fieldPieces) {
    updates.push('field_pieces = ?');
    values.push(JSON.stringify(body.fieldPieces));
  }
  if (body.benchPieces) {
    updates.push('bench_pieces = ?');
    values.push(JSON.stringify(body.benchPieces));
  }
  updates.push('updated_at = ?');
  values.push(now);
  values.push(teamId);
  values.push(userId);

  await c.env.DB.prepare(
    `UPDATE teams SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
  )
    .bind(...values)
    .run();

  return c.json({ ok: true });
});

// ── チーム削除 ──
team.delete('/:teamId', async (c) => {
  const userId = c.get('userId');
  const teamId = c.req.param('teamId');

  const result = await c.env.DB.prepare(
    'DELETE FROM teams WHERE id = ? AND user_id = ?',
  )
    .bind(teamId, userId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Team not found' }, 404);
  }

  return c.json({ ok: true });
});

export default team;
