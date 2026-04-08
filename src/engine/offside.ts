// ============================================================
// offside.ts — オフサイド判定（§9-5）
// ============================================================
//
// オフサイドライン: 守備側のGKを除く最後方フィールドプレイヤーの row。
// 判定基準: パスが出された瞬間の「移動前の位置」（フェーズ0スナップショット）。
//
// 受け手の位置（移動前）:
//   ライン + 2HEX以上 敵陣寄り → 確定オフサイド
//   ライン + 1HEX 敵陣寄り     → グレーゾーン（50%でオフサイド、暫定値）
//   ライン同列 or 自陣寄り      → オンサイド
//
// ※ 「敵陣寄り」方向は攻撃チームによって異なるため、
//    row の増加方向が「敵陣側」と仮定して計算する。
//    （home チームは row 増加方向に攻撃、away は逆転して渡すこと）
//
// ============================================================

import { judge } from './dice';
import type { OffsideResult, Piece } from './types';

/** グレーゾーンのオフサイド確率（暫定値 §9-5） */
const GRAY_ZONE_PROBABILITY = 50;

/** ハーフラインの行 */
const HALF_LINE_ROW = 16;

/**
 * 守備側スナップショットから「オフサイドライン（row値）」を求める。
 *
 * サッカールール準拠:
 *   1. 守備側のGKを除くフィールドプレイヤーのうち、最も自陣ゴールに近い選手の位置
 *      （GKが最後尾の場合、GK の次に後ろにいる選手 = 実質2番目）
 *   2. ハーフラインより攻撃側に近い場合は、ハーフラインがオフサイドライン
 *   3. ボール位置がオフサイドラインより後ろの場合は、ボール位置がオフサイドライン
 *
 * つまり: offsideLine = max(ハーフライン, min(守備側2番目, ボール位置))
 *       ※ "max/min" の方向は攻撃方向に依存
 *
 * @param defenderSnapshots 守備チームのフェーズ0スナップショット
 * @param defenderGoalIsLowRow true なら守備側ゴールが row=0 側（home守備の場合）
 * @param ballRow ボール保持者の row（省略時はボール制約なし）
 */
export function getOffsideLine(
  defenderSnapshots: Piece[],
  defenderGoalIsLowRow: boolean,
  ballRow?: number,
): number {
  if (defenderSnapshots.length < 2) {
    return defenderGoalIsLowRow ? 0 : 33;
  }

  // GK を除外してソート（GKが最後尾なら実質2番目のFPが対象になる）
  const nonGk = defenderSnapshots.filter(p => p.position !== 'GK');
  // GK除外後に1枚以下なら全コマ(GK含む)でフォールバック
  const candidates = nonGk.length >= 1 ? nonGk : defenderSnapshots;

  const sorted = [...candidates].sort((a, b) =>
    defenderGoalIsLowRow
      ? a.coord.row - b.coord.row   // 自陣=row小 → 昇順で先頭が最も後方
      : b.coord.row - a.coord.row,  // 自陣=row大 → 降順で先頭が最も後方
  );

  // 最も自陣ゴールに近いフィールドプレイヤーの row
  const secondLastRow = sorted[0].coord.row;

  // FIFA規則: オフサイド = ボールと最終守備ラインの両方より前にいる場合
  // → ライン = ボールと守備ラインのうち、攻撃方向により前方の位置
  //   + ハーフライン制約（自陣ではオフサイドにならない）
  if (defenderGoalIsLowRow) {
    // defender=home(goal row=0) → attacker=away attacks toward low row (row小=前方)
    // ライン = min(secondLastRow, ballRow) ← 「より前方（row小さい方）」
    // away自陣=row17-33 → ライン ≤ 16 がハーフライン制約
    let line = secondLastRow;
    if (ballRow !== undefined) line = Math.min(line, ballRow);
    return Math.min(HALF_LINE_ROW, line);
  } else {
    // defender=away(goal row=33) → attacker=home attacks toward high row (row大=前方)
    // ライン = max(secondLastRow, ballRow) ← 「より前方（row大きい方）」
    // home自陣=row0-16 → ライン ≥ 16 がハーフライン制約
    let line = secondLastRow;
    if (ballRow !== undefined) line = Math.max(line, ballRow);
    return Math.max(HALF_LINE_ROW, line);
  }
}

export interface OffsideInput {
  /** 受け手のフェーズ0スナップショット位置 */
  receiverSnapshot: Piece;
  /** オフサイドライン（row値） */
  offsideLine: number;
  /**
   * true なら row が大きい方が「攻撃側の敵陣」。
   * home チームが row 増加方向に攻撃する場合は true。
   */
  attackIsHighRow: boolean;
}

/**
 * オフサイド判定
 *
 * @returns OffsideResult
 */
export function resolveOffside(input: OffsideInput): OffsideResult {
  const { receiverSnapshot, offsideLine, attackIsHighRow } = input;
  const receiverRow = receiverSnapshot.coord.row;

  // 敵陣方向の差（正 = 敵陣寄り）
  const diff = attackIsHighRow
    ? receiverRow - offsideLine
    : offsideLine - receiverRow;

  if (diff >= 2) {
    // 確定オフサイド
    return { isOffside: true, isGrayZone: false };
  }

  if (diff === 1) {
    // グレーゾーン: 50%でオフサイド
    const result = judge(GRAY_ZONE_PROBABILITY);
    return {
      isOffside: result.success,
      isGrayZone: true,
      grayZoneRoll: result.roll,
    };
  }

  // オンサイド（diff <= 0）
  return { isOffside: false, isGrayZone: false };
}
