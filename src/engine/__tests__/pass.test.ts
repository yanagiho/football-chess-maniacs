// ============================================================
// pass.test.ts — パスカット1・パスカット2 判定（§7-3）テスト
// ============================================================
//
// 検証項目:
//   - passCut1: 全ポジション修正（VO+10, DF+10, MF-10, VO-5, OM-15）× ZOC 0-3体
//   - passCut2: 全ポジション修正（VO+15, DF+15, MF-10, VO-5, OM-5, FW-10）
//              ＋ 1体目ZOC除外ルール
//   - resolvePass: delivered / cut1 / cut2 シナリオ
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as diceModule from '../dice';
import { calcProbability } from '../dice';
import { passCut1, passCut2, resolvePass } from '../pass';
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

function makePiece(overrides: Partial<Piece> & Pick<Piece, 'position' | 'cost'>): Piece {
  return {
    id: 'p1', team: 'home', coord: { col: 10, row: 20 }, hasBall: false,
    ...overrides,
  };
}

beforeEach(() => mockJudge.mockReset());

// ============================================================
// passCut1 — パスコース遮断（Ω=15）
// ============================================================
describe('passCut1', () => {
  // パスカット1 確率表（ポジション修正なし）
  // piece_allocation.md §7 より
  describe('確率表 (Ω=15, 修正なし)', () => {
    const CUT1_TABLE: [Cost, Cost, number][] = [
      [1, 1, 45], [1, 2, 30], [1, 3, 15],
      [2, 1, 60], [2, 2, 45], [2, 3, 30],
      [3, 1, 75], [3, 2, 60], [3, 3, 45],
    ];
    it.each(CUT1_TABLE)(
      '守備コスト%s / パサーコスト%s → %s%%',
      (defCost, passerCost, expected) => {
        expect(calcProbability(defCost, passerCost, 15)).toBe(expected);
      },
    );
  });

  describe('ポジション修正', () => {
    it.each([
      // [interceptorPos, iCost, passerPos, pCost, expectedProb]
      // VO(+10) vs MF(-10): (2-2+3)×15+10-10 = 45
      ['VO', 2, 'MF', 2, 45],
      // DF(+10) vs MF(-10): 45+10-10 = 45
      ['DF', 2, 'MF', 2, 45],
      // MF(修正なし) vs MF(-10): 45-10 = 35
      ['MF', 2, 'MF', 2, 35],
      // MF vs VO(-5): 45-5 = 40
      ['MF', 2, 'VO', 2, 40],
      // MF vs OM(-15): 45-15 = 30
      ['MF', 2, 'OM', 2, 30],
      // VO(+10) vs OM(-15): 45+10-15 = 40
      ['VO', 2, 'OM', 2, 40],
      // 仕様書注記: VO(cost2, +10) vs OM(cost3, -15): (2-3+3)×15+10-15 = 30+10-15 = 25
      ['VO', 2, 'OM', 3, 25],
    ] as const)(
      'interceptor=%s(%s) vs passer=%s(%s) → %s%%',
      (iPos, iCost, pPos, pCost, expectedProb) => {
        mockJudge.mockReturnValue(ok(expectedProb));
        const interceptor = makePiece({ position: iPos, cost: iCost as Cost, team: 'away' });
        const passer      = makePiece({ position: pPos, cost: pCost as Cost });
        passCut1({ interceptor, passer, zoc: noZoc });
        expect(mockJudge).toHaveBeenCalledWith(expectedProb);
      },
    );
  });

  describe('ZOC隣接修正: 攻撃側+5 / 守備側-10', () => {
    it.each([
      // [atk, def, expected]
      // 基礎=35 (MF2 vs MF2: (2-2+3)×15 - 10(MF passer) = 35)
      [0, 0, 35],
      [1, 0, 40],  // +5
      [2, 0, 45],  // +10
      [3, 0, 50],  // +15
      [0, 1, 25],  // -10
      [0, 2, 15],  // -20
      [0, 3, 5],   // -30
      [2, 1, 35],  // +10-10=0
    ])(
      'atk=%s def=%s → %s%%',
      (atk, def, expected) => {
        mockJudge.mockReturnValue(ok(expected));
        const interceptor = makePiece({ position: 'MF', cost: 2, team: 'away' });
        const passer      = makePiece({ position: 'MF', cost: 2 });
        passCut1({ interceptor, passer, zoc: { attackCount: atk, defenseCount: def } });
        expect(mockJudge).toHaveBeenCalledWith(expected);
      },
    );
  });

  it('成功時は interceptor を含む', () => {
    mockJudge.mockReturnValue(ok(45));
    const interceptor = makePiece({ id: 'inter1', position: 'VO', cost: 2, team: 'away' });
    const passer      = makePiece({ position: 'MF', cost: 2 });
    const result      = passCut1({ interceptor, passer, zoc: noZoc });
    expect(result.interceptor.id).toBe('inter1');
    expect(result.success).toBe(true);
  });
});

// ============================================================
// passCut2 — トラップ妨害（Ω=10）
// ============================================================
describe('passCut2', () => {
  describe('ポジション修正', () => {
    it.each([
      // [interceptorPos, iCost, receiverPos, rCost, expectedProb]
      // VO(+15) vs MF(-10): (2-2+3)×10+15-10 = 35
      ['VO', 2, 'MF', 2, 35],
      // DF(+15) vs MF(-10): 30+15-10 = 35
      ['DF', 2, 'MF', 2, 35],
      // MF(修正なし) vs MF(-10): 30-10 = 20
      ['MF', 2, 'MF', 2, 20],
      // MF vs VO(-5): 30-5 = 25
      ['MF', 2, 'VO', 2, 25],
      // MF vs OM(-5): 30-5 = 25
      ['MF', 2, 'OM', 2, 25],
      // MF vs FW(-10): 30-10 = 20
      ['MF', 2, 'FW', 2, 20],
      // VO(+15) vs FW(-10): 30+15-10 = 35
      ['VO', 2, 'FW', 2, 35],
      // DF(+15) vs OM(-5): 30+15-5 = 40
      ['DF', 2, 'OM', 2, 40],
    ] as const)(
      'interceptor=%s(%s) vs receiver=%s(%s) → %s%%',
      (iPos, iCost, rPos, rCost, expectedProb) => {
        mockJudge.mockReturnValue(ok(expectedProb));
        const interceptor = makePiece({ position: iPos, cost: iCost as Cost, team: 'away' });
        const receiver    = makePiece({ position: rPos, cost: rCost as Cost });
        passCut2({ interceptor, receiver, zoc: noZoc });
        expect(mockJudge).toHaveBeenCalledWith(expectedProb);
      },
    );
  });

  describe('ZOC隣接修正: 攻撃側+5 / 守備側-20', () => {
    // 基礎=30 (MF2 vs MF2, nomod)
    it.each([
      [0, 0, 20],  // 30-10(MF receiver)
      [1, 0, 25],  // 30-10+5
      [2, 0, 30],  // 30-10+10
      [3, 0, 35],  // 30-10+15
      [0, 1, 0],   // 30-10-20 → clamped 0
      [0, 2, 0],   // 30-10-40 → clamped 0
      [1, 1, 5],   // 30-10+5-20 = 5
    ])(
      '攻撃%s体 守備%s体（1体目除外済み）→ %s%%',
      (atk, def, expected) => {
        mockJudge.mockReturnValue(ok(Math.max(0, expected)));
        const interceptor = makePiece({ position: 'MF', cost: 2, team: 'away' });
        const receiver    = makePiece({ position: 'MF', cost: 2 });
        passCut2({ interceptor, receiver, zoc: { attackCount: atk, defenseCount: def } });
        expect(mockJudge).toHaveBeenCalledWith(Math.max(0, expected));
      },
    );
  });

  it('§7-3 注記: cut2トリガーの1体目はZOC隣接修正に含めない', () => {
    // 守備コマ3体がZOC内にいる場合、トリガー1体目を除いて defenseCount=2 を渡す
    // MF2 vs MF2, def=2 (1体目除外済み): 30-10 + 2×(-20) = 30-10-40 → 0
    mockJudge.mockReturnValue(ng(0));
    const interceptor = makePiece({ position: 'MF', cost: 2, team: 'away' });
    const receiver    = makePiece({ position: 'MF', cost: 2 });
    // defenseCount=2 は「2体目、3体目」を意味する（1体目のトリガーは含まない）
    passCut2({ interceptor, receiver, zoc: { attackCount: 0, defenseCount: 2 } });
    expect(mockJudge).toHaveBeenCalledWith(0);
  });
});

// ============================================================
// resolvePass — パス判定フロー全体
// ============================================================
describe('resolvePass', () => {
  const passer      = makePiece({ id: 'passer', position: 'MF', cost: 2 });
  const receiver    = makePiece({ id: 'recv',   position: 'FW', cost: 2, team: 'home' });
  const interceptor = makePiece({ id: 'inter',  position: 'VO', cost: 2, team: 'away' });

  const BASE = {
    passer,
    receiver,
    cut1Interceptor: null,
    cut1Zoc: noZoc,
    cut2Defenders: [],
    cut2Zoc: noZoc,
  };

  it('インターセプターなし → delivered', () => {
    const result = resolvePass(BASE);
    expect(result.outcome).toBe('delivered');
    expect(mockJudge).not.toHaveBeenCalled();
  });

  it('cut1 成功 → カット、cut2 は判定しない', () => {
    mockJudge.mockReturnValueOnce(ok(45)); // cut1 成功
    const result = resolvePass({ ...BASE, cut1Interceptor: interceptor });
    expect(result.outcome).toBe('cut1');
    expect(result.cut1?.interceptor.id).toBe('inter');
    expect(mockJudge).toHaveBeenCalledTimes(1);
  });

  it('cut1 失敗 → cut2 へ進む', () => {
    mockJudge
      .mockReturnValueOnce(ng(45))  // cut1 失敗
      .mockReturnValueOnce(ok(30)); // cut2 成功
    const result = resolvePass({
      ...BASE,
      cut1Interceptor: interceptor,
      cut2Defenders: [interceptor],
    });
    expect(result.outcome).toBe('cut2');
    expect(mockJudge).toHaveBeenCalledTimes(2);
  });

  it('cut1 失敗 + cut2 失敗 → delivered', () => {
    mockJudge
      .mockReturnValueOnce(ng(45))  // cut1 失敗
      .mockReturnValueOnce(ng(30)); // cut2 失敗
    const result = resolvePass({
      ...BASE,
      cut1Interceptor: interceptor,
      cut2Defenders: [interceptor],
    });
    expect(result.outcome).toBe('delivered');
  });

  it('cut2 のみ（cut1 なし）', () => {
    mockJudge.mockReturnValueOnce(ok(30)); // cut2 成功
    const result = resolvePass({
      ...BASE,
      cut2Defenders: [interceptor],
    });
    expect(result.outcome).toBe('cut2');
    expect(result.cut2?.interceptor.id).toBe('inter');
  });

  describe('スルーパス成立: cut1/cut2 とも失敗 → delivered', () => {
    it('cut1 失敗 + cut2 失敗 = ボールが届く', () => {
      mockJudge
        .mockReturnValueOnce(ng(25))  // cut1 MF vs OM(パサー)
        .mockReturnValueOnce(ng(20)); // cut2
      const omPasser = makePiece({ id: 'om', position: 'OM', cost: 3 });
      const result = resolvePass({
        passer: omPasser,
        receiver,
        cut1Interceptor: interceptor,
        cut1Zoc: noZoc,
        cut2Defenders: [interceptor],
        cut2Zoc: noZoc,
      });
      expect(result.outcome).toBe('delivered');
    });
  });
});
