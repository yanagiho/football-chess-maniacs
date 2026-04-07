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
