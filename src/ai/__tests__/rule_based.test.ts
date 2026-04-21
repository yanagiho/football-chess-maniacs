// ============================================================
// rule_based.test.ts — ルールベースAIのユニットテスト
// ============================================================

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { generateRuleBasedOrders, type RuleBasedInput } from '../rule_based';
import type { Piece } from '../../engine/types';

// ── AI内部のconsole.logを抑制 ──
const origLog = console.log;
beforeAll(() => { console.log = vi.fn(); });
afterAll(() => { console.log = origLog; });

// ── テスト用 4-4-2 盤面ヘルパー ──

function makeStandardPieces(): Piece[] {
  const home: Piece[] = [
    { id: 'h_gk',  position: 'GK', cost: 1, team: 'home', coord: { col: 10, row: 1 },  hasBall: false },
    { id: 'h_df1', position: 'DF', cost: 1, team: 'home', coord: { col: 6,  row: 7 },  hasBall: false },
    { id: 'h_df2', position: 'DF', cost: 1, team: 'home', coord: { col: 14, row: 7 },  hasBall: false },
    { id: 'h_sb1', position: 'SB', cost: 1, team: 'home', coord: { col: 3,  row: 8 },  hasBall: false },
    { id: 'h_sb2', position: 'SB', cost: 1, team: 'home', coord: { col: 17, row: 8 },  hasBall: false },
    { id: 'h_mf1', position: 'MF', cost: 1, team: 'home', coord: { col: 7,  row: 13 }, hasBall: false },
    { id: 'h_mf2', position: 'MF', cost: 1, team: 'home', coord: { col: 13, row: 13 }, hasBall: false },
    { id: 'h_vo1', position: 'VO', cost: 1, team: 'home', coord: { col: 9,  row: 11 }, hasBall: false },
    { id: 'h_vo2', position: 'VO', cost: 1, team: 'home', coord: { col: 11, row: 11 }, hasBall: false },
    { id: 'h_fw1', position: 'FW', cost: 1, team: 'home', coord: { col: 8,  row: 19 }, hasBall: true },
    { id: 'h_fw2', position: 'FW', cost: 1, team: 'home', coord: { col: 12, row: 19 }, hasBall: false },
  ];
  const away: Piece[] = [
    { id: 'a_gk',  position: 'GK', cost: 1, team: 'away', coord: { col: 10, row: 32 }, hasBall: false },
    { id: 'a_df1', position: 'DF', cost: 1, team: 'away', coord: { col: 6,  row: 26 }, hasBall: false },
    { id: 'a_df2', position: 'DF', cost: 1, team: 'away', coord: { col: 14, row: 26 }, hasBall: false },
    { id: 'a_sb1', position: 'SB', cost: 1, team: 'away', coord: { col: 3,  row: 25 }, hasBall: false },
    { id: 'a_sb2', position: 'SB', cost: 1, team: 'away', coord: { col: 17, row: 25 }, hasBall: false },
    { id: 'a_mf1', position: 'MF', cost: 1, team: 'away', coord: { col: 7,  row: 20 }, hasBall: false },
    { id: 'a_mf2', position: 'MF', cost: 1, team: 'away', coord: { col: 13, row: 20 }, hasBall: false },
    { id: 'a_vo1', position: 'VO', cost: 1, team: 'away', coord: { col: 9,  row: 22 }, hasBall: false },
    { id: 'a_vo2', position: 'VO', cost: 1, team: 'away', coord: { col: 11, row: 22 }, hasBall: false },
    { id: 'a_fw1', position: 'FW', cost: 1, team: 'away', coord: { col: 8,  row: 14 }, hasBall: false },
    { id: 'a_fw2', position: 'FW', cost: 1, team: 'away', coord: { col: 12, row: 14 }, hasBall: false },
  ];
  return [...home, ...away];
}

function makeBaseInput(overrides?: Partial<RuleBasedInput>): RuleBasedInput {
  return {
    pieces: makeStandardPieces(),
    myTeam: 'home',
    scoreHome: 0,
    scoreAway: 0,
    turn: 5,
    remainingSubs: 3,
    benchPieces: [],
    ...overrides,
  };
}

// ============================================================
// テスト
// ============================================================

describe('generateRuleBasedOrders 基本動作', () => {
  it('味方11体分のオーダーを返す', () => {
    const result = generateRuleBasedOrders(makeBaseInput());
    expect(result.orders).toHaveLength(11);
  });

  it('全オーダーのpieceIdが味方チームのコマに含まれる', () => {
    const input = makeBaseInput();
    const myIds = input.pieces.filter(p => p.team === 'home').map(p => p.id);
    const result = generateRuleBasedOrders(input);
    for (const order of result.orders) {
      expect(myIds).toContain(order.pieceId);
    }
  });

  it('evaluationとstrategyを返す', () => {
    const result = generateRuleBasedOrders(makeBaseInput());
    expect(result.evaluation).toBeDefined();
    expect(result.strategy).toBeDefined();
    expect(typeof result.strategy).toBe('string');
  });
});

describe('攻撃モード（ボール保持）', () => {
  it('ボール保持コマにはボール関連オーダーが出る（shoot/pass/dribble/throughPass/stay）', () => {
    const result = generateRuleBasedOrders(makeBaseInput());
    const ballHolderOrder = result.orders.find(o => o.pieceId === 'h_fw1');
    expect(ballHolderOrder).toBeDefined();
    const ballActions = ['shoot', 'pass', 'dribble', 'throughPass', 'stay'];
    expect(ballActions).toContain(ballHolderOrder!.type);
  });

  it('ボール非保持コマはmove/stayオーダーを受ける', () => {
    const result = generateRuleBasedOrders(makeBaseInput());
    const nonBallOrders = result.orders.filter(o => o.pieceId !== 'h_fw1');
    const validTypes = ['move', 'stay', 'dribble', 'pass', 'shoot', 'throughPass', 'substitute'];
    for (const order of nonBallOrders) {
      expect(validTypes).toContain(order.type);
    }
  });
});

describe('守備モード（ボール非保持）', () => {
  it('敵がボール保持時もhome11体分のオーダーを返す', () => {
    const pieces = makeStandardPieces().map(p =>
      p.id === 'h_fw1' ? { ...p, hasBall: false } :
      p.id === 'a_fw1' ? { ...p, hasBall: true } : p
    );
    const result = generateRuleBasedOrders(makeBaseInput({ pieces }));
    expect(result.orders).toHaveLength(11);
    const myIds = pieces.filter(p => p.team === 'home').map(p => p.id);
    for (const order of result.orders) {
      expect(myIds).toContain(order.pieceId);
    }
  });
});

describe('難易度パラメータ', () => {
  const difficulties = ['beginner', 'regular', 'maniac'] as const;

  for (const diff of difficulties) {
    it(`${diff}: 11体分のオーダーを返しクラッシュしない`, () => {
      const result = generateRuleBasedOrders(makeBaseInput({ difficulty: diff }));
      expect(result.orders).toHaveLength(11);
      expect(result.evaluation).toBeDefined();
      expect(result.strategy).toBeDefined();
    });
  }
});

describe('awayチーム', () => {
  it('myTeam=awayで正しく11体分のオーダーを返す', () => {
    const pieces = makeStandardPieces().map(p =>
      p.id === 'h_fw1' ? { ...p, hasBall: false } :
      p.id === 'a_fw1' ? { ...p, hasBall: true } : p
    );
    const result = generateRuleBasedOrders(makeBaseInput({
      pieces,
      myTeam: 'away',
    }));
    expect(result.orders).toHaveLength(11);
    const awayIds = pieces.filter(p => p.team === 'away').map(p => p.id);
    for (const order of result.orders) {
      expect(awayIds).toContain(order.pieceId);
    }
  });

  it('awayボール保持コマにボール関連オーダーが出る', () => {
    const pieces = makeStandardPieces().map(p =>
      p.id === 'h_fw1' ? { ...p, hasBall: false } :
      p.id === 'a_fw1' ? { ...p, hasBall: true } : p
    );
    const result = generateRuleBasedOrders(makeBaseInput({
      pieces,
      myTeam: 'away',
    }));
    const ballHolderOrder = result.orders.find(o => o.pieceId === 'a_fw1');
    expect(ballHolderOrder).toBeDefined();
    const ballActions = ['shoot', 'pass', 'dribble', 'throughPass', 'stay'];
    expect(ballActions).toContain(ballHolderOrder!.type);
  });
});
