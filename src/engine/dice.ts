// ============================================================
// dice.ts — 基本判定式と確率ロール
// ============================================================

import type { Cost, ZocAdjacency } from './types';

/**
 * ランク帯を返す。低ランク帯=0, 中ランク帯=1, 高ランク帯=2
 */
function rankBand(cost: Cost): number {
  if (cost <= 1.5) return 0; // 低ランク帯: 1, 1.5
  if (cost <= 2.5) return 1; // 中ランク帯: 2, 2.5
  return 2;                  // 高ランク帯: 3
}

/**
 * ランク帯システムに基づく有効差（effectiveDiff）を計算する。
 *
 * - 同コスト → 0
 * - 異ランク帯 → ±1（xが上なら+1、下なら-1）
 * - 同ランク帯の0.5差 → ±2（最大。上のコストが有利）
 *
 * @param x 判定を仕掛ける側のコスト
 * @param y 判定を受ける側のコスト
 * @returns -2〜+2 の有効差（x視点: 正=x有利、負=x不利）
 */
export function effectiveDiff(x: Cost, y: Cost): number {
  if (x === y) return 0;
  const bx = rankBand(x);
  const by = rankBand(y);
  if (bx !== by) {
    // 異ランク帯: 一律 ±1
    return bx > by ? 1 : -1;
  }
  // 同ランク帯の0.5差: ±2
  return x > y ? 2 : -2;
}

/**
 * 基本判定式: 成功確率(%) = (effectiveDiff(x, y) + 3) × Ω + ポジション修正 + ZOC隣接修正
 *
 * @param x  判定を仕掛ける側のコスト
 * @param y  判定を受ける側のコスト
 * @param omega 基本係数 Ω
 * @param positionModifier ポジション修正値（合算済み）
 * @param zocModifier ZOC隣接修正値（合算済みで渡す）
 * @returns 0〜100 にクランプした成功確率(%)
 */
export function calcProbability(
  x: Cost,
  y: Cost,
  omega: number,
  positionModifier: number = 0,
  zocModifier: number = 0,
): number {
  const base = (effectiveDiff(x, y) + 3) * omega;
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
