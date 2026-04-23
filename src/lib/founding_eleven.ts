// ============================================================
// founding_eleven.ts — Founding Eleven (FC Grassroots) 自動付与
// 新規ユーザーに11枚の初期コマを付与する
// ============================================================

import { FOUNDING_ELEVEN_IDS } from '../types/piece';

/**
 * Founding Eleven を user_pieces_v2 に付与する。
 * INSERT OR IGNORE により冪等（二重呼び出し安全）。
 */
export async function grantFoundingEleven(
  db: D1Database,
  userId: string,
): Promise<{ granted: number }> {
  const now = new Date().toISOString();
  const stmts = FOUNDING_ELEVEN_IDS.map((pieceId) =>
    db
      .prepare(
        'INSERT OR IGNORE INTO user_pieces_v2 (user_id, piece_id, source, acquired_at) VALUES (?, ?, ?, ?)',
      )
      .bind(userId, pieceId, 'founding', now),
  );
  const results = await db.batch(stmts);
  const granted = results.filter((r) => r.meta.changes > 0).length;
  return { granted };
}

/**
 * ユーザーが Founding Eleven を保持しているか確認する。
 * 不足分がある場合は grantFoundingEleven で補完可能。
 */
export async function checkFoundingEleven(
  db: D1Database,
  userId: string,
): Promise<{ owned: number[]; missing: number[] }> {
  const placeholders = FOUNDING_ELEVEN_IDS.map(() => '?').join(',');
  const result = await db
    .prepare(
      `SELECT piece_id FROM user_pieces_v2 WHERE user_id = ? AND piece_id IN (${placeholders})`,
    )
    .bind(userId, ...FOUNDING_ELEVEN_IDS)
    .all<{ piece_id: number }>();

  const ownedSet = new Set(result.results.map((r) => r.piece_id));
  const owned = FOUNDING_ELEVEN_IDS.filter((id) => ownedSet.has(id));
  const missing = FOUNDING_ELEVEN_IDS.filter((id) => !ownedSet.has(id));
  return { owned: [...owned], missing: [...missing] };
}
