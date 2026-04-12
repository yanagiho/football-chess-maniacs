// ============================================================
// tackle.test.ts — タックル判定（§7-4）＋ ファウル優先順位テスト
// ============================================================
//
// 検証項目:
//   - 全コスト差(-2〜+2)×Ω=18 の確率表（piece_allocation.md §7）
//   - 全ポジション修正（VO+15, DF+20, SB+10, MF-5, WG-10, OM-10, SB-5）
//   - ZOC隣接修正 0-3体（守備側+5 / 攻撃側-10）
//   - ファウル優先順位: タックル成功 + ファウル成立 → ファウルが優先される
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as diceModule from '../dice';
import { calcProbability } from '../dice';
import { resolveTackle } from '../tackle';
import { resolveFoul, isAttackingThird } from '../foul';
import { processMovement } from '../movement';
import type { BoardContext, Cost, Order, Piece, ZocAdjacency } from '../types';

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

function makeContext(overrides?: Partial<BoardContext>): BoardContext {
  return {
    getZone: () => 'ミドルサードA',
    getLane: () => 'センターレーン',
    isValidHex: ({ col, row }) => col >= 0 && col <= 21 && row >= 0 && row <= 33,
    ...overrides,
  };
}

beforeEach(() => mockJudge.mockReset());

// ============================================================
// タックル確率表（piece_allocation.md §7、Ω=18）
// ============================================================
describe('タックル確率表 (Ω=18, ポジション修正なし, 有効差ベース)', () => {
  // 守備コスト × 攻撃コスト × 期待確率
  // calcProbability = (effectiveDiff(def, atk) + 3) × 18
  const TABLE: [Cost, Cost, number][] = [
    [1, 1, 54],     [1, 1.5, 18],   [1, 2, 36],     [1, 2.5, 36],   [1, 3, 36],
    [1.5, 1, 90],   [1.5, 1.5, 54], [1.5, 2, 36],   [1.5, 2.5, 36], [1.5, 3, 36],
    [2, 1, 72],     [2, 1.5, 72],   [2, 2, 54],     [2, 2.5, 18],   [2, 3, 36],
    [2.5, 1, 72],   [2.5, 1.5, 72], [2.5, 2, 90],   [2.5, 2.5, 54], [2.5, 3, 36],
    [3, 1, 72],     [3, 1.5, 72],   [3, 2, 72],     [3, 2.5, 72],   [3, 3, 54],
  ];

  it.each(TABLE)(
    '守備cost%s vs 攻撃cost%s → %s%%',
    (defCost, atkCost, expected) => {
      expect(calcProbability(defCost, atkCost, 18)).toBe(expected);
    },
  );
});

// ============================================================
// ポジション修正
// ============================================================
describe('タックル: ポジション修正', () => {
  it.each([
    // [tacklerPos, tCost, dribblerPos, dCost, expectedProb]
    // 守備ポジション修正 (MF dribbler -5 applies)
    // VO(+15) vs MF(-5): (2-2+3)×18+15-5 = 64
    ['VO', 2, 'MF', 2, 64],
    // DF(+20) vs MF(-5): 54+20-5 = 69
    ['DF', 2, 'MF', 2, 69],
    // SB(+10) vs MF(-5): 54+10-5 = 59
    ['SB', 2, 'MF', 2, 59],
    // 攻撃ポジション修正
    // MF vs WG(-10): 54-10 = 44
    ['MF', 2, 'WG', 2, 44],
    // MF vs OM(-10): 54-10 = 44
    ['MF', 2, 'OM', 2, 44],
    // MF vs MF(-5): 54-5 = 49
    ['MF', 2, 'MF', 2, 49],
    // MF vs SB(-5): 54-5 = 49
    ['MF', 2, 'SB', 2, 49],
    // 複合: DF(+20) vs WG(-10): 54+20-10 = 64
    ['DF', 2, 'WG', 2, 64],
    // 複合: VO(+15) vs OM(-10): 54+15-10 = 59
    ['VO', 2, 'OM', 2, 59],
    // 複合: SB(+10) vs WG(-10): 54+10-10 = 54
    ['SB', 2, 'WG', 2, 54],
    // 仕様書注記: DF(cost1,+20) vs WG(cost3,-10): eDiff(1,3)=-1, (-1+3)×18+20-10 = 36+20-10 = 46
    ['DF', 1, 'WG', 3, 46],
  ] as const)(
    'tackler=%s(%s) vs dribbler=%s(%s) → %s%%',
    (tPos, tCost, dPos, dCost, expectedProb) => {
      mockJudge.mockReturnValue(ok(expectedProb));
      const tackler  = makePiece({ id: 't', position: tPos, cost: tCost as Cost, team: 'away', coord: { col: 10, row: 20 } });
      const dribbler = makePiece({ id: 'd', position: dPos, cost: dCost as Cost, team: 'home', coord: { col: 10, row: 20 } });
      resolveTackle({ tackler, dribbler, zoc: noZoc });
      expect(mockJudge).toHaveBeenCalledWith(expectedProb);
    },
  );
});

// ============================================================
// ZOC隣接修正: 守備側+5 / 攻撃側-10
// ============================================================
describe('タックル: ZOC隣接修正', () => {
  it.each([
    // 基礎=54 (DF2 vs MF2, DF+20: 74) — でも修正なしで54を使う
    // [atk, def, expectedProb] 基礎=54(MF2 vs MF2, noPosMod)
    [0, 0, 49],  // MF-5: 54-5=49
    [1, 0, 39],  // 49 + 1×(-10) = 39
    [2, 0, 29],
    [3, 0, 19],
    [0, 1, 54],  // 49 + 1×5 = 54
    [0, 2, 59],
    [0, 3, 64],
    [2, 2, 39],  // 49-20+10 = 39
  ])(
    '攻撃%s体 守備%s体 → %s%% (MF2 vs MF2)',
    (atk, def, expected) => {
      mockJudge.mockReturnValue(ok(expected));
      const tackler  = makePiece({ id: 't', position: 'MF', cost: 2, team: 'away', coord: { col: 10, row: 20 } });
      const dribbler = makePiece({ id: 'd', position: 'MF', cost: 2, team: 'home', coord: { col: 10, row: 20 } });
      resolveTackle({ tackler, dribbler, zoc: { attackCount: atk, defenseCount: def } });
      expect(mockJudge).toHaveBeenCalledWith(expected);
    },
  );
});

// ============================================================
// resolveTackle: 結果の構造
// ============================================================
describe('resolveTackle: 結果構造', () => {
  it('成功時 outcome=tackled、tackler/dribbler が含まれる', () => {
    mockJudge.mockReturnValue(ok(54));
    const tackler  = makePiece({ id: 'tk', position: 'DF', cost: 2, team: 'away', coord: { col: 10, row: 20 } });
    const dribbler = makePiece({ id: 'db', position: 'FW', cost: 2, team: 'home', coord: { col: 10, row: 20 } });
    const result   = resolveTackle({ tackler, dribbler, zoc: noZoc });
    expect(result.outcome).toBe('tackled');
    expect(result.success).toBe(true);
    expect(result.tackler.id).toBe('tk');
    expect(result.dribbler.id).toBe('db');
  });

  it('失敗時 outcome=survived', () => {
    mockJudge.mockReturnValue(ng(54));
    const tackler  = makePiece({ id: 'tk', position: 'DF', cost: 2, team: 'away', coord: { col: 10, row: 20 } });
    const dribbler = makePiece({ id: 'db', position: 'FW', cost: 2, team: 'home', coord: { col: 10, row: 20 } });
    const result   = resolveTackle({ tackler, dribbler, zoc: noZoc });
    expect(result.outcome).toBe('survived');
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ファウル判定（§7-5）
// ============================================================
describe('ファウル判定', () => {
  describe('isAttackingThird', () => {
    it.each([
      ['アタッキングサード', 'home', true],
      ['ファイナルサード', 'home', true],
      ['ミドルサードA', 'home', false],
      ['ミドルサードD', 'home', false],
      ['ディフェンシブサード', 'home', false],
      ['ディフェンシブGサード', 'home', false],
      ['ディフェンシブサード', 'away', true],
      ['ディフェンシブGサード', 'away', true],
      ['ミドルサードA', 'away', false],
      ['アタッキングサード', 'away', false],
      ['ファイナルサード', 'away', false],
    ] as const)('%s (team=%s) → %s', (zone, team, expected) => {
      expect(isAttackingThird(zone, team)).toBe(expected);
    });
  });

  it('アタッキングサード以外ではファウルなし（判定なし）', () => {
    const result = resolveFoul({ zone: 'ミドルサードA', col: 10, attackingTeam: 'home' });
    expect(result.occurred).toBe(false);
    expect(mockJudge).not.toHaveBeenCalled();
  });

  it('アタッキングサードでファウル発生（25%）', () => {
    mockJudge.mockReturnValue(ok(25));
    const result = resolveFoul({ zone: 'アタッキングサード', col: 10, attackingTeam: 'home' });
    expect(result.occurred).toBe(true);
    expect(result.isPA).toBe(false);
    expect(result.outcome).toBe('fk');
    expect(mockJudge).toHaveBeenCalledWith(25);
  });

  it('PA内ファウル → PK', () => {
    // PA: ファイナルサード && col 4-17
    mockJudge.mockReturnValue(ok(25));
    const result = resolveFoul({ zone: 'ファイナルサード', col: 10, attackingTeam: 'home' });
    expect(result.occurred).toBe(true);
    expect(result.isPA).toBe(true);
    expect(result.outcome).toBe('pk');
  });

  it('PA外ファイナルサード（colが範囲外） → FK', () => {
    mockJudge.mockReturnValue(ok(25));
    const result = resolveFoul({ zone: 'ファイナルサード', col: 2, attackingTeam: 'home' });
    expect(result.occurred).toBe(true);
    expect(result.isPA).toBe(false);
    expect(result.outcome).toBe('fk');
  });

  it('forceFoul=true（PA内の守備コマ多数） → 必ずPK', () => {
    // judge は呼ばれない
    const result = resolveFoul({ zone: 'ファイナルサード', col: 10, attackingTeam: 'home', forceFoul: true });
    expect(result.occurred).toBe(true);
    expect(result.outcome).toBe('pk');
    expect(mockJudge).not.toHaveBeenCalled();
  });

  it('25%判定が失敗した場合はファウルなし', () => {
    mockJudge.mockReturnValue(ng(25));
    const result = resolveFoul({ zone: 'アタッキングサード', col: 10, attackingTeam: 'home' });
    expect(result.occurred).toBe(false);
    expect(result.outcome).toBe('none');
  });

  // away チームの攻撃方向テスト
  it('away攻撃: ディフェンシブサードでファウル発生 → FK', () => {
    mockJudge.mockReturnValue(ok(25));
    const result = resolveFoul({ zone: 'ディフェンシブサード', col: 10, attackingTeam: 'away' });
    expect(result.occurred).toBe(true);
    expect(result.isPA).toBe(false);
    expect(result.outcome).toBe('fk');
  });

  it('away攻撃: ディフェンシブGサード + PA内 → PK', () => {
    mockJudge.mockReturnValue(ok(25));
    const result = resolveFoul({ zone: 'ディフェンシブGサード', col: 10, attackingTeam: 'away' });
    expect(result.occurred).toBe(true);
    expect(result.isPA).toBe(true);
    expect(result.outcome).toBe('pk');
  });

  it('away攻撃: ファイナルサードではファウルなし', () => {
    const result = resolveFoul({ zone: 'ファイナルサード', col: 10, attackingTeam: 'away' });
    expect(result.occurred).toBe(false);
    expect(mockJudge).not.toHaveBeenCalled();
  });
});

// ============================================================
// ファウル優先順位の統合テスト（processMovement 経由）
// §9-2 注記: タックル成功 + ファウル成立 → ファウル優先
// ============================================================
describe('ファウル優先順位（統合）', () => {
  it('タックル成功 + ファウル成立 → ボール保持はドリブラーに戻る', () => {
    //   dribbler(home, ball) at (10, 22)  →  move to (10, 24) [アタッキングサード]
    //   tackler(away)        at (10, 24)  [ZOC covers (10,23)/(10,24)...]
    //
    // Phase 1 処理:
    //   1. dribbler moves toward (10,24) → ZOC of tackler at (10,24) stops it at (10,24)
    //   2. resolveTackle → success (mock1)
    //   3. BALL_ACQUIRED: tackler
    //   4. resolveFoul → occurred (mock2)
    //   5. FOUL → ボール返却: dribbler.hasBall=true

    mockJudge
      .mockReturnValueOnce(ok(54))  // tackle成功
      .mockReturnValueOnce(ok(25)); // foul発生

    const dribbler: Piece = {
      id: 'db', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 22 }, hasBall: true,
    };
    const tackler: Piece = {
      id: 'tk', team: 'away', position: 'DF', cost: 2,
      coord: { col: 10, row: 24 }, hasBall: false,
    };

    const orders: Order[] = [
      { pieceId: 'db', type: 'dribble', target: { col: 10, row: 26 } },
    ];

    // アタッキングサード内での判定をシミュレート
    const context = makeContext({
      getZone: () => 'アタッキングサード',
    });

    const { pieces, events } = processMovement([dribbler, tackler], orders, context);

    // TACKLE イベントが発生していること
    const tackleEvt = events.find(e => e.type === 'TACKLE');
    expect(tackleEvt).toBeDefined();
    expect((tackleEvt as { result: { success: boolean } }).result.success).toBe(true);

    // BALL_ACQUIRED (tackler) が発生すること
    const ballEvt = events.find(e => e.type === 'BALL_ACQUIRED');
    expect(ballEvt).toBeDefined();
    expect((ballEvt as { pieceId: string }).pieceId).toBe('tk');

    // FOUL イベントが発生すること
    const foulEvt = events.find(e => e.type === 'FOUL');
    expect(foulEvt).toBeDefined();
    expect((foulEvt as { result: { occurred: boolean } }).result.occurred).toBe(true);

    // ファウル優先: ドリブラーがボールを持ち直す
    const dbFinal = pieces.find(p => p.id === 'db')!;
    const tkFinal = pieces.find(p => p.id === 'tk')!;
    expect(dbFinal.hasBall).toBe(true);
    expect(tkFinal.hasBall).toBe(false);
  });

  it('タックル成功 + ファウルなし → タックラーがボール保持', () => {
    mockJudge
      .mockReturnValueOnce(ok(54))  // tackle成功
      .mockReturnValueOnce(ng(25)); // foul不発生

    const dribbler: Piece = {
      id: 'db', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 22 }, hasBall: true,
    };
    const tackler: Piece = {
      id: 'tk', team: 'away', position: 'DF', cost: 2,
      coord: { col: 10, row: 24 }, hasBall: false,
    };

    const context = makeContext({ getZone: () => 'アタッキングサード' });
    const { pieces } = processMovement(
      [dribbler, tackler],
      [{ pieceId: 'db', type: 'dribble', target: { col: 10, row: 26 } }],
      context,
    );

    const dbFinal = pieces.find(p => p.id === 'db')!;
    const tkFinal = pieces.find(p => p.id === 'tk')!;
    expect(tkFinal.hasBall).toBe(true);
    expect(dbFinal.hasBall).toBe(false);
  });

  it('タックル失敗 → ドリブラーがボール保持継続', () => {
    mockJudge.mockReturnValueOnce(ng(54)); // tackle失敗

    const dribbler: Piece = {
      id: 'db', team: 'home', position: 'WG', cost: 2,
      coord: { col: 10, row: 22 }, hasBall: true,
    };
    const tackler: Piece = {
      id: 'tk', team: 'away', position: 'SB', cost: 1,
      coord: { col: 10, row: 24 }, hasBall: false,
    };

    const context = makeContext();
    const { pieces, events } = processMovement(
      [dribbler, tackler],
      [{ pieceId: 'db', type: 'dribble', target: { col: 10, row: 26 } }],
      context,
    );

    expect(pieces.find(p => p.id === 'db')!.hasBall).toBe(true);
    expect(pieces.find(p => p.id === 'tk')!.hasBall).toBe(false);
    // FOUL は発生しない（タックル失敗なので）
    expect(events.find(e => e.type === 'FOUL')).toBeUndefined();
  });
});
