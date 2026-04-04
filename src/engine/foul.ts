// ============================================================
// foul.ts — ファウル判定（§7-5）
// ============================================================
//
// タックル発生後にファウル判定を行う。
// アタッキングサード（ゴールラインから12HEX以内）でのみ発生。
// それ以外のゾーンではファウルにならない。
//
// ============================================================

import { judge } from './dice';
import type { FoulResult, Zone } from './types';

/** ファウル基本確率（暫定値、§7-5より） */
const BASE_FOUL_PROBABILITY = 25;

/**
 * アタッキングサードかどうかを判定する。
 * §7-5: アタッキングサード（ゴールラインから12HEX以内）でのみ発生。
 * → Zone的には 'アタッキングサード' または 'ファイナルサード' が該当。
 */
export function isAttackingThird(zone: Zone): boolean {
  return zone === 'アタッキングサード' || zone === 'ファイナルサード';
}

/**
 * PA内かどうかを判定する。
 * PA: 横14HEX × 縦6HEX（§5-4）= ファイナルサードの中央14列。
 * → zone が 'ファイナルサード' かつ col が PA内（col 4〜17）であることを確認。
 *    ※ PA幅14HEX: 22列中央 → col = (22-14)/2 = 4 〜 4+14-1 = 17
 */
export function isInsidePA(zone: Zone, col: number): boolean {
  return zone === 'ファイナルサード' && col >= 4 && col <= 17;
}

export interface FoulInput {
  zone: Zone;
  col: number;
  /**
   * PA内に守備側コマが多数いる場合の必ずファウルフラグ。
   * 閾値は未確定（§17）のため、呼び出し元が判定して渡す。
   */
  forceFoul?: boolean;
}

/**
 * ファウル判定
 *
 * - アタッキングサード以外: ファウルなし
 * - PA内 + forceFoul: 必ずファウル（→ PK）
 * - PA内: 25%でファウル（→ PK）
 * - PA外アタッキングサード: 25%でファウル（→ FK）
 */
export function resolveFoul(input: FoulInput): FoulResult {
  const { zone, col, forceFoul = false } = input;

  if (!isAttackingThird(zone)) {
    return { occurred: false, isPA: false, outcome: 'none' };
  }

  const inPA = isInsidePA(zone, col);

  if (inPA && forceFoul) {
    return { occurred: true, isPA: true, outcome: 'pk' };
  }

  const result = judge(BASE_FOUL_PROBABILITY);
  if (!result.success) {
    return { occurred: false, isPA: inPA, outcome: 'none' };
  }

  return {
    occurred: true,
    isPA: inPA,
    outcome: inPA ? 'pk' : 'fk',
  };
}
