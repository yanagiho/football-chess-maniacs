// ============================================================
// tackle.ts — タックル判定（§7-4）
// ============================================================
//
// ドリブルコマが相手ZOCに進入して停止した際に発生。
// Ω = 18（守備側成功確率）
//
// ============================================================

import { calcProbability, calcZocModifier, judge } from './dice';
import type { Piece, TackleResult, ZocAdjacency } from './types';

// ────────────────────────────────────────────────────────────
// ポジション修正定数
// ────────────────────────────────────────────────────────────

/** 守備側ポジション修正 */
const TACKLE_DEF_MOD: Partial<Record<string, number>> = {
  VO: +15,
  DF: +20,
  SB: +10,
};

/** ドリブラー（攻撃側）ポジション修正 */
const TACKLE_DRIBBLER_MOD: Partial<Record<string, number>> = {
  MF: -5,
  WG: -10,
  OM: -10,
  SB: -5,
};

// ────────────────────────────────────────────────────────────
// タックル判定
// ────────────────────────────────────────────────────────────

export interface TackleInput {
  tackler: Piece;
  dribbler: Piece;
  /**
   * タックル発生地点のZOC隣接情報。
   * 守備側ZOC隣接: 1体につき +5
   * 攻撃側ZOC隣接: 1体につき -10
   */
  zoc: ZocAdjacency;
}

/**
 * タックル判定
 * Ω = 18（守備側成功確率）
 * 守備側ZOC隣接: 1体につき +5
 * 攻撃側ZOC隣接: 1体につき -10
 */
export function resolveTackle(input: TackleInput): TackleResult {
  const { tackler, dribbler, zoc } = input;
  const omega = 18;

  const posMod =
    (TACKLE_DEF_MOD[tackler.position] ?? 0) +
    (TACKLE_DRIBBLER_MOD[dribbler.position] ?? 0);

  // 守備側ZOC隣接: +5 / 攻撃側ZOC隣接: -10
  const zocMod = calcZocModifier(zoc, -10, +5);

  const prob = calcProbability(tackler.cost, dribbler.cost, omega, posMod, zocMod);
  const result = judge(prob);

  return {
    ...result,
    tackler,
    dribbler,
    outcome: result.success ? 'tackled' : 'survived',
  };
}
