// ============================================================
// collision.test.ts — 同一HEX競合判定（§7-6）
// ============================================================
//
// 検証項目:
//   - 全コスト差(-2〜+2)×Ω=15 の確率表（ポジション修正なし, ZOC修正なし）
//   - 勝者/敗者の割り当て（success=true → pieceA勝利）
//   - 同コスト同士の競合確率 = 45%
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as diceModule from '../dice';
import { calcProbability } from '../dice';
import { resolveCollision } from '../collision';
import type { Cost, Piece, ZocAdjacency } from '../types';

vi.mock('../dice', async () => {
  const actual = await vi.importActual<typeof import('../dice')>('../dice');
  return { ...actual, judge: vi.fn() };
});
const mockJudge = vi.mocked(diceModule.judge);

type JR = { success: boolean; probability: number; roll: number };
const ok = (p = 100): JR => ({ success: true,  probability: p, roll: 0 });
const ng = (p = 0):   JR => ({ success: false, probability: p, roll: 99 });
const noZoc: ZocAdjacency = { attackCount: 0, defenseCount: 0 };

function makePiece(overrides: Partial<Piece> & Pick<Piece, 'id' | 'position' | 'cost' | 'team' | 'coord'>): Piece {
  return { hasBall: false, ...overrides };
}

beforeEach(() => mockJudge.mockReset());

// ============================================================
// 競合確率表（Ω=15, ポジション修正=0, ZOC修正=0）
// calcProbability = (effectiveDiff(A, B) + 3) × 15
// ============================================================
describe('競合確率表 (Ω=15, 修正なし, 有効差ベース)', () => {
  // [pieceAコスト, pieceBコスト, 期待確率]
  const TABLE: [Cost, Cost, number][] = [
    // 同コスト → eDiff=0 → (0+3)*15 = 45
    [1, 1, 45],
    [1.5, 1.5, 45],
    [2, 2, 45],
    [2.5, 2.5, 45],
    [3, 3, 45],

    // 同ランク帯の0.5差 → eDiff=±2
    [1.5, 1, 75],   // (2+3)*15 = 75
    [1, 1.5, 15],   // (-2+3)*15 = 15
    [2.5, 2, 75],   // (2+3)*15 = 75
    [2, 2.5, 15],   // (-2+3)*15 = 15

    // 異ランク帯 → eDiff=±1
    [2, 1, 60],     // (1+3)*15 = 60
    [1, 2, 30],     // (-1+3)*15 = 30
    [3, 2, 60],     // (1+3)*15 = 60
    [2, 3, 30],     // (-1+3)*15 = 30
    [3, 1, 60],     // (1+3)*15 = 60
    [1, 3, 30],     // (-1+3)*15 = 30
  ];

  it.each(TABLE)(
    'pieceA cost%s vs pieceB cost%s → %s%%',
    (costA, costB, expected) => {
      expect(calcProbability(costA, costB, 15)).toBe(expected);
    },
  );
});

// ============================================================
// 特定の有効差ごとの確率（Ω=15, 修正なし）
// ============================================================
describe('有効差ごとの確率確認', () => {
  it('同コスト: (0+3)*15 = 45', () => {
    expect(calcProbability(2, 2, 15)).toBe(45);
  });

  it('仕掛け側有利(+1): (1+3)*15 = 60', () => {
    expect(calcProbability(2, 1, 15)).toBe(60);
  });

  it('仕掛け側不利(-1): (-1+3)*15 = 30', () => {
    expect(calcProbability(1, 2, 15)).toBe(30);
  });

  it('同ランク帯+2: (2+3)*15 = 75', () => {
    expect(calcProbability(1.5, 1, 15)).toBe(75);
  });

  it('同ランク帯-2: (-2+3)*15 = 15', () => {
    expect(calcProbability(1, 1.5, 15)).toBe(15);
  });
});

// ============================================================
// resolveCollision: 勝者/敗者の割り当て
// ============================================================
describe('resolveCollision: 勝者/敗者の割り当て', () => {
  it('judge成功 → winner=pieceA, loser=pieceB', () => {
    mockJudge.mockReturnValue(ok(45));
    const pieceA = makePiece({ id: 'a', position: 'MF', cost: 2, team: 'home', coord: { col: 10, row: 16 } });
    const pieceB = makePiece({ id: 'b', position: 'MF', cost: 2, team: 'away', coord: { col: 10, row: 16 } });

    const result = resolveCollision({ pieceA, pieceB, zoc: noZoc });

    expect(result.success).toBe(true);
    expect(result.winner.id).toBe('a');
    expect(result.loser.id).toBe('b');
  });

  it('judge失敗 → winner=pieceB, loser=pieceA', () => {
    mockJudge.mockReturnValue(ng(45));
    const pieceA = makePiece({ id: 'a', position: 'MF', cost: 2, team: 'home', coord: { col: 10, row: 16 } });
    const pieceB = makePiece({ id: 'b', position: 'MF', cost: 2, team: 'away', coord: { col: 10, row: 16 } });

    const result = resolveCollision({ pieceA, pieceB, zoc: noZoc });

    expect(result.success).toBe(false);
    expect(result.winner.id).toBe('b');
    expect(result.loser.id).toBe('a');
  });
});

// ============================================================
// 同コスト競合: 45% で judge が呼ばれることを確認
// ============================================================
describe('同コスト競合は45%', () => {
  it('calcProbability で 45 を確認し、judge に渡される', () => {
    // まず calcProbability 単体で確認
    const prob = calcProbability(2, 2, 15, 0, 0);
    expect(prob).toBe(45);

    // resolveCollision 経由で judge(45) が呼ばれることを確認
    mockJudge.mockReturnValue(ok(45));
    const pieceA = makePiece({ id: 'a', position: 'DF', cost: 2, team: 'home', coord: { col: 5, row: 10 } });
    const pieceB = makePiece({ id: 'b', position: 'FW', cost: 2, team: 'away', coord: { col: 5, row: 10 } });

    resolveCollision({ pieceA, pieceB, zoc: noZoc });

    // ZOC修正なし（係数0,0）のため calcZocModifier=0 → prob=45
    expect(mockJudge).toHaveBeenCalledWith(45);
  });
});
