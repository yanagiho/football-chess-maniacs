// ============================================================
// shoot.test.ts — シュート判定チェーン（§7-2）テスト
// ============================================================
//
// 検証項目:
//   - calcProbability: 全コスト差(-2〜+2) × Ω=10/15
//   - シュートブロック: DF/SB/FW/WG/OM の全ポジション修正
//   - セービング: 距離修正 / GK-ZOC内守備コマ / 全シューター修正
//   - キャッチ: GKコスト1/2/3
//   - シュート成功: 距離 / ZOC修正 0-3体
//   - resolveShootChain: goal / blocked / saved_catch / saved_ck / missed
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as diceModule from '../dice';
import { calcProbability, effectiveDiff } from '../dice';
import {
  blockCheck,
  calcShootCourseModifier,
  catchCheck,
  resolveShootChain,
  savingCheck,
  shootSuccessCheck,
} from '../shoot';
import type { Cost, Piece, ZocAdjacency } from '../types';

// ── モック設定 ────────────────────────────────────────────────
vi.mock('../dice', async () => {
  const actual = await vi.importActual<typeof import('../dice')>('../dice');
  return { ...actual, judge: vi.fn() };
});
const mockJudge = vi.mocked(diceModule.judge);

// ── テストヘルパー ─────────────────────────────────────────────
type JR = { success: boolean; probability: number; roll: number };
const ok  = (prob = 100): JR => ({ success: true,  probability: prob, roll: 0 });
const ng  = (prob = 0):   JR => ({ success: false, probability: prob, roll: 99 });
const noZoc: ZocAdjacency = { attackCount: 0, defenseCount: 0 };

function makePiece(overrides: Partial<Piece> & Pick<Piece, 'position' | 'cost'>): Piece {
  return {
    id: 'p1', team: 'home', coord: { col: 10, row: 20 }, hasBall: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockJudge.mockReset();
});

// ============================================================
// effectiveDiff — ランク帯システムによる有効差
// ============================================================
describe('effectiveDiff', () => {
  it.each([
    // 同コスト → 0
    [1, 1, 0],
    [1.5, 1.5, 0],
    [2, 2, 0],
    [2.5, 2.5, 0],
    [3, 3, 0],
    // 同ランク帯の0.5差 → ±2
    [1, 1.5, -2],     // 1から見て1.5は同ランク帯で上→不利
    [1.5, 1, 2],      // 1.5から見て1は同ランク帯で下→有利
    [2, 2.5, -2],     // 同ランク帯の0.5差
    [2.5, 2, 2],
    // 異ランク帯 → ±1
    [1, 2, -1],       // 低 vs 中
    [2, 1, 1],
    [1, 3, -1],       // 低 vs 高
    [3, 1, 1],
    [2, 3, -1],       // 中 vs 高
    [3, 2, 1],
    [1.5, 2, -1],     // 低 vs 中
    [2.5, 3, -1],     // 中 vs 高
    [1.5, 2.5, -1],   // 低 vs 中
  ] as [number, number, number][])(
    'effectiveDiff(%s, %s) = %s',
    (x, y, expected) => {
      expect(effectiveDiff(x as Cost, y as Cost)).toBe(expected);
    },
  );
});

// ============================================================
// calcProbability — 基本判定式
// ============================================================
describe('calcProbability', () => {
  // 有効差（effectiveDiff）ベース × Ω=18（タックル基準で確認）
  // calcProbability = (effectiveDiff(x,y) + 3) × Ω
  const TABLE: [Cost, Cost, number, number][] = [
    // x, y, Ω, expected
    [1,   1,   18, 54],  // eDiff=0,  (0+3)×18=54
    [1,   1.5, 18, 18],  // eDiff=-2, (1)×18=18  同ランク帯0.5差
    [1,   2,   18, 36],  // eDiff=-1, (2)×18=36  異ランク帯
    [1,   2.5, 18, 36],  // eDiff=-1, (2)×18=36  異ランク帯
    [1,   3,   18, 36],  // eDiff=-1, (2)×18=36  異ランク帯
    [1.5, 1,   18, 90],  // eDiff=+2, (5)×18=90  同ランク帯0.5差
    [2,   1,   18, 72],  // eDiff=+1, (4)×18=72  異ランク帯
    [2.5, 1,   18, 72],  // eDiff=+1, (4)×18=72  異ランク帯
    [3,   1,   18, 72],  // eDiff=+1, (4)×18=72  異ランク帯
    [3,   3,   18, 54],  // eDiff=0,  (3)×18=54
    // Ω=10（ブロック基準）
    [2,   2,   10, 30],  // eDiff=0,  (3)×10=30
    [3,   1,   10, 40],  // eDiff=+1, (4)×10=40  異ランク帯
    [1,   3,   10, 20],  // eDiff=-1, (2)×10=20  異ランク帯
    // Ω=15（パスカット基準）
    [2,   3,   15, 30],  // eDiff=-1, (2)×15=30  異ランク帯
    [1,   1,   15, 45],  // eDiff=0,  (3)×15=45
    [3,   1,   15, 60],  // eDiff=+1, (4)×15=60  異ランク帯
  ];

  it.each(TABLE)(
    'calcProbability(x=%s, y=%s, Ω=%s) = %s%%',
    (x, y, omega, expected) => {
      expect(calcProbability(x, y, omega)).toBe(expected);
    },
  );

  it('ポジション修正が加算される', () => {
    // eDiff(2,2)=0, (0+3)×10 + 15(DF修正) = 30+15 = 45
    expect(calcProbability(2, 2, 10, 15)).toBe(45);
  });

  it('ZOC修正が加算される', () => {
    // eDiff(2,2)=0, (0+3)×10 + 0 + (-10) = 30 - 10 = 20
    expect(calcProbability(2, 2, 10, 0, -10)).toBe(20);
  });

  it('0%にクランプされる（有効差-1 + 大きな負修正）', () => {
    // eDiff(1,3)=-1, (-1+3)×10 - 20 = 20 - 20 = 0
    expect(calcProbability(1, 3, 10, -20)).toBe(0);
  });

  it('100%にクランプされる', () => {
    // eDiff(3,1)=+1, (1+3)×18 + 50 = 72+50 = 122 → 100
    expect(calcProbability(3, 1, 18, 50)).toBe(100);
  });
});

// ============================================================
// calcShootCourseModifier — ① コース修正
// ============================================================
describe('calcShootCourseModifier', () => {
  it.each([
    [0, 0],
    [1, -15],
    [2, -30],
    [3, -45],
  ])('守備コマ%s体 → %s%%修正', (count, expected) => {
    expect(calcShootCourseModifier(count)).toBe(expected);
  });
});

// ============================================================
// blockCheck — ② シュートブロックチェック（Ω=10）
// ============================================================
describe('blockCheck', () => {
  it.each([
    // [blockerPos, shooterPos, blockerCost, shooterCost, expectedProb]
    // DF(+15) vs MF(修正なし): (2-2+3)×10 +15 = 45
    ['DF', 'MF', 2, 2, 45],
    // SB(+10) vs MF: (2-2+3)×10 +10 = 40
    ['SB', 'MF', 2, 2, 40],
    // MF(修正なし) vs FW(-10): (2-2+3)×10 -10 = 20
    ['MF', 'FW', 2, 2, 20],
    // MF vs WG(-5): 30 -5 = 25
    ['MF', 'WG', 2, 2, 25],
    // MF vs OM(-5): 30 -5 = 25
    ['MF', 'OM', 2, 2, 25],
    // DF(+15) vs FW(-10): 30 +15 -10 = 35
    ['DF', 'FW', 2, 2, 35],
    // DF(+15) vs OM(-5): 30 +15 -5 = 40
    ['DF', 'OM', 2, 2, 40],
    // SB(+10) vs WG(-5): 30 +10 -5 = 35
    ['SB', 'WG', 2, 2, 35],
  ] as const)(
    'ブロック: %s(cost%s) vs %s(cost%s) → %s%%',
    (blockerPos, shooterPos, bCost, sCost, expectedProb) => {
      mockJudge.mockReturnValue(ok(expectedProb));

      const blocker = makePiece({ position: blockerPos, cost: bCost as Cost });
      const shooter = makePiece({ position: shooterPos, cost: sCost as Cost, team: 'away' });
      blockCheck({ blocker, shooter, zoc: noZoc });

      expect(mockJudge).toHaveBeenCalledWith(expectedProb);
    },
  );

  describe('ZOC隣接修正', () => {
    it('攻撃側1体につき-5 / 守備側1体につき+10', () => {
      // (2-2+3)×10 +15(DF) +(-5×2)(攻撃2体) +(+10×1)(守備1体) = 30+15-10+10 = 45
      mockJudge.mockReturnValue(ok(45));
      const blocker = makePiece({ position: 'DF', cost: 2 });
      const shooter = makePiece({ position: 'MF', cost: 2, team: 'away' });
      blockCheck({ blocker, shooter, zoc: { attackCount: 2, defenseCount: 1 } });
      expect(mockJudge).toHaveBeenCalledWith(45);
    });

    it.each([[0,0,30],[1,0,25],[2,0,20],[3,0,15]])(
      '攻撃%s体: ブロック基礎確率 %s%%',
      (atk, def, expected) => {
        mockJudge.mockReturnValue(ok(expected));
        const blocker = makePiece({ position: 'MF', cost: 2 });
        const shooter = makePiece({ position: 'MF', cost: 2, team: 'away' });
        blockCheck({ blocker, shooter, zoc: { attackCount: atk, defenseCount: def } });
        expect(mockJudge).toHaveBeenCalledWith(expected);
      },
    );
  });

  it('成功時は blocker を含む', () => {
    mockJudge.mockReturnValue(ok(30));
    const blocker = makePiece({ id: 'blocker', position: 'DF', cost: 2 });
    const shooter = makePiece({ position: 'FW', cost: 2, team: 'away' });
    const result  = blockCheck({ blocker, shooter, zoc: noZoc });
    expect(result.blocker.id).toBe('blocker');
    expect(result.success).toBe(true);
  });
});

// ============================================================
// savingCheck — ③ セービングチェック（Ω=15）
// ============================================================
describe('savingCheck', () => {
  it.each([
    // [gkCost, shooterPos, shooterCost, distToGk, defInGkZoc, expectedProb]
    // GK2 vs MF2, dist=3: (2-2+3)×15 -0 +(3-2)×5 = 45+5 = 50
    [2, 'MF', 2, 3, 0, 50],
    // GK2 vs FW2(-15), dist=3: 45-15+5 = 35
    [2, 'FW', 2, 3, 0, 35],
    // GK2 vs WG2(-10), dist=3: 45-10+5 = 40
    [2, 'WG', 2, 3, 0, 40],
    // GK2 vs OM2(-10), dist=3: 45-10+5 = 40
    [2, 'OM', 2, 3, 0, 40],
    // GK2 vs FW2, dist=5: 45-15+(5-2)×5 = 45-15+15 = 45
    [2, 'FW', 2, 5, 0, 45],
    // GK2 vs FW2, dist=2: 45-15+(2-2)×5 = 30
    [2, 'FW', 2, 2, 0, 30],
    // GK2 vs MF2, dist=3, defInGkZoc=2: 50 + 2×(-10) = 30
    [2, 'MF', 2, 3, 2, 30],
    // GK3 vs FW3(-15), dist=4, defInGkZoc=0: (3-3+3)×15-15+(4-2)×5 = 45-15+10=40
    [3, 'FW', 3, 4, 0, 40],
  ] as const)(
    'GK%s vs %s%s, dist=%s, defInZoc=%s → %s%%',
    (gkCost, sPos, sCost, dist, defZoc, expectedProb) => {
      mockJudge.mockReturnValue(ok(expectedProb));
      const gk     = makePiece({ position: 'GK', cost: gkCost as Cost, team: 'away' });
      const shooter = makePiece({ position: sPos, cost: sCost as Cost });
      savingCheck({ gk, shooter, distanceToGk: dist, defenderCountInGkZoc: defZoc, zoc: noZoc });
      expect(mockJudge).toHaveBeenCalledWith(expectedProb);
    },
  );

  describe('ZOC隣接修正（セービング）', () => {
    it.each([[0,0],[1,-5],[2,-10],[3,-15]])(
      '攻撃%s体: -5修正 → 基礎確率から減算',
      (atk, zocMod) => {
        const base = 50; // GK2 vs MF2 dist=3 の基礎
        const expected = base + zocMod;
        mockJudge.mockReturnValue(ok(expected));
        const gk     = makePiece({ position: 'GK', cost: 2, team: 'away' });
        const shooter = makePiece({ position: 'MF', cost: 2 });
        savingCheck({ gk, shooter, distanceToGk: 3, defenderCountInGkZoc: 0, zoc: { attackCount: atk, defenseCount: 0 } });
        expect(mockJudge).toHaveBeenCalledWith(expected);
      },
    );
  });
});

// ============================================================
// catchCheck — ③-b キャッチ判定
// ============================================================
describe('catchCheck', () => {
  it.each([
    [1 as Cost, 30],
    [2 as Cost, 60],
    [3 as Cost, 90],
  ])('GKコスト%s → キャッチ確率%s%%', (cost, expected) => {
    mockJudge.mockReturnValue(ok(expected));
    const gk = makePiece({ position: 'GK', cost });
    catchCheck(gk);
    expect(mockJudge).toHaveBeenCalledWith(expected);
  });
});

// ============================================================
// shootSuccessCheck — ④ シュート成功チェック
// ============================================================
describe('shootSuccessCheck', () => {
  it.each([
    // [shooterCost, dist, atk, def, expectedProb]
    // cost2, dist=3, ZOC無: 2×5+70+(3-3)×-5 = 80
    [2, 3, 0, 0, 80],
    // cost1: 1×5+70 = 75
    [1, 3, 0, 0, 75],
    // cost3: 3×5+70 = 85
    [3, 3, 0, 0, 85],
    // cost2, dist=5: 80+(5-3)×-5 = 70
    [2, 5, 0, 0, 70],
    // cost2, dist=8: 80+(8-3)×-5 = 55
    [2, 8, 0, 0, 55],
    // cost2, dist=3, 攻撃2体: 80+2×5 = 90
    [2, 3, 2, 0, 90],
    // cost2, dist=3, 守備3体: 80+3×(-10) = 50
    [2, 3, 0, 3, 50],
    // cost2, dist=3, 攻1+守2: 80+5-20 = 65
    [2, 3, 1, 2, 65],
  ])(
    'cost=%s dist=%s atk=%s def=%s → %s%%',
    (cost, dist, atk, def, expected) => {
      mockJudge.mockReturnValue(ok(expected));
      const shooter = makePiece({ position: 'FW', cost: cost as Cost });
      shootSuccessCheck({
        shooter,
        distanceToGoal: dist,
        zoc: { attackCount: atk, defenseCount: def },
      });
      expect(mockJudge).toHaveBeenCalledWith(expected);
    },
  );

  it('courseMod（コース修正）が適用される', () => {
    // cost2, dist=3, ZOC無, courseMod=-30: 80 + (-30) = 50
    const expected = 50;
    mockJudge.mockReturnValue(ok(expected));
    const shooter = makePiece({ position: 'FW', cost: 2 as Cost });
    shootSuccessCheck({
      shooter,
      distanceToGoal: 3,
      zoc: { attackCount: 0, defenseCount: 0 },
      courseMod: -30,
    });
    expect(mockJudge).toHaveBeenCalledWith(expected);
  });

  it('courseMod=-45でもクランプ0%を下回らない', () => {
    // cost1, dist=8: 75+(8-3)*-5 = 50, courseMod=-60: 50-60 = -10 → clamp 0
    mockJudge.mockReturnValue(ok(0));
    const shooter = makePiece({ position: 'FW', cost: 1 as Cost });
    shootSuccessCheck({
      shooter,
      distanceToGoal: 8,
      zoc: { attackCount: 0, defenseCount: 0 },
      courseMod: -60,
    });
    expect(mockJudge).toHaveBeenCalledWith(0);
  });
});

// ============================================================
// resolveShootChain — チェーン全体
// ============================================================
describe('resolveShootChain', () => {
  const shooter = makePiece({ position: 'FW', cost: 2 });
  const gk      = makePiece({ id: 'gk', position: 'GK', cost: 2, team: 'away' });
  const blocker = makePiece({ id: 'bl', position: 'DF', cost: 2, team: 'away' });

  const BASE = {
    shooter, gk, blocker: null, distanceToGoal: 3, distanceToGk: 3,
    defenderCountInGkZoc: 0, defenderCountInShooterZoc: 0,
    blockZoc: noZoc, savingZoc: noZoc, shootSuccessZoc: noZoc,
  };

  it('goal — GK失敗 + シュート成功', () => {
    mockJudge
      .mockReturnValueOnce(ng(35))  // ③ saving → 失敗
      .mockReturnValueOnce(ok(80)); // ④ shootSuccess → 成功
    const result = resolveShootChain(BASE);
    expect(result.outcome).toBe('goal');
    expect(result.savingCheck?.success).toBe(false);
    expect(result.shootSuccessCheck?.success).toBe(true);
  });

  it('missed — GK失敗 + シュート失敗', () => {
    mockJudge
      .mockReturnValueOnce(ng(35)) // ③ saving → 失敗
      .mockReturnValueOnce(ng(80)); // ④ shootSuccess → 失敗
    const result = resolveShootChain(BASE);
    expect(result.outcome).toBe('missed');
  });

  it('blocked — ブロック成功', () => {
    mockJudge.mockReturnValueOnce(ok(35)); // ② block → 成功
    const result = resolveShootChain({ ...BASE, blocker });
    expect(result.outcome).toBe('blocked');
    expect(result.blockCheck?.success).toBe(true);
    expect(result.blockCheck?.blocker.id).toBe('bl');
    // ③④ は呼ばれない
    expect(mockJudge).toHaveBeenCalledTimes(1);
  });

  it('ブロック失敗時は次チェーンへ進む', () => {
    mockJudge
      .mockReturnValueOnce(ng(35))  // ② block → 失敗
      .mockReturnValueOnce(ok(50))  // ③ saving → 成功
      .mockReturnValueOnce(ok(60)); // ③-b catch → 成功
    const result = resolveShootChain({ ...BASE, blocker });
    expect(result.outcome).toBe('saved_catch');
    expect(result.blockCheck?.success).toBe(false);
  });

  it('saved_catch — GK成功 + キャッチ成功', () => {
    mockJudge
      .mockReturnValueOnce(ok(50))  // ③ saving → 成功
      .mockReturnValueOnce(ok(60)); // ③-b catch → 成功
    const result = resolveShootChain(BASE);
    expect(result.outcome).toBe('saved_catch');
    expect(result.savingCheck?.success).toBe(true);
    expect(result.catchCheck?.success).toBe(true);
  });

  it('saved_ck — GK成功 + キャッチ失敗', () => {
    mockJudge
      .mockReturnValueOnce(ok(50))  // ③ saving → 成功
      .mockReturnValueOnce(ng(60)); // ③-b catch → 失敗（→ CKミニゲームへ）
    const result = resolveShootChain(BASE);
    expect(result.outcome).toBe('saved_ck');
  });

  it('GKなしの場合はセービング省略してシュート成功チェックへ', () => {
    mockJudge.mockReturnValueOnce(ok(80)); // ④ shootSuccess のみ
    const result = resolveShootChain({ ...BASE, gk: null });
    expect(result.outcome).toBe('goal');
    expect(result.savingCheck).toBeUndefined();
    expect(mockJudge).toHaveBeenCalledTimes(1);
  });

  it('defenderCountInShooterZocがコース修正として④に適用される', () => {
    // defenderCountInShooterZoc=2 → courseMod = 2 × -15 = -30
    // cost2 dist=3 ZOC無: base=80, 80+(-30) = 50
    mockJudge
      .mockReturnValueOnce(ng(35))  // ③ saving → 失敗
      .mockReturnValueOnce(ok(50)); // ④ shootSuccess → 50% で判定
    const result = resolveShootChain({ ...BASE, defenderCountInShooterZoc: 2 });
    expect(result.outcome).toBe('goal');
    // judge の2回目の引数が50であることを確認
    expect(mockJudge).toHaveBeenNthCalledWith(2, 50);
  });
});
