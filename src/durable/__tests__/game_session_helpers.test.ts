// ============================================================
// game_session_helpers.test.ts
//   編成 → 盤面構築（createBoardFromFormation / isValidField）の検証。
//   「DB編成が試合に反映されない」ブロッカー修正の回帰テスト。
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  createBoardFromFormation,
  createInitialBoard,
  isValidField,
  type FormationFieldPiece,
} from '../game_session_helpers';

// 11枚の有効な編成（GK+FW を含む。コスト・座標は home 視点）
function makeField(): FormationFieldPiece[] {
  return [
    { position: 'GK', cost: 1, col: 10, row: 1 },
    { position: 'DF', cost: 2, col: 6, row: 5 },
    { position: 'DF', cost: 2, col: 9, row: 5 },
    { position: 'DF', cost: 2, col: 12, row: 5 },
    { position: 'SB', cost: 1.5, col: 15, row: 6 },
    { position: 'MF', cost: 3, col: 8, row: 10 },
    { position: 'MF', cost: 2.5, col: 12, row: 10 },
    { position: 'OM', cost: 2, col: 10, row: 14 },
    { position: 'WG', cost: 1.5, col: 4, row: 16 },
    { position: 'FW', cost: 3, col: 9, row: 19 },
    { position: 'FW', cost: 2.5, col: 12, row: 19 },
  ];
}

describe('isValidField', () => {
  it('11枚・座標が盤内なら有効', () => {
    expect(isValidField(makeField())).toBe(true);
  });

  it('11枚でなければ無効', () => {
    expect(isValidField(makeField().slice(0, 10))).toBe(false);
    expect(isValidField([])).toBe(false);
    expect(isValidField(null)).toBe(false);
  });

  it('座標が欠落していれば無効', () => {
    const f = makeField() as unknown as Array<Record<string, unknown>>;
    delete f[0].col;
    expect(isValidField(f)).toBe(false);
  });

  it('座標が盤外なら無効', () => {
    const f = makeField();
    f[0] = { ...f[0], row: 99 };
    expect(isValidField(f)).toBe(false);
  });
});

describe('createBoardFromFormation', () => {
  it('編成のコスト/ポジション/座標が盤面に反映される（固定4-4-2ではない）', () => {
    const home = makeField();
    const board = createBoardFromFormation(home, home, 'home');

    expect(board.pieces).toHaveLength(22);

    // home コマは座標そのまま
    const h01 = board.pieces.find(p => p.id === 'h01')!;
    expect(h01.team).toBe('home');
    expect(h01.position).toBe('GK');
    expect(h01.coord).toEqual({ col: 10, row: 1 });

    // 高コスト編成が反映されている（固定4-4-2では cost 3 の MF は存在しない）
    const h06 = board.pieces.find(p => p.id === 'h06')!;
    expect(h06.position).toBe('MF');
    expect(h06.cost).toBe(3);
  });

  it('away はミラー配置（row → 33-row）、ID接頭辞は a', () => {
    const board = createBoardFromFormation(makeField(), makeField(), 'home');
    const a01 = board.pieces.find(p => p.id === 'a01')!;
    expect(a01.team).toBe('away');
    expect(a01.coord).toEqual({ col: 10, row: 32 }); // 33 - 1
  });

  it('キックオフ側のFWにのみボールが付与される', () => {
    const board = createBoardFromFormation(makeField(), makeField(), 'away');
    const withBall = board.pieces.filter(p => p.hasBall);
    expect(withBall).toHaveLength(1);
    expect(withBall[0].team).toBe('away');
    expect(withBall[0].position).toBe('FW');
  });

  it('編成が不正/未指定なら固定4-4-2にフォールバック（22枚・例外なし）', () => {
    const board = createBoardFromFormation(null, [{ bogus: true }], 'home');
    expect(board.pieces).toHaveLength(22);
    expect(board.pieces.filter(p => p.hasBall)).toHaveLength(1);
  });

  it('片側だけ編成あり → 有効側は反映、無効側はフォールバック', () => {
    const board = createBoardFromFormation(makeField(), null, 'home');
    // home は cost3 MF を持つ、away はデフォルト
    expect(board.pieces.find(p => p.id === 'h06')!.cost).toBe(3);
    expect(board.pieces.filter(p => p.team === 'away')).toHaveLength(11);
  });
});

describe('createInitialBoard（フォールバック経路）', () => {
  it('固定4-4-2を生成しキックオフFWにボール付与', () => {
    const board = createInitialBoard('home');
    expect(board.pieces).toHaveLength(22);
    const withBall = board.pieces.filter(p => p.hasBall);
    expect(withBall).toHaveLength(1);
    expect(withBall[0].team).toBe('home');
  });
});
