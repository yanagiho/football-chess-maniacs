// ============================================================
// rating.ts — Elo レーティングシステム（C5）
// 初期1000, K=30, 変動幅±15〜±30
// COM戦/フレンドマッチはレーティング変動なし
// ============================================================

export interface RatingResult {
  oldRating: number;
  newRating: number;
  change: number;
}

export interface EloInput {
  ratingA: number;
  ratingB: number;
  /** A視点: 1=勝ち, 0=負け, 0.5=引き分け */
  scoreA: 0 | 0.5 | 1;
}

const K = 30;
const MIN_CHANGE = 15;
const MAX_CHANGE = 30;
const INITIAL_RATING = 1000;

/** 期待勝率 = 1 / (1 + 10^((Ra-Rb)/400)) */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Elo レーティング計算 */
export function calculateElo(input: EloInput): { a: RatingResult; b: RatingResult } {
  const { ratingA, ratingB, scoreA } = input;
  const scoreB = 1 - scoreA;

  const expectedA = expectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;

  let rawChangeA = Math.round(K * (scoreA - expectedA));
  let rawChangeB = Math.round(K * (scoreB - expectedB));

  // 変動幅クランプ
  rawChangeA = clampChange(rawChangeA);
  rawChangeB = clampChange(rawChangeB);

  return {
    a: { oldRating: ratingA, newRating: ratingA + rawChangeA, change: rawChangeA },
    b: { oldRating: ratingB, newRating: ratingB + rawChangeB, change: rawChangeB },
  };
}

function clampChange(change: number): number {
  if (change === 0) return 0;
  const sign = change > 0 ? 1 : -1;
  const abs = Math.abs(change);
  return sign * Math.min(MAX_CHANGE, Math.max(MIN_CHANGE, abs));
}

export { INITIAL_RATING, K };

// ============================================================
// D1 永続化（サーバー権威のレーティング）
// ============================================================

/** COM戦/フレンドマッチ/カジュアル等、レーティング非対象のmatchId/相手を判定 */
export function isRatedMatch(matchId: string, homeUserId: string, awayUserId: string): boolean {
  // casual_ はカジュアルマッチ（モード分離済み。カジュアルでELOが動くのは約束違反のため除外）
  if (matchId.startsWith('com_') || matchId.startsWith('gemma_com_') || matchId.startsWith('friend_') || matchId.startsWith('casual_')) return false;
  if (homeUserId === 'com_ai' || awayUserId === 'com_ai') return false;
  if (homeUserId.startsWith('com_player_') || awayUserId.startsWith('com_player_')) return false;
  return true;
}

/** ユーザーの現在レーティングを取得（行が無ければ初期値）。マッチメイクのサーバー権威値。 */
export async function getRating(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT rating FROM user_ratings WHERE user_id = ?')
    .bind(userId)
    .first<{ rating: number }>();
  return row?.rating ?? INITIAL_RATING;
}

/**
 * 試合結果から両プレイヤーのレーティング・戦績を更新する（UPSERT）。
 * scoreHome: home視点で 1=勝ち / 0.5=分け / 0=負け。
 * COM/フレンドは呼び出し側で除外すること（isRatedMatch）。
 */
export async function persistRatings(
  db: D1Database,
  homeUserId: string,
  awayUserId: string,
  scoreHome: 0 | 0.5 | 1,
  finishedAt: string,
): Promise<{ home: RatingResult; away: RatingResult }> {
  const ratingA = await getRating(db, homeUserId);
  const ratingB = await getRating(db, awayUserId);
  const { a: home, b: away } = calculateElo({ ratingA, ratingB, scoreA: scoreHome });

  const wld = (s: 0 | 0.5 | 1): [number, number, number] =>
    s === 1 ? [1, 0, 0] : s === 0 ? [0, 1, 0] : [0, 0, 1];
  const [hw, hl, hd] = wld(scoreHome);
  const [aw, al, ad] = wld((1 - scoreHome) as 0 | 0.5 | 1);

  await db.batch([
    upsertRating(db, homeUserId, home.newRating, hw, hl, hd, finishedAt),
    upsertRating(db, awayUserId, away.newRating, aw, al, ad, finishedAt),
  ]);

  return { home, away };
}

function upsertRating(
  db: D1Database,
  userId: string,
  newRating: number,
  win: number,
  loss: number,
  draw: number,
  finishedAt: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO user_ratings (user_id, rating, wins, losses, draws, highest_rating, updated_at, games)
       VALUES (?1, ?2, ?3, ?4, ?5, ?2, ?6, 1)
       ON CONFLICT(user_id) DO UPDATE SET
         rating = ?2,
         wins = wins + ?3,
         losses = losses + ?4,
         draws = draws + ?5,
         highest_rating = MAX(highest_rating, ?2),
         games = games + 1,
         updated_at = ?6`,
    )
    .bind(userId, newRating, win, loss, draw, finishedAt);
}
