// ============================================================
// evaluator.test.ts — 局面評価のユニットテスト（§4）
// ============================================================

import { describe, it, expect } from 'vitest';
import { evaluateBoard, recommendStrategy } from '../evaluator';
import type { EvaluationResult, Strategy } from '../evaluator';
import type { Piece } from '../../engine/types';

// ── ヘルパー ──

function makePiece(overrides: Partial<Piece> & Pick<Piece, 'id' | 'coord'>): Piece {
  return {
    team: 'home',
    position: 'MF',
    cost: 2,
    hasBall: false,
    ...overrides,
  };
}

// ================================================================
// §1 recommendStrategy
// ================================================================

describe('recommendStrategy', () => {
  it('tied game → balanced', () => {
    expect(recommendStrategy(0, 20, 36)).toBe('balanced');
  });

  it('leading by 1 → balanced', () => {
    expect(recommendStrategy(1, 10, 36)).toBe('balanced');
  });

  it('trailing by 1 → attack', () => {
    expect(recommendStrategy(-1, 10, 36)).toBe('attack');
  });

  it('trailing by 1, 8 turns left → desperate_attack', () => {
    expect(recommendStrategy(-1, 28, 36)).toBe('desperate_attack');
  });

  it('leading by 1, 8 turns left → defend', () => {
    expect(recommendStrategy(1, 28, 36)).toBe('defend');
  });
});

// ================================================================
// §2 evaluateBoard — ballPosition
// ================================================================

describe('evaluateBoard — ballPosition', () => {
  it('home holds ball at row 30 (ファイナルサード) → positive', () => {
    const pieces: Piece[] = [
      makePiece({ id: 'h1', coord: { col: 10, row: 30 }, hasBall: true, position: 'FW' }),
    ];
    const result = evaluateBoard(pieces, 'home', 0, 0, 10);
    expect(result.ballPosition).toBe(50);
  });

  it('opponent holds ball in our defensive zone → negative', () => {
    const pieces: Piece[] = [
      makePiece({ id: 'a1', coord: { col: 10, row: 2 }, team: 'away', hasBall: true, position: 'FW' }),
    ];
    // away holds ball at row 2 = ディフェンシブGサード (absolute).
    // away team normalizes: ディフェンシブGサード → ファイナルサード → score +50.
    // But away is opponent of home → ballPosition = -50 for home.
    const result = evaluateBoard(pieces, 'home', 0, 0, 10);
    expect(result.ballPosition).toBe(-50);
  });

  it('no ball holder → ballPosition = 0', () => {
    const pieces: Piece[] = [
      makePiece({ id: 'h1', coord: { col: 10, row: 15 } }),
    ];
    const result = evaluateBoard(pieces, 'home', 0, 0, 10);
    expect(result.ballPosition).toBe(0);
  });
});

// ================================================================
// §3 evaluateBoard — piecePlacement
// ================================================================

describe('evaluateBoard — piecePlacement', () => {
  it('GK inside PA for home (row ≤ 5, col 4-17) → +20', () => {
    const pieces: Piece[] = [
      makePiece({ id: 'gk1', coord: { col: 10, row: 2 }, position: 'GK' }),
    ];
    const result = evaluateBoard(pieces, 'home', 0, 0, 10);
    // GK in PA (+20) + GK in ディフェンシブGサード zone bonus (+5)
    expect(result.piecePlacement).toBe(25);
  });

  it('GK outside PA (row 15) → -30', () => {
    const pieces: Piece[] = [
      makePiece({ id: 'gk1', coord: { col: 10, row: 15 }, position: 'GK' }),
    ];
    const result = evaluateBoard(pieces, 'home', 0, 0, 10);
    expect(result.piecePlacement).toBe(-30);
  });

  it('FW at high row (attacking zone for home) → gets bonus', () => {
    const pieces: Piece[] = [
      makePiece({ id: 'fw1', coord: { col: 10, row: 25 }, position: 'FW' }),
    ];
    const result = evaluateBoard(pieces, 'home', 0, 0, 10);
    // row 25 = アタッキングサード. FW in アタッキングサード: zone bonus +5, attack bonus +8 = 13
    expect(result.piecePlacement).toBe(13);
  });
});

// ================================================================
// §4 evaluateBoard — situational
// ================================================================

describe('evaluateBoard — situational', () => {
  const emptyPieces: Piece[] = [];

  it('leading → +20', () => {
    const result = evaluateBoard(emptyPieces, 'home', 2, 1, 10);
    expect(result.situational).toBe(20);
  });

  it('behind → -20', () => {
    const result = evaluateBoard(emptyPieces, 'home', 0, 1, 10);
    expect(result.situational).toBe(-20);
  });

  it('behind with ≤10 remaining → -20 + 20 = 0', () => {
    const result = evaluateBoard(emptyPieces, 'home', 0, 1, 28);
    expect(result.situational).toBe(0);
  });

  it('leading with ≤5 remaining → +20 + 20 = +40', () => {
    const result = evaluateBoard(emptyPieces, 'home', 2, 1, 32);
    expect(result.situational).toBe(40);
  });
});

// ================================================================
// §5 evaluateBoard — total is sum of components
// ================================================================

describe('evaluateBoard — total', () => {
  it('total equals sum of all four components', () => {
    const pieces: Piece[] = [
      makePiece({ id: 'gk1', coord: { col: 10, row: 2 }, position: 'GK' }),
      makePiece({ id: 'fw1', coord: { col: 10, row: 30 }, position: 'FW', hasBall: true }),
    ];
    const result = evaluateBoard(pieces, 'home', 1, 0, 10);
    const sum = result.ballPosition + result.piecePlacement + result.zocControl + result.situational;
    expect(result.total).toBe(sum);
  });
});
