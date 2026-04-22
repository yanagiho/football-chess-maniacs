// ============================================================
// battleUtils.test.ts — Battle純粋関数のユニットテスト
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  clampToOwnHalf,
  formationToPieces,
  createDefaultHomePieces,
  createDefaultAwayPieces,
  createInitialPieces,
  getAccuratePassRange,
  isShootZoneForPiece,
  getMatchTimeLabel,
  computeStats,
  computeMvp,
  HALF_LINE_ROW,
  DEFAULT_TEMPLATE,
} from '../battleUtils';
import type { PieceData, FormationPiece, GameEvent } from '../../../types';

// ────────────────────────────────────────────────────────────
// clampToOwnHalf
// ────────────────────────────────────────────────────────────
describe('clampToOwnHalf', () => {
  it('homeチームはHALF_LINE_ROW以下にクランプ', () => {
    expect(clampToOwnHalf(20, 'home')).toBe(HALF_LINE_ROW);
    expect(clampToOwnHalf(33, 'home')).toBe(HALF_LINE_ROW);
  });

  it('homeチームで自陣内はそのまま', () => {
    expect(clampToOwnHalf(5, 'home')).toBe(5);
    expect(clampToOwnHalf(HALF_LINE_ROW, 'home')).toBe(HALF_LINE_ROW);
  });

  it('awayチームはHALF_LINE_ROW+1以上にクランプ', () => {
    expect(clampToOwnHalf(5, 'away')).toBe(HALF_LINE_ROW + 1);
    expect(clampToOwnHalf(0, 'away')).toBe(HALF_LINE_ROW + 1);
  });

  it('awayチームで自陣内はそのまま', () => {
    expect(clampToOwnHalf(30, 'away')).toBe(30);
    expect(clampToOwnHalf(HALF_LINE_ROW + 1, 'away')).toBe(HALF_LINE_ROW + 1);
  });
});

// ────────────────────────────────────────────────────────────
// getAccuratePassRange
// ────────────────────────────────────────────────────────────
describe('getAccuratePassRange', () => {
  const makePiece = (cost: number, position: string): PieceData => ({
    id: 'h01', team: 'home', cost, position, coord: { col: 10, row: 10 },
    hasBall: false, moveRange: 4, isBench: false,
  } as PieceData);

  it('基本値は6', () => {
    expect(getAccuratePassRange(makePiece(1, 'MF'))).toBe(6);
  });

  it('コスト3で+1', () => {
    expect(getAccuratePassRange(makePiece(3, 'MF'))).toBe(7);
  });

  it('OMで+1', () => {
    expect(getAccuratePassRange(makePiece(2, 'OM'))).toBe(7);
  });

  it('コスト3+OMで+2', () => {
    expect(getAccuratePassRange(makePiece(3, 'OM'))).toBe(8);
  });
});

// ────────────────────────────────────────────────────────────
// isShootZoneForPiece
// ────────────────────────────────────────────────────────────
describe('isShootZoneForPiece', () => {
  it('homeチームFW: row22-1=21以上でシュート可', () => {
    expect(isShootZoneForPiece({ col: 10, row: 21 }, 'home', 'FW')).toBe(true);
    expect(isShootZoneForPiece({ col: 10, row: 20 }, 'home', 'FW')).toBe(false);
  });

  it('homeチームDF: row22+1=23以上でシュート可', () => {
    expect(isShootZoneForPiece({ col: 10, row: 23 }, 'home', 'DF')).toBe(true);
    expect(isShootZoneForPiece({ col: 10, row: 22 }, 'home', 'DF')).toBe(false);
  });

  it('homeチームMF: row22（修正なし）以上でシュート可', () => {
    expect(isShootZoneForPiece({ col: 10, row: 22 }, 'home', 'MF')).toBe(true);
    expect(isShootZoneForPiece({ col: 10, row: 21 }, 'home', 'MF')).toBe(false);
  });

  it('awayチームFW: row11+1=12以下でシュート可', () => {
    expect(isShootZoneForPiece({ col: 10, row: 12 }, 'away', 'FW')).toBe(true);
    expect(isShootZoneForPiece({ col: 10, row: 13 }, 'away', 'FW')).toBe(false);
  });

  it('awayチームDF: row11-1=10以下でシュート可', () => {
    expect(isShootZoneForPiece({ col: 10, row: 10 }, 'away', 'DF')).toBe(true);
    expect(isShootZoneForPiece({ col: 10, row: 11 }, 'away', 'DF')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// getMatchTimeLabel
// ────────────────────────────────────────────────────────────
describe('getMatchTimeLabel', () => {
  it('前半ターン1 → 0:00', () => {
    expect(getMatchTimeLabel(1, 2, 2)).toEqual({ label: '0:00', isAT: false });
  });

  it('前半ターン15 → 42:00', () => {
    expect(getMatchTimeLabel(15, 2, 2)).toEqual({ label: '42:00', isAT: false });
  });

  it('前半AT1 → 45+1', () => {
    expect(getMatchTimeLabel(16, 2, 2)).toEqual({ label: '45+1', isAT: true });
  });

  it('前半AT2 → 45+2', () => {
    expect(getMatchTimeLabel(17, 2, 2)).toEqual({ label: '45+2', isAT: true });
  });

  it('後半ターン1（at1=2）→ 45:00', () => {
    expect(getMatchTimeLabel(18, 2, 2)).toEqual({ label: '45:00', isAT: false });
  });

  it('後半最終通常ターン → 87:00', () => {
    // turn = 15 + at1 + 15 = 32 (at1=2)
    expect(getMatchTimeLabel(32, 2, 2)).toEqual({ label: '87:00', isAT: false });
  });

  it('後半AT1 → 90+1', () => {
    // turn = 15 + at1 + 15 + 1 = 33 (at1=2)
    expect(getMatchTimeLabel(33, 2, 2)).toEqual({ label: '90+1', isAT: true });
  });

  it('AT3の場合: 前半AT3 → 45+3', () => {
    expect(getMatchTimeLabel(18, 3, 3)).toEqual({ label: '45+3', isAT: true });
  });
});

// ────────────────────────────────────────────────────────────
// formationToPieces
// ────────────────────────────────────────────────────────────
describe('formationToPieces', () => {
  const starters: FormationPiece[] = [
    { position: 'GK', cost: 1, col: 10, row: 1 },
    { position: 'FW', cost: 2, col: 10, row: 16 },
  ];
  const bench: FormationPiece[] = [
    { position: 'MF', cost: 1.5, col: 0, row: 0 },
  ];

  it('homeチームのID prefix は "h"', () => {
    const pieces = formationToPieces(starters, bench, 'home');
    expect(pieces[0].id).toBe('h01');
    expect(pieces[1].id).toBe('h02');
    expect(pieces[2].id).toBe('hb01');
  });

  it('awayチームのID prefix は "a"', () => {
    const pieces = formationToPieces(starters, bench, 'away');
    expect(pieces[0].id).toBe('a01');
    expect(pieces[2].id).toBe('ab01');
  });

  it('starterのrowはclampToOwnHalfが適用される', () => {
    const highRow: FormationPiece[] = [{ position: 'FW', cost: 2, col: 10, row: 30 }];
    const pieces = formationToPieces(highRow, [], 'home');
    expect(pieces[0].coord.row).toBe(HALF_LINE_ROW); // homeは16以下にクランプ
  });

  it('benchはisBench: true', () => {
    const pieces = formationToPieces(starters, bench, 'home');
    expect(pieces[0].isBench).toBe(false);
    expect(pieces[2].isBench).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// createDefaultHomePieces / createDefaultAwayPieces / createInitialPieces
// ────────────────────────────────────────────────────────────
describe('createInitialPieces', () => {
  it('デフォルトで22枚のコマを生成', () => {
    const pieces = createInitialPieces();
    expect(pieces).toHaveLength(22);
  });

  it('home11枚 + away11枚', () => {
    const pieces = createInitialPieces();
    expect(pieces.filter(p => p.team === 'home')).toHaveLength(11);
    expect(pieces.filter(p => p.team === 'away')).toHaveLength(11);
  });

  it('キックオフチームのFWがボール保持', () => {
    const pieces = createInitialPieces(null, 'home');
    const homeFw = pieces.find(p => p.team === 'home' && p.position === 'FW');
    expect(homeFw?.hasBall).toBe(true);

    const pieces2 = createInitialPieces(null, 'away');
    const awayFw = pieces2.find(p => p.team === 'away' && p.position === 'FW');
    expect(awayFw?.hasBall).toBe(true);
  });

  it('awayコマのrowはMAX_ROW反転', () => {
    const away = createDefaultAwayPieces();
    // DEFAULT_TEMPLATE[0] = GK at row 1 → away row = 33 - 1 = 32
    expect(away[0].coord.row).toBe(33 - DEFAULT_TEMPLATE[0].row);
  });
});

// ────────────────────────────────────────────────────────────
// computeStats
// ────────────────────────────────────────────────────────────
describe('computeStats', () => {
  it('イベントなしで初期値を返す', () => {
    const stats = computeStats([], 30);
    expect(stats.possession).toEqual({ home: 50, away: 50 });
    expect(stats.shots.home).toBe(0);
    expect(stats.fouls.away).toBe(0);
  });

  it('SHOOTイベントでshots集計', () => {
    const events: GameEvent[] = [
      { type: 'SHOOT', shooterId: 'h01', result: { outcome: 'goal' } },
      { type: 'SHOOT', shooterId: 'a01', result: { outcome: 'miss' } },
    ] as unknown as GameEvent[];
    const stats = computeStats(events, 30);
    expect(stats.shots.home).toBe(1);
    expect(stats.shots.away).toBe(1);
    expect(stats.shotsOnTarget.home).toBe(1);
    expect(stats.shotsOnTarget.away).toBe(0);
  });

  it('BALL_ACQUIREDでポゼッション計算', () => {
    const events: GameEvent[] = [
      { type: 'BALL_ACQUIRED', pieceId: 'h01' },
      { type: 'BALL_ACQUIRED', pieceId: 'h02' },
      { type: 'BALL_ACQUIRED', pieceId: 'a01' },
    ] as unknown as GameEvent[];
    const stats = computeStats(events, 30);
    expect(stats.possession.home).toBe(67); // 2/3
    expect(stats.possession.away).toBe(33);
  });

  it('FOULイベントでfouls集計', () => {
    const events: GameEvent[] = [
      { type: 'FOUL', tacklerId: 'h05' },
      { type: 'FOUL', tacklerId: 'a03' },
      { type: 'FOUL', tacklerId: 'a07' },
    ] as unknown as GameEvent[];
    const stats = computeStats(events, 30);
    expect(stats.fouls.home).toBe(1);
    expect(stats.fouls.away).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────
// computeMvp
// ────────────────────────────────────────────────────────────
describe('computeMvp', () => {
  it('イベントなしでnull', () => {
    expect(computeMvp([])).toBeNull();
  });

  it('ゴール数でMVP選出', () => {
    const events: GameEvent[] = [
      { type: 'SHOOT', shooterId: 'h01', result: { outcome: 'goal' } },
      { type: 'SHOOT', shooterId: 'h01', result: { outcome: 'goal' } },
      { type: 'SHOOT', shooterId: 'a01', result: { outcome: 'goal' } },
    ] as unknown as GameEvent[];
    const mvp = computeMvp(events);
    expect(mvp?.pieceId).toBe('h01');
    expect(mvp?.goals).toBe(2);
  });

  it('ゴール同数ならアシスト数で決定', () => {
    const events: GameEvent[] = [
      { type: 'SHOOT', shooterId: 'h01', result: { outcome: 'goal' } },
      { type: 'SHOOT', shooterId: 'a01', result: { outcome: 'goal' } },
      { type: 'PASS_DELIVERED', passerId: 'a01' },
      { type: 'PASS_DELIVERED', passerId: 'a01' },
    ] as unknown as GameEvent[];
    const mvp = computeMvp(events);
    expect(mvp?.pieceId).toBe('a01');
    expect(mvp?.assists).toBe(2);
  });

  it('タックル成功もスコアに反映', () => {
    const events: GameEvent[] = [
      { type: 'TACKLE', result: { success: true, tackler: { id: 'h05', team: 'home' } } },
      { type: 'TACKLE', result: { success: true, tackler: { id: 'h05', team: 'home' } } },
    ] as unknown as GameEvent[];
    const mvp = computeMvp(events);
    expect(mvp?.pieceId).toBe('h05');
    expect(mvp?.tackles).toBe(2);
  });
});
