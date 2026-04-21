// ============================================================
// legal_moves.test.ts — 合法手生成のユニットテスト（§5）
// ============================================================

import { describe, it, expect } from 'vitest';
import { generateAllLegalMoves } from '../legal_moves';
import type { LegalMovesContext, PieceLegalMoves, LegalAction } from '../legal_moves';
import type { Piece } from '../../engine/types';

// ── 標準ピース配置 ──

function makeStandardPieces(): Piece[] {
  const home: Piece[] = [
    { id: 'h_gk', position: 'GK', cost: 1, team: 'home', coord: { col: 10, row: 1 }, hasBall: false },
    { id: 'h_df1', position: 'DF', cost: 1, team: 'home', coord: { col: 6, row: 7 }, hasBall: false },
    { id: 'h_df2', position: 'DF', cost: 1, team: 'home', coord: { col: 14, row: 7 }, hasBall: false },
    { id: 'h_sb1', position: 'SB', cost: 1, team: 'home', coord: { col: 3, row: 8 }, hasBall: false },
    { id: 'h_sb2', position: 'SB', cost: 1, team: 'home', coord: { col: 17, row: 8 }, hasBall: false },
    { id: 'h_mf1', position: 'MF', cost: 1, team: 'home', coord: { col: 7, row: 13 }, hasBall: false },
    { id: 'h_mf2', position: 'MF', cost: 1, team: 'home', coord: { col: 13, row: 13 }, hasBall: false },
    { id: 'h_vo1', position: 'VO', cost: 1, team: 'home', coord: { col: 9, row: 11 }, hasBall: false },
    { id: 'h_vo2', position: 'VO', cost: 1, team: 'home', coord: { col: 11, row: 11 }, hasBall: false },
    { id: 'h_fw1', position: 'FW', cost: 1, team: 'home', coord: { col: 8, row: 19 }, hasBall: true },
    { id: 'h_fw2', position: 'FW', cost: 1, team: 'home', coord: { col: 12, row: 19 }, hasBall: false },
  ];
  const away: Piece[] = [
    { id: 'a_gk', position: 'GK', cost: 1, team: 'away', coord: { col: 10, row: 32 }, hasBall: false },
    { id: 'a_df1', position: 'DF', cost: 1, team: 'away', coord: { col: 6, row: 26 }, hasBall: false },
    { id: 'a_df2', position: 'DF', cost: 1, team: 'away', coord: { col: 14, row: 26 }, hasBall: false },
    { id: 'a_sb1', position: 'SB', cost: 1, team: 'away', coord: { col: 3, row: 25 }, hasBall: false },
    { id: 'a_sb2', position: 'SB', cost: 1, team: 'away', coord: { col: 17, row: 25 }, hasBall: false },
    { id: 'a_mf1', position: 'MF', cost: 1, team: 'away', coord: { col: 7, row: 20 }, hasBall: false },
    { id: 'a_mf2', position: 'MF', cost: 1, team: 'away', coord: { col: 13, row: 20 }, hasBall: false },
    { id: 'a_vo1', position: 'VO', cost: 1, team: 'away', coord: { col: 9, row: 22 }, hasBall: false },
    { id: 'a_vo2', position: 'VO', cost: 1, team: 'away', coord: { col: 11, row: 22 }, hasBall: false },
    { id: 'a_fw1', position: 'FW', cost: 1, team: 'away', coord: { col: 8, row: 14 }, hasBall: false },
    { id: 'a_fw2', position: 'FW', cost: 1, team: 'away', coord: { col: 12, row: 14 }, hasBall: false },
  ];
  return [...home, ...away];
}

function makeCtx(overrides?: Partial<LegalMovesContext>): LegalMovesContext {
  return {
    pieces: makeStandardPieces(),
    myTeam: 'home',
    remainingSubs: 0,
    maxFieldCost: 16,
    benchPieces: [],
    ...overrides,
  };
}

function getActions(result: PieceLegalMoves[], pieceId: string): LegalAction[] {
  const entry = result.find((r) => r.pieceId === pieceId);
  if (!entry) throw new Error(`pieceId ${pieceId} not found`);
  return entry.legalActions;
}

function actionTypes(actions: LegalAction[]): string[] {
  return [...new Set(actions.map((a) => a.action))];
}

// ── テスト ──

describe('generateAllLegalMoves', () => {
  it('returns one entry per myTeam field piece (11 entries)', () => {
    const result = generateAllLegalMoves(makeCtx());
    expect(result).toHaveLength(11);
    const ids = result.map((r) => r.pieceId);
    expect(ids).toContain('h_gk');
    expect(ids).toContain('h_fw1');
    expect(ids).toContain('h_fw2');
  });

  it('every piece has at least stay as a legal action', () => {
    const result = generateAllLegalMoves(makeCtx());
    for (const entry of result) {
      const types = actionTypes(entry.legalActions);
      expect(types).toContain('stay');
    }
  });

  it('non-ball-holder has move but NOT dribble, pass, or shoot', () => {
    const result = generateAllLegalMoves(makeCtx());
    const actions = getActions(result, 'h_df1');
    const types = actionTypes(actions);
    expect(types).toContain('move');
    expect(types).not.toContain('dribble');
    expect(types).not.toContain('pass');
    expect(types).not.toContain('shoot');
  });

  it('ball holder has dribble actions', () => {
    const result = generateAllLegalMoves(makeCtx());
    const actions = getActions(result, 'h_fw1');
    const types = actionTypes(actions);
    expect(types).toContain('dribble');
  });

  it('ball holder near goal has shoot actions (row 28 for home)', () => {
    const pieces = makeStandardPieces();
    const fw1 = pieces.find((p) => p.id === 'h_fw1')!;
    fw1.coord = { col: 10, row: 28 };
    const result = generateAllLegalMoves(makeCtx({ pieces }));
    const actions = getActions(result, 'h_fw1');
    const types = actionTypes(actions);
    expect(types).toContain('shoot');
    const shootActions = actions.filter((a) => a.action === 'shoot');
    expect(shootActions.length).toBe(6); // 6 shoot zones
  });

  it('ball holder has pass actions when teammates are in range', () => {
    const result = generateAllLegalMoves(makeCtx());
    const actions = getActions(result, 'h_fw1');
    const passActions = actions.filter((a) => a.action === 'pass');
    expect(passActions.length).toBeGreaterThan(0);
    for (const pa of passActions) {
      expect(pa.targetPieceId).toBeDefined();
      expect(pa.targetPieceId).toMatch(/^h_/);
    }
  });

  it('substitute appears when remainingSubs > 0 and benchPieces provided', () => {
    const benchPiece: Piece = {
      id: 'h_bench1', position: 'MF', cost: 1, team: 'home',
      coord: { col: 0, row: 0 }, hasBall: false,
    };
    const result = generateAllLegalMoves(makeCtx({
      remainingSubs: 1,
      benchPieces: [benchPiece],
    }));
    const allSub = result.flatMap((r) => r.legalActions.filter((a) => a.action === 'substitute'));
    expect(allSub.length).toBeGreaterThan(0);
    expect(allSub[0].benchPieceId).toBe('h_bench1');
  });
});
