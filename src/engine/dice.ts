// ============================================================
// dice.ts — 基本判定式と確率ロール
// ============================================================

import type { Cost, ZocAdjacency } from './types';

/**
 * 基本判定式: 成功確率(%) = (x - y + 3) × Ω + ポジション修正 + ZOC隣接修正
 *
 * @param x  判定を仕掛ける側のコスト
 * @param y  判定を受ける側のコスト
 * @param omega 基本係数 Ω
 * @param positionModifier ポジション修正値（合算済み）
 * @param zoc ZOC隣接情報（修正の方向は呼び出し元で決定し加算済みで渡す）
 * @returns 0〜100 にクランプした成功確率(%)
 */
export function calcProbability(
  x: Cost,
  y: Cost,
  omega: number,
  positionModifier: number = 0,
  zocModifier: number = 0,
): number {
  const base = (x - y + 3) * omega;
  const raw = base + positionModifier + zocModifier;
  return Math.min(100, Math.max(0, raw));
}

/**
 * 0〜99 の一様乱数を返す（テスト時は差し替え可能なように export）
 */
export function roll(): number {
  return Math.floor(Math.random() * 100);
}

/**
 * 確率判定を実行し、成功 / 失敗を返す。
 * roll < probability なら成功（probability=60 → 60%成功）
 */
export function judge(probability: number): { success: boolean; probability: number; roll: number } {
  const r = roll();
  return { success: r < probability, probability, roll: r };
}

/**
 * コスト差の計算（.5 の特殊処理込み）
 * 片方が .5 で相方が整数の場合は小数のまま差を取る。
 * 両方が .5 の場合は通常の整数処理（小数部を切り捨て）。
 */
export function costDiff(x: Cost, y: Cost): number {
  const xHalf = x % 1 !== 0;
  const yHalf = y % 1 !== 0;
  if (xHalf && yHalf) {
    return Math.floor(x) - Math.floor(y);
  }
  return x - y;
}

/**
 * ZOC隣接修正を計算する汎用ヘルパー。
 * 各判定で「攻撃側1体につき +A」「守備側1体につき +D」という符号付きの係数を受け取る。
 */
export function calcZocModifier(
  zoc: ZocAdjacency,
  perAttacker: number,
  perDefender: number,
): number {
  return zoc.attackCount * perAttacker + zoc.defenseCount * perDefender;
}
