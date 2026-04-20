// ============================================================
// pass.ts — パスカット1・パスカット2判定（§7-3）
// ============================================================
//
// パスカット1: パスコースが相手ZOC/ZOC2を通る場合（パスコース遮断）
// パスカット2: 受け手のZOC内に相手コマがいる場合（トラップ妨害）
//
// ============================================================

import { calcProbability, calcZocModifier, judge } from './dice';
import type { Piece, PassCutResult, ZocAdjacency } from './types';

// ────────────────────────────────────────────────────────────
// ポジション修正定数
// ────────────────────────────────────────────────────────────

/** パスカット1: 守備側ポジション修正 */
const CUT1_DEF_MOD: Partial<Record<string, number>> = {
  VO: +10,
  DF: +10,
};

/** パスカット1: パサー（攻撃側）ポジション修正 */
const CUT1_PASSER_MOD: Partial<Record<string, number>> = {
  MF: -10,
  VO: -5,
  OM: -15,
};

/** パスカット2: 守備側ポジション修正 */
const CUT2_DEF_MOD: Partial<Record<string, number>> = {
  VO: +15,
  DF: +15,
};

/** パスカット2: 受け手（攻撃側）ポジション修正 */
const CUT2_RECEIVER_MOD: Partial<Record<string, number>> = {
  MF: -10,
  VO: -5,
  OM: -5,
  FW: -10,
};

// ────────────────────────────────────────────────────────────
// パスカット1（パスコース遮断）
// ────────────────────────────────────────────────────────────

export interface Cut1Input {
  interceptor: Piece;
  passer: Piece;
  zoc: ZocAdjacency;
}

/**
 * パスカット1
 * Ω = 15（守備側成功確率）
 * 攻撃側ZOC隣接: 1体につき -5（敵が多いとカットしづらい）
 * 守備側ZOC隣接: 1体につき +10（味方が多いとカットしやすい）
 */
export function passCut1(input: Cut1Input) {
  const { interceptor, passer, zoc } = input;
  const omega = 15;

  const posMod =
    (CUT1_DEF_MOD[interceptor.position] ?? 0) +
    (CUT1_PASSER_MOD[passer.position] ?? 0);

  const zocMod = calcZocModifier(zoc, -5, +10);

  const prob = calcProbability(interceptor.cost, passer.cost, omega, posMod, zocMod);
  return { ...judge(prob), interceptor };
}

// ────────────────────────────────────────────────────────────
// パスカット2（トラップ妨害）
// ────────────────────────────────────────────────────────────

export interface Cut2Input {
  interceptor: Piece;
  receiver: Piece;
  /**
   * ZOC隣接修正。
   * トリガーとなった守備コマ1体目はZOC隣接修正に含めない（§7-3注記）。
   * → 呼び出し元で interceptor を除いた残りのコマ数を渡すこと。
   */
  zoc: ZocAdjacency;
}

/**
 * パスカット2（トラップ妨害）
 * Ω = 10（守備側成功確率）
 * 攻撃側ZOC隣接: 1体につき -5（敵が多いとカットしづらい）
 * 守備側ZOC隣接: 1体につき +20（味方が多いとカットしやすい）
 * ※ トリガーとなった守備コマ1体目はZOC隣接に含めない
 */
export function passCut2(input: Cut2Input) {
  const { interceptor, receiver, zoc } = input;
  const omega = 10;

  const posMod =
    (CUT2_DEF_MOD[interceptor.position] ?? 0) +
    (CUT2_RECEIVER_MOD[receiver.position] ?? 0);

  const zocMod = calcZocModifier(zoc, -5, +20);

  const prob = calcProbability(interceptor.cost, receiver.cost, omega, posMod, zocMod);
  return { ...judge(prob), interceptor };
}

// ────────────────────────────────────────────────────────────
// パス判定フロー全体
// ────────────────────────────────────────────────────────────

export interface PassResolveInput {
  passer: Piece;
  receiver: Piece;
  /** コースを横切る守備コマ（ZOC/ZOC2内）。最初の1体のみパスカット1対象 */
  cut1Interceptor: Piece | null;
  cut1Zoc: ZocAdjacency;
  /** 受け手のZOC内にいる守備コマ群。最初の1体がパスカット2のトリガー */
  cut2Defenders: Piece[];
  /**
   * cut2のZOC隣接情報。
   * attackCount: 受け手ZOC内の攻撃側コマ数
   * defenseCount: トリガーコマを除いた残りの守備コマ数（§7-3注記）
   */
  cut2Zoc: ZocAdjacency;
}

/**
 * パス判定フロー全体を実行し PassCutResult を返す。
 *
 * 処理順: パスカット1 → パスカット2 → 配送成功
 */
export function resolvePass(input: PassResolveInput): PassCutResult {
  const { passer, receiver, cut1Interceptor, cut1Zoc, cut2Defenders, cut2Zoc } = input;

  // パスカット1
  if (cut1Interceptor) {
    const c1 = passCut1({ interceptor: cut1Interceptor, passer, zoc: cut1Zoc });
    if (c1.success) {
      return { cut1: c1, outcome: 'cut1' };
    }
  }

  // パスカット2（トリガー: 受け手ZOC内の守備コマの最初の1体）
  const cut2Trigger = cut2Defenders[0] ?? null;
  if (cut2Trigger) {
    const c2 = passCut2({ interceptor: cut2Trigger, receiver, zoc: cut2Zoc });
    if (c2.success) {
      return { cut2: c2, outcome: 'cut2' };
    }
  }

  return { outcome: 'delivered' };
}
