// ============================================================
// pieces.ts — コマ管理API（C10）
// user_pieces テーブル CRUD + 200枚上限
// ============================================================

import { Hono } from 'hono';

// D1Database型はグローバル（Cloudflare Workers）
interface Env {
  Bindings: {
    DB: D1Database;
  };
  Variables: {
    userId: string;
  };
}

const MAX_PIECES = 200;

const INITIAL_PIECES = [
  ...Array(2).fill({ piece_type: 'GK', cost: 1 }),
  ...Array(4).fill({ piece_type: 'DF', cost: 1 }),
  ...Array(3).fill({ piece_type: 'SB', cost: 1 }),
  ...Array(3).fill({ piece_type: 'VO', cost: 1 }),
  ...Array(4).fill({ piece_type: 'MF', cost: 1 }),
];

const piecesApp = new Hono<Env>();

/** GET /api/pieces — 所持コマ一覧 */
piecesApp.get('/', async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare(
    'SELECT * FROM user_pieces WHERE user_id = ? ORDER BY acquired_at DESC',
  ).bind(userId).all();
  return c.json({
    pieces: result.results ?? [],
    count: result.results?.length ?? 0,
    max: MAX_PIECES,
  });
});

/** GET /api/pieces/count — 所持数のみ */
piecesApp.get('/count', async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM user_pieces WHERE user_id = ?',
  ).bind(userId).first<{ cnt: number }>();
  return c.json({ count: result?.cnt ?? 0, max: MAX_PIECES });
});

/** POST /api/pieces — コマ追加（ショップ購入時） */
piecesApp.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ piece_type: string; cost: number; variant?: number }>();

  // 200枚上限チェック
  const countResult = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM user_pieces WHERE user_id = ?',
  ).bind(userId).first<{ cnt: number }>();
  if ((countResult?.cnt ?? 0) >= MAX_PIECES) {
    return c.json({ error: 'コマの上限(200枚)に達しています' }, 400);
  }

  const validTypes = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];
  if (!validTypes.includes(body.piece_type)) {
    return c.json({ error: '無効なポジション' }, 400);
  }
  const validCosts = [1, 1.5, 2, 2.5, 3];
  if (!validCosts.includes(body.cost)) {
    return c.json({ error: '無効なコスト' }, 400);
  }

  const variant = body.variant ?? Math.floor(Math.random() * 7) + 1;
  const now = new Date().toISOString();

  const result = await c.env.DB.prepare(
    'INSERT INTO user_pieces (user_id, piece_type, cost, variant, name, acquired_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(userId, body.piece_type, body.cost, variant, '', now).run();

  return c.json({ id: result.meta.last_row_id, piece_type: body.piece_type, cost: body.cost, variant }, 201);
});

/** DELETE /api/pieces/:id — コマ削除（売却） */
piecesApp.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM user_pieces WHERE id = ? AND user_id = ?',
  ).bind(id, userId).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'コマが見つかりません' }, 404);
  }
  return c.json({ ok: true });
});

/** PATCH /api/pieces/:id — コマ名変更 */
piecesApp.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json<{ name: string }>();

  if (typeof body.name !== 'string' || body.name.length > 20) {
    return c.json({ error: '名前は20文字以内' }, 400);
  }

  const result = await c.env.DB.prepare(
    'UPDATE user_pieces SET name = ? WHERE id = ? AND user_id = ?',
  ).bind(body.name, id, userId).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'コマが見つかりません' }, 404);
  }
  return c.json({ ok: true });
});

export default piecesApp;

/** 初期コマ投入（新規ユーザー作成時に呼ぶ） */
export async function seedInitialPieces(db: D1Database, userId: string) {
  const now = new Date().toISOString();
  const stmts = INITIAL_PIECES.map((p) =>
    db.prepare(
      'INSERT INTO user_pieces (user_id, piece_type, cost, variant, name, acquired_at) VALUES (?, ?, ?, 1, ?, ?)',
    ).bind(userId, p.piece_type, p.cost, '', now),
  );
  await db.batch(stmts);
}

/** D1スキーマ（手動実行用） */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  piece_type TEXT NOT NULL,
  cost REAL NOT NULL,
  variant INTEGER DEFAULT 1,
  name TEXT DEFAULT '',
  acquired_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_pieces_user_id ON user_pieces(user_id);

CREATE TABLE IF NOT EXISTS user_ratings (
  user_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  highest_rating INTEGER NOT NULL DEFAULT 1000,
  updated_at TEXT NOT NULL
);
`;
