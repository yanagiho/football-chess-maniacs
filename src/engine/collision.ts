// ============================================================
// collision.ts — 同一HEX競合判定（§7-6）
// ============================================================
//
// 両者のコマが同じHEXに移動しようとした場合に発生。
// Ω = 15
// ボール保持コマが関与する場合はタックル判定（§7-4）に切り替え。
//
// ============================================================

import { calcProbability, calcZocModifier, judge } from './dice';
import type { CollisionResult, Piece, ZocAdjacency } from './types';

export interface CollisionInput {
  pieceA: Piece;
  pieceB: Piece;
  zoc: ZocAdjacency;
}

/**
 * 同一HEX競合判定
 * Ω = 15
 * 勝者: そのHEXに留まる
 * 敗者: 移動前のHEXに戻される
 *
 * x = pieceA（仕掛ける側）, y = pieceB（受ける側）
 * pieceA が成功 → pieceA が勝者
 */
export function resolveCollision(input: CollisionInput): CollisionResult {
  const { pieceA, pieceB, zoc } = input;
  const omega = 15;

  // ZOC修正なし（§7-6では修正値の記載がないため基本式のみ）
  const zocMod = calcZocModifier(zoc, 0, 0);

  const prob = calcProbability(pieceA.cost, pieceB.cost, omega, 0, zocMod);
  const result = judge(prob);

  return {
    ...result,
    winner: result.success ? pieceA : pieceB,
    loser: result.success ? pieceB : pieceA,
  };
}
