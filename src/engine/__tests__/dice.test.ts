// ============================================================
// dice.test.ts — 基本判定式と確率ロール（dice.ts）
// ============================================================
//
// 検証項目:
//   - effectiveDiff: 同コスト→0, 異ランク帯→±1, 同ランク帯0.5差→±2
//   - calcProbability: 基本判定式 + ポジション修正 + ZOC修正 + クランプ
//   - calcZocModifier: 攻撃/守備カウント × 係数
//   - roll: 0〜99 の乱数
//   - judge: 確率判定（roll < probability → 成功）
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { effectiveDiff, calcProbability, calcZocModifier, judge } from '../dice';
import * as diceModule from '../dice';

vi.mock('../dice', async () => {
  const actual = await vi.importActual<typeof import('../dice')>('../dice');
  return { ...actual, roll: vi.fn() };
});
const mockRoll = vi.mocked(diceModule.roll);

// ============================================================
// effectiveDiff: 有効差（ランク帯システム）
// ============================================================
describe('effectiveDiff', () => {
  // 同コスト → 0
  describe('同コスト → 0', () => {
    it.each([
      [1, 1],
      [1.5, 1.5],
      [2, 2],
      [2.5, 2.5],
      [3, 3],
    ] as const)('cost %s vs %s → 0', (x, y) => {
      expect(effectiveDiff(x, y)).toBe(0);
    });
  });

  // 異ランク帯 → ±1
  describe('異ランク帯 → ±1', () => {
    it.each([
      [1, 2, -1],
      [2, 1, 1],
      [1, 3, -1],
      [3, 1, 1],
      [1.5, 2, -1],
      [2, 1.5, 1],
      [2, 3, -1],
      [3, 2, 1],
      [2.5, 3, -1],
      [3, 2.5, 1],
    ] as const)('cost %s vs %s → %s', (x, y, expected) => {
      expect(effectiveDiff(x, y)).toBe(expected);
    });
  });

  // 同ランク帯の0.5差 → ±2
  describe('同ランク帯の0.5差 → ±2', () => {
    it.each([
      [1, 1.5, -2],
      [1.5, 1, 2],
      [2, 2.5, -2],
      [2.5, 2, 2],
    ] as const)('cost %s vs %s → %s', (x, y, expected) => {
      expect(effectiveDiff(x, y)).toBe(expected);
    });
  });
});

// ============================================================
// calcProbability: 基本判定式
// ============================================================
describe('calcProbability', () => {
  // 基本式: (effectiveDiff(x,y) + 3) × omega
  it('同コスト: calcProbability(2, 2, 15) = (0+3)*15 = 45', () => {
    expect(calcProbability(2, 2, 15)).toBe(45);
  });

  it('守備有利: calcProbability(3, 1, 18) = (1+3)*18 = 72', () => {
    expect(calcProbability(3, 1, 18)).toBe(72);
  });

  it('守備不利: calcProbability(1, 3, 18) = (-1+3)*18 = 36', () => {
    expect(calcProbability(1, 3, 18)).toBe(36);
  });

  // ポジション修正
  it('ポジション修正あり: calcProbability(2, 2, 15, 20) = 45+20 = 65', () => {
    expect(calcProbability(2, 2, 15, 20)).toBe(65);
  });

  // ZOC修正
  it('ZOC修正あり: calcProbability(2, 2, 15, 0, 10) = 45+10 = 55', () => {
    expect(calcProbability(2, 2, 15, 0, 10)).toBe(55);
  });

  // クランプ: 下限0
  it('クランプ下限: calcProbability(1, 1.5, 10, -30) = max(0, -20) = 0', () => {
    expect(calcProbability(1, 1.5, 10, -30)).toBe(0);
  });

  // クランプ: 上限100
  it('クランプ上限: calcProbability(3, 1, 18, 40) = min(100, 112) = 100', () => {
    expect(calcProbability(3, 1, 18, 40)).toBe(100);
  });
});

// ============================================================
// calcZocModifier: ZOC隣接修正
// ============================================================
describe('calcZocModifier', () => {
  it('カウント0 → 0', () => {
    expect(calcZocModifier({ attackCount: 0, defenseCount: 0 }, -10, 5)).toBe(0);
  });

  it('攻撃側のみ: {attack:2, defense:0}, -10, +5 → -20', () => {
    expect(calcZocModifier({ attackCount: 2, defenseCount: 0 }, -10, 5)).toBe(-20);
  });

  it('守備側のみ: {attack:0, defense:3}, -10, +5 → 15', () => {
    expect(calcZocModifier({ attackCount: 0, defenseCount: 3 }, -10, 5)).toBe(15);
  });

  it('混合: {attack:1, defense:2}, -10, +5 → -10+10 = 0', () => {
    expect(calcZocModifier({ attackCount: 1, defenseCount: 2 }, -10, 5)).toBe(0);
  });
});

// ============================================================
// roll: 0〜99 の乱数
// ============================================================
describe('roll', () => {
  it('0〜99 の整数を返す', () => {
    // roll はモック済みなので、実装を復元してテスト
    mockRoll.mockImplementation(() => Math.floor(Math.random() * 100));
    for (let i = 0; i < 100; i++) {
      const r = diceModule.roll();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(99);
      expect(Number.isInteger(r)).toBe(true);
    }
    mockRoll.mockReset();
  });
});

// ============================================================
// judge: 確率判定（roll < probability → 成功）
// ============================================================
describe('judge', () => {
  it('probability=100 → roll=99 でも成功', () => {
    // Math.random を固定して roll() の出力を制御
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // floor(0.99*100) = 99
    const result = judge(100);
    expect(result.success).toBe(true);
    expect(result.probability).toBe(100);
    expect(result.roll).toBe(99);
    vi.restoreAllMocks();
  });

  it('probability=0 → roll=0 でも失敗', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0); // floor(0.0*100) = 0
    const result = judge(0);
    expect(result.success).toBe(false);
    expect(result.probability).toBe(0);
    expect(result.roll).toBe(0);
    vi.restoreAllMocks();
  });

  it('境界値: roll=59, probability=60 → 成功（59 < 60）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.59); // floor(0.59*100) = 59
    const result = judge(60);
    expect(result.success).toBe(true);
    expect(result.probability).toBe(60);
    expect(result.roll).toBe(59);
    vi.restoreAllMocks();
  });
});
