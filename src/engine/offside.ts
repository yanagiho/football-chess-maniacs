// ============================================================
// offside.ts — オフサイド判定（§9-5）
// ============================================================
//
// オフサイドライン: 守備側の後方から2番目のコマ（GK含む）が位置するHEX列（row）。
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

/**
 * 守備側スナップショットから「オフサイドライン（row値）」を求める。
 *
 * オフサイドラインは守備側後方から2番目のコマのrow。
 * 「後方」= 自陣側 = row が小さい方（守備チームにとって）。
 * → 守備コマを row 昇順でソートし、2番目（index=1）を返す。
 *
 * @param defenderSnapshots 守備チームのフェーズ0スナップショット
 * @param defenderGoalIsLowRow true なら守備側ゴールが row=0 側（home守備の場合）
 */
export function getOffsideLine(
  defenderSnapshots: Piece[],
  defenderGoalIsLowRow: boolean,
): number {
  if (defenderSnapshots.length < 2) {
    // コマが1枚以下の場合はゴールラインを返す（エッジケース）
    return defenderGoalIsLowRow ? 0 : 33;
  }

  const sorted = [...defenderSnapshots].sort((a, b) =>
    defenderGoalIsLowRow
      ? a.coord.row - b.coord.row   // 自陣=row小 → 昇順で2番目が後方2番目
      : b.coord.row - a.coord.row,  // 自陣=row大 → 降順で2番目が後方2番目
  );

  return sorted[1].coord.row;
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
