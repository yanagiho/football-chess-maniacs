// ============================================================
// ranking.ts — ランキング（リーダーボード）API
// GET /api/ranking  — user_ratings 由来の総合ランキング + 自分の順位
// レーティングは試合結果キューで永続化される（server/rating.ts persistRatings）。
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';

const ranking = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();

/** D1 から取得する1行 */
export interface RatingRow {
  user_id: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  display_name?: string | null;
}

/** クライアントに返す1件 */
export interface RankEntry {
  rank: number;
  user_id: string;
  name: string;
  elo: number;
  wins: number;
  draws: number;
  losses: number;
}

/** 表示名: display_name があればそれ、無ければ userId 先頭6文字の匿名表記 */
export function rankName(row: RatingRow): string {
  const dn = row.display_name?.trim();
  return dn && dn.length > 0 ? dn : `Player ${row.user_id.slice(0, 6)}`;
}

/** RatingRow[] → 順位付き RankEntry[]（baseRank 始まりで採番） */
export function buildRankEntries(rows: RatingRow[], baseRank = 1): RankEntry[] {
  return rows.map((r, i) => ({
    rank: baseRank + i,
    user_id: r.user_id,
    name: rankName(r),
    elo: r.rating,
    wins: r.wins,
    draws: r.draws,
    losses: r.losses,
  }));
}

const TOP_LIMIT = 50;

/**
 * GET /api/ranking
 * { top: RankEntry[]（上位50）, me: RankEntry | null（自分の順位。未対戦なら null） }
 */
ranking.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.env.DB;

  // 上位ランキング（COM除外・対戦済みのみ・レート降順）
  const topRes = await db
    .prepare(
      `SELECT r.user_id, r.rating, r.wins, r.losses, r.draws, d.display_name
       FROM user_ratings r
       LEFT JOIN user_display_name_cache d ON d.user_id = r.user_id
       WHERE r.user_id NOT LIKE 'com_%' AND r.games > 0
       ORDER BY r.rating DESC, r.user_id ASC
       LIMIT ?`,
    )
    .bind(TOP_LIMIT)
    .all<RatingRow>();

  const top = buildRankEntries(topRes.results ?? []);

  // 自分の順位
  let me: RankEntry | null = null;
  if (userId) {
    const myRow = await db
      .prepare(
        `SELECT r.user_id, r.rating, r.wins, r.losses, r.draws, d.display_name
         FROM user_ratings r
         LEFT JOIN user_display_name_cache d ON d.user_id = r.user_id
         WHERE r.user_id = ?`,
      )
      .bind(userId)
      .first<RatingRow>();

    if (myRow) {
      const higher = await db
        .prepare(
          `SELECT COUNT(*) AS c FROM user_ratings
           WHERE rating > ? AND user_id NOT LIKE 'com_%' AND games > 0`,
        )
        .bind(myRow.rating)
        .first<{ c: number }>();
      const myRank = (higher?.c ?? 0) + 1;
      me = buildRankEntries([myRow], myRank)[0];
    }
  }

  return c.json({ top, me });
});

export default ranking;
