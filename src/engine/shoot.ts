// ============================================================
// shoot.ts — シュート判定チェーン（§7-2）
// ============================================================
//
// チェーン概要:
//   ① シュート入力（コース修正）
//   ② シュートブロックチェック
//   ③ セービングチェック
//   ③-b キャッチ判定
//   ④ シュート成功チェック
//
// ============================================================

import { calcProbability, calcZocModifier, judge } from './dice';
import type { Piece, ShootChainResult, ZocAdjacency } from './types';

// ────────────────────────────────────────────────────────────
// § ポジション修正定数
// ────────────────────────────────────────────────────────────

/** ② シュートブロックチェック: 守備側ポジション修正 */
const BLOCK_DEF_MOD: Partial<Record<string, number>> = {
  DF: +15,
  SB: +10,
};

/** ② シュートブロックチェック: 攻撃側（シューター）ポジション修正 */
const BLOCK_SHOOTER_MOD: Partial<Record<string, number>> = {
  FW: -10,
  WG: -5,
  OM: -5,
};

/** ③ セービングチェック: 攻撃側（シューター）ポジション修正 */
const SAVING_SHOOTER_MOD: Partial<Record<string, number>> = {
  FW: -15,
  WG: -10,
  OM: -10,
};

// ────────────────────────────────────────────────────────────
// ① コース修正（シュートコマZOC内の守備コマ数）
// ────────────────────────────────────────────────────────────

/**
 * ① シュートコマのZOC内にいる守備コマ1体につき -15%
 */
export function calcShootCourseModifier(defenderCountInShooterZoc: number): number {
  return (defenderCountInShooterZoc * -15) || 0;
}

// ────────────────────────────────────────────────────────────
// ② シュートブロックチェック
// ────────────────────────────────────────────────────────────

export interface BlockCheckInput {
  blocker: Piece;
  shooter: Piece;
  /** ブロックチェック発生地点のZOC隣接情報（攻守視点） */
  zoc: ZocAdjacency;
}

/**
 * ② シュートブロックチェック（守備側が成功確率を持つ）
 * Ω = 10（守備側）
 */
export function blockCheck(input: BlockCheckInput) {
  const { blocker, shooter, zoc } = input;
  const omega = 10;

  const posMod =
    (BLOCK_DEF_MOD[blocker.position] ?? 0) +
    (BLOCK_SHOOTER_MOD[shooter.position] ?? 0);

  // 攻撃側ZOC隣接: 1体につき -5（守備成功率を下げる）
  // 守備側ZOC隣接: 1体につき +10
  const zocMod = calcZocModifier(zoc, -5, +10);

  const prob = calcProbability(blocker.cost, shooter.cost, omega, posMod, zocMod);
  return { ...judge(prob), blocker };
}

// ────────────────────────────────────────────────────────────
// ③ セービングチェック
// ────────────────────────────────────────────────────────────

export interface SavingCheckInput {
  gk: Piece;
  shooter: Piece;
  /** GKまでのHEX数 */
  distanceToGk: number;
  /** GKのZOC内にいる守備コマ数 */
  defenderCountInGkZoc: number;
  zoc: ZocAdjacency;
}

/**
 * ③ セービングチェック（守備側=GKが成功確率を持つ）
 * Ω = 15
 * 距離修正: (GKまでのHEX数 - 2) × 5
 * GKのZOC内の守備コマ: 1体につき -10
 */
export function savingCheck(input: SavingCheckInput) {
  const { gk, shooter, distanceToGk, defenderCountInGkZoc, zoc } = input;
  const omega = 15;

  const posMod = SAVING_SHOOTER_MOD[shooter.position] ?? 0;

  const distMod = (distanceToGk - 2) * 5;
  const gkZocDefMod = defenderCountInGkZoc * -10;

  // 攻撃側ZOC隣接: 1体につき -5 / 守備側ZOC隣接: 1体につき +10
  const zocMod = calcZocModifier(zoc, -5, +10);

  const prob = calcProbability(
    gk.cost,
    shooter.cost,
    omega,
    posMod + gkZocDefMod + distMod,
    zocMod,
  );
  return judge(prob);
}

// ────────────────────────────────────────────────────────────
// ③-b キャッチ判定
// ────────────────────────────────────────────────────────────

/**
 * ③-b キャッチ判定
 * 確率 = GKコスト × 30
 */
export function catchCheck(gk: Piece) {
  const prob = Math.min(100, gk.cost * 30);
  return judge(prob);
}

// ────────────────────────────────────────────────────────────
// ④ シュート成功チェック
// ────────────────────────────────────────────────────────────

export interface ShootSuccessCheckInput {
  shooter: Piece;
  /** ゴールまでのHEX数 */
  distanceToGoal: number;
  zoc: ZocAdjacency;
  /** ① シュートコース修正（シューターZOC内の守備コマ数による修正） */
  courseMod?: number;
}

/**
 * ④ シュート成功チェック
 * 計算式: シューターのコスト × 5 + 70
 * 攻撃側ZOC隣接: 1体につき +5
 * 守備側ZOC隣接: 1体につき -10
 * 距離修正: (ゴールまでのHEX数 - 3) × -5
 * コース修正: シューターZOC内の守備コマ1体につき -15
 */
export function shootSuccessCheck(input: ShootSuccessCheckInput) {
  const { shooter, distanceToGoal, zoc, courseMod = 0 } = input;

  const base = shooter.cost * 5 + 70;
  const distMod = (distanceToGoal - 3) * -5;
  const zocMod = calcZocModifier(zoc, +5, -10);

  const prob = Math.min(100, Math.max(0, base + distMod + zocMod + courseMod));
  return judge(prob);
}

// ────────────────────────────────────────────────────────────
// メイン: シュート判定チェーン全体
// ────────────────────────────────────────────────────────────

export interface ShootChainInput {
  shooter: Piece;
  gk: Piece | null;
  /** コースを塞ぐ守備コマ（最初の1体のみ使用） */
  blocker: Piece | null;
  distanceToGoal: number;
  distanceToGk: number;
  defenderCountInGkZoc: number;
  /** シューターのZOC内にいる守備コマ数（①用） */
  defenderCountInShooterZoc: number;
  blockZoc: ZocAdjacency;
  savingZoc: ZocAdjacency;
  shootSuccessZoc: ZocAdjacency;
}

/**
 * シュート判定チェーン全体を実行し ShootChainResult を返す。
 */
export function resolveShootChain(input: ShootChainInput): ShootChainResult {
  const {
    shooter,
    gk,
    blocker,
    distanceToGoal,
    distanceToGk,
    defenderCountInGkZoc,
    defenderCountInShooterZoc,
    blockZoc,
    savingZoc,
    shootSuccessZoc,
  } = input;

  const result: ShootChainResult = { outcome: 'missed' };

  // ② シュートブロックチェック
  if (blocker) {
    const block = blockCheck({ blocker, shooter, zoc: blockZoc });
    result.blockCheck = { ...block, blocker };
    if (block.success) {
      result.outcome = 'blocked';
      return result;
    }
  }

  // ③ セービングチェック
  if (gk) {
    const saving = savingCheck({
      gk,
      shooter,
      distanceToGk,
      defenderCountInGkZoc,
      zoc: savingZoc,
    });
    result.savingCheck = saving;

    if (saving.success) {
      // ③-b キャッチ判定
      const catchResult = catchCheck(gk);
      result.catchCheck = catchResult;
      result.outcome = catchResult.success ? 'saved_catch' : 'saved_ck';
      return result;
    }
  }

  // ① シュートコース修正（シューターZOC内の守備コマ数）
  const courseMod = calcShootCourseModifier(defenderCountInShooterZoc);

  // ④ シュート成功チェック
  const successCheck = shootSuccessCheck({ shooter, distanceToGoal, zoc: shootSuccessZoc, courseMod });
  result.shootSuccessCheck = successCheck;
  result.outcome = successCheck.success ? 'goal' : 'missed';
  return result;
}
