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
import type { FoulResult, Zone, Team } from './types';

/** ファウル基本確率（暫定値、§7-5より） */
const BASE_FOUL_PROBABILITY = 25;

/**
 * 攻撃側チームにとってのアタッキングサードかどうかを判定する。
 * §7-5: アタッキングサード（ゴールラインから12HEX以内）でのみ発生。
 *
 * hex_map.json のゾーン名は絶対座標:
 *   home → row 33 方向に攻撃 → ファイナルサード/アタッキングサード が攻撃側サード
 *   away → row 0 方向に攻撃 → ディフェンシブGサード/ディフェンシブサード が攻撃側サード
 */
export function isAttackingThird(zone: Zone, attackingTeam: Team = 'home'): boolean {
  if (attackingTeam === 'home') {
    return zone === 'アタッキングサード' || zone === 'ファイナルサード';
  }
  return zone === 'ディフェンシブサード' || zone === 'ディフェンシブGサード';
}

/**
 * PA内かどうかを判定する。
 * PA: 横14HEX × 縦6HEX（§5-4）= ゴールライン側6行の中央14列。
 * → col 4〜17 かつ、チームに応じたゴール側ゾーン。
 *    home攻撃: ファイナルサード（row 28-33）
 *    away攻撃: ディフェンシブGサード（row 0-5）
 */
export function isInsidePA(zone: Zone, col: number, attackingTeam: Team = 'home'): boolean {
  if (col < 4 || col > 17) return false;
  if (attackingTeam === 'home') return zone === 'ファイナルサード';
  return zone === 'ディフェンシブGサード';
}

export interface FoulInput {
  zone: Zone;
  col: number;
  /** 攻撃側チーム（ドリブラーのチーム）。ゾーン判定の方向を決定する。 */
  attackingTeam: Team;
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
  const { zone, col, attackingTeam, forceFoul = false } = input;

  if (!isAttackingThird(zone, attackingTeam)) {
    return { occurred: false, isPA: false, outcome: 'none' };
  }

  const inPA = isInsidePA(zone, col, attackingTeam);

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
