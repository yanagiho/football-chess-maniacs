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
  createSetPieceRestartPieces,
  getAccuratePassRange,
  isShootZoneForPiece,
  getMatchTimeLabel,
  computeStats,
  computeMvp,
  calcPieceMoveDurationMs,
  getMissedShootRestart,
  pickHeadingChanceReceiver,
  PIECE_MOVE_MIN_MS,
  PIECE_MOVE_MAX_MS,
  PIECE_MOVE_MS_PER_PX,
  HALF_LINE_ROW,
  DEFAULT_TEMPLATE,
} from '../battleUtils';
import { MAX_ROW } from '../../../types';
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
    { id: 'starter-gk', position: 'GK', cost: 1, col: 10, row: 1 },
    { id: 'starter-fw', position: 'FW', cost: 2, col: 10, row: 16 },
  ];
  const bench: FormationPiece[] = [
    { id: 'bench-mf', position: 'MF', cost: 1.5, col: 0, row: 0 },
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
    const highRow: FormationPiece[] = [{ id: 'high-fw', position: 'FW', cost: 2, col: 10, row: 30 }];
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

  it('opponent指定時はNPCチームの座標・ポジション・コストをそのまま使う', async () => {
    const { PRESET_TEAMS } = await import('../../../../data/presetTeams');
    const npc = PRESET_TEAMS[0];
    const away = createDefaultAwayPieces(npc);
    expect(away).toHaveLength(npc.pieces.length);
    expect(away[0].coord).toEqual({ col: npc.pieces[0].col, row: npc.pieces[0].row });
    expect(away[0].position).toBe(npc.pieces[0].position);
    expect(away[0].cost).toBe(npc.pieces[0].cost);
    expect(away.every(p => p.team === 'away')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// createSetPieceRestartPieces（Phase H: アンカー + 状況シフト + 揺らぎ）
// ────────────────────────────────────────────────────────────
describe('createSetPieceRestartPieces', () => {
  const baseArgs = (over: Partial<Parameters<typeof createSetPieceRestartPieces>[0]> = {}) => ({
    currentPieces: createInitialPieces(),
    defenseTeam: 'home' as const,
    restartType: 'goalkick' as const,
    seed: 5,
    scoreHome: 0,
    scoreAway: 0,
    turn: 5,
    maxTurn: 32,
    ...over,
  });

  it('(a) 同一seed・同一状況で決定的に同じ配置になる（オンライン整合）', () => {
    const r1 = createSetPieceRestartPieces(baseArgs());
    const r2 = createSetPieceRestartPieces(baseArgs());
    expect(r1.map(p => ({ id: p.id, coord: p.coord, hasBall: p.hasBall })))
      .toEqual(r2.map(p => ({ id: p.id, coord: p.coord, hasBall: p.hasBall })));
  });

  it('(b) 異なるseed（別ターン）では配置が変化する（単調さの解消）', () => {
    const r1 = createSetPieceRestartPieces(baseArgs({ seed: 5, turn: 5 }));
    const r2 = createSetPieceRestartPieces(baseArgs({ seed: 9, turn: 9 }));
    const coords1 = JSON.stringify(r1.map(p => p.coord));
    const coords2 = JSON.stringify(r2.map(p => p.coord));
    expect(coords1).not.toBe(coords2);
  });

  it('(c) 全コマ盤面範囲内・重なりなし・GKは自ゴール前・ボールは守備側GK保持', () => {
    for (const defenseTeam of ['home', 'away'] as const) {
      const result = createSetPieceRestartPieces(baseArgs({ defenseTeam }));
      expect(result).toHaveLength(22);
      const fieldPieces = result.filter(p => !p.isBench);
      // 盤面範囲
      for (const p of fieldPieces) {
        expect(p.coord.col).toBeGreaterThanOrEqual(0);
        expect(p.coord.col).toBeLessThanOrEqual(21);
        expect(p.coord.row).toBeGreaterThanOrEqual(0);
        expect(p.coord.row).toBeLessThanOrEqual(MAX_ROW);
      }
      // 重なりなし
      const coords = fieldPieces.map(p => `${p.coord.col},${p.coord.row}`);
      expect(new Set(coords).size).toBe(coords.length);
      // GKは自ゴール前
      const homeGk = fieldPieces.find(p => p.team === 'home' && p.position === 'GK');
      const awayGk = fieldPieces.find(p => p.team === 'away' && p.position === 'GK');
      expect(homeGk!.coord.row).toBeLessThanOrEqual(3);
      expect(awayGk!.coord.row).toBeGreaterThanOrEqual(MAX_ROW - 3);
      // ボールは守備側GKのみ
      const holders = result.filter(p => p.hasBall);
      expect(holders).toHaveLength(1);
      expect(holders[0].team).toBe(defenseTeam);
      expect(holders[0].position).toBe('GK');
    }
  });

  it('(d) フォーメーションの相対形状が概ね保存される（左サイドのコマは左サイドのまま）', () => {
    const base = createInitialPieces();
    // デフォルト4-4-2の home WG は col 4（左サイド）、SBは col 4/16
    const result = createSetPieceRestartPieces(baseArgs({ currentPieces: base }));
    const wg = result.find(p => p.team === 'home' && p.position === 'WG' && !p.isBench)!;
    expect(wg.coord.col).toBeLessThan(10); // 揺らぎ±1+衝突回避±3があっても左サイドに留まる
    // 守備側(home)のFPは自陣寄り、攻撃側(away)のFPはハーフライン付近に前進している
    const homeFp = result.filter(p => p.team === 'home' && !p.isBench && p.position !== 'GK');
    const awayFp = result.filter(p => p.team === 'away' && !p.isBench && p.position !== 'GK');
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const homeAvgDepth = avg(homeFp.map(p => p.coord.row));            // home深度 = row
    const awayAvgDepth = avg(awayFp.map(p => MAX_ROW - p.coord.row));  // away深度 = MAX_ROW - row
    expect(homeAvgDepth).toBeLessThan(awayAvgDepth); // 守備側は深く、攻撃側は前進
  });

  it('(e) ビハインド終盤のチームは同点時より前方に配置される', () => {
    const tied = createSetPieceRestartPieces(baseArgs({ scoreHome: 1, scoreAway: 1, turn: 28, maxTurn: 32 }));
    const behind = createSetPieceRestartPieces(baseArgs({ scoreHome: 0, scoreAway: 1, turn: 28, maxTurn: 32 }));
    const avgDepth = (pieces: typeof tied) => {
      const fps = pieces.filter(p => p.team === 'home' && !p.isBench && p.position !== 'GK');
      return fps.reduce((a, p) => a + p.coord.row, 0) / fps.length; // home深度 = row
    };
    expect(avgDepth(behind)).toBeGreaterThan(avgDepth(tied));
  });

  it("restartType 'fk_fail'/'pk_fail' は 'goalkick' より守備側のラインが高い", () => {
    const gkick = createSetPieceRestartPieces(baseArgs({ restartType: 'goalkick' }));
    const fkFail = createSetPieceRestartPieces(baseArgs({ restartType: 'fk_fail' }));
    const avgDepth = (pieces: typeof gkick) => {
      const fps = pieces.filter(p => p.team === 'home' && !p.isBench && p.position !== 'GK');
      return fps.reduce((a, p) => a + p.coord.row, 0) / fps.length;
    };
    expect(avgDepth(fkFail)).toBeGreaterThan(avgDepth(gkick));
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

// ────────────────────────────────────────────────────────────
// calcPieceMoveDurationMs（D2: コマ移動の距離連動速度）
// ────────────────────────────────────────────────────────────
describe('calcPieceMoveDurationMs', () => {
  it('移動なし（距離0以下・非有限）は0', () => {
    expect(calcPieceMoveDurationMs(0)).toBe(0);
    expect(calcPieceMoveDurationMs(-10)).toBe(0);
    expect(calcPieceMoveDurationMs(NaN)).toBe(0);
    expect(calcPieceMoveDurationMs(Infinity)).toBe(0);
  });

  it('短距離は下限にクランプ（1HEX ≈ 45px → 300ms）', () => {
    expect(calcPieceMoveDurationMs(45)).toBe(PIECE_MOVE_MIN_MS);
    expect(calcPieceMoveDurationMs(1)).toBe(PIECE_MOVE_MIN_MS);
  });

  it('中距離は距離比例（丸め込み）', () => {
    const dist = 150; // 約3.5HEX
    expect(calcPieceMoveDurationMs(dist)).toBe(Math.round(dist * PIECE_MOVE_MS_PER_PX)); // 450ms
  });

  it('長距離は上限にクランプ（従来の0.8sと同じ）', () => {
    expect(calcPieceMoveDurationMs(300)).toBe(PIECE_MOVE_MAX_MS);
    expect(calcPieceMoveDurationMs(10000)).toBe(PIECE_MOVE_MAX_MS);
  });
});

// ────────────────────────────────────────────────────────────
// getMissedShootRestart（G1: 枠外シュート → 守備側ゴールキック）
// ────────────────────────────────────────────────────────────
describe('getMissedShootRestart', () => {
  it('homeのmissedシュートでawayがゴールキック側になる', () => {
    const events: GameEvent[] = [
      { type: 'SHOOT', phase: 2, shooterId: 'h09', result: { outcome: 'missed' } },
    ] as unknown as GameEvent[];
    expect(getMissedShootRestart(events)).toEqual({ shooterTeam: 'home', defenseTeam: 'away' });
  });

  it('awayのmissedシュートでhomeがゴールキック側になる', () => {
    const events: GameEvent[] = [
      { type: 'SHOOT', phase: 2, shooterId: 'a09', result: { outcome: 'missed' } },
    ] as unknown as GameEvent[];
    expect(getMissedShootRestart(events)).toEqual({ shooterTeam: 'away', defenseTeam: 'home' });
  });

  it('missed以外のoutcome（goal/blocked/saved_catch/saved_ck）ではnull', () => {
    for (const outcome of ['goal', 'blocked', 'saved_catch', 'saved_ck']) {
      const events: GameEvent[] = [
        { type: 'SHOOT', phase: 2, shooterId: 'h09', result: { outcome } },
      ] as unknown as GameEvent[];
      expect(getMissedShootRestart(events)).toBeNull();
    }
    expect(getMissedShootRestart([])).toBeNull();
  });

  it('missed検出 → createSetPieceRestartPiecesで守備側GKがボールを持ち再配置される', () => {
    // シューター（home）がhasBallを持ったまま残るエンジン仕様を再現した盤面
    const pieces = createInitialPieces(undefined);
    const shooter = pieces.find(p => p.team === 'home' && p.position === 'FW' && !p.isBench)!;
    for (const p of pieces) p.hasBall = false;
    shooter.hasBall = true;
    shooter.coord = { col: 10, row: 30 }; // 敵陣深く

    const events: GameEvent[] = [
      { type: 'SHOOT', phase: 2, shooterId: shooter.id, result: { outcome: 'missed' } },
    ] as unknown as GameEvent[];
    const restart = getMissedShootRestart(events);
    expect(restart).not.toBeNull();

    const gkPieces = createSetPieceRestartPieces({
      currentPieces: pieces, defenseTeam: restart!.defenseTeam, restartType: 'goalkick',
      seed: 10, scoreHome: 0, scoreAway: 0, turn: 10, maxTurn: 32,
    });
    const holders = gkPieces.filter(p => p.hasBall);
    expect(holders).toHaveLength(1);
    expect(holders[0].team).toBe('away');       // 守備側がボール保持
    expect(holders[0].position).toBe('GK');     // 保持者はGK
    // 守備側（away）は自陣（row 17〜33）に再配置される
    for (const p of gkPieces.filter(pp => pp.team === 'away' && !pp.isBench)) {
      expect(p.coord.row).toBeGreaterThanOrEqual(17);
    }
  });
});

// ────────────────────────────────────────────────────────────
// pickHeadingChanceReceiver（G3: CKヘディングチャンスの受け手選定）
// ────────────────────────────────────────────────────────────
describe('pickHeadingChanceReceiver', () => {
  const mk = (id: string, position: string, col: number, row: number, isBench = false): PieceData => ({
    id, team: 'home', position: position as PieceData['position'], cost: 1,
    coord: { col, row }, hasBall: false, moveRange: 4, isBench,
  });

  it('遠くのFWより相手ゴールに近い非GKを選ぶ（距離が第一条件）', () => {
    const pieces = [
      mk('h_gk', 'GK', 10, 30),            // GKは対象外（ゴール前でも選ばれない）
      mk('h_fw', 'FW', 10, 16),            // FWだがハーフライン付近（遠い）
      mk('h_mf', 'MF', 10, 31),            // ゴール至近のMF
    ];
    expect(pickHeadingChanceReceiver(pieces, 'home')?.id).toBe('h_mf');
  });

  it('同距離ならFWを優先する', () => {
    const pieces = [
      mk('h_mf', 'MF', 8, 30),
      mk('h_fw', 'FW', 12, 30), // 対称位置（ゴールcol10から同距離）
    ];
    expect(pickHeadingChanceReceiver(pieces, 'home')?.id).toBe('h_fw');
  });

  it('ベンチのコマは対象外', () => {
    const pieces = [
      mk('h_bench_fw', 'FW', 10, 32, true),
      mk('h_mf', 'MF', 10, 20),
    ];
    expect(pickHeadingChanceReceiver(pieces, 'home')?.id).toBe('h_mf');
  });

  it('非GKが1体もいなければ攻撃側の任意のコマにフォールバック', () => {
    const pieces = [mk('h_gk', 'GK', 10, 1)];
    expect(pickHeadingChanceReceiver(pieces, 'home')?.id).toBe('h_gk');
    expect(pickHeadingChanceReceiver([], 'home')).toBeNull();
  });

  it('away攻撃はrow 0側のゴールに近いコマを選ぶ', () => {
    const pieces = [
      { ...mk('a_fw', 'FW', 10, 20), team: 'away' as const },
      { ...mk('a_mf', 'MF', 10, 3), team: 'away' as const },
    ];
    expect(pickHeadingChanceReceiver(pieces, 'away')?.id).toBe('a_mf');
  });
});
