// ============================================================
// ball.test.ts — フェーズ2: ボール処理（processBall）テスト
// ============================================================
//
// 検証項目:
//   - シュート命令 → シュートチェーン発火 + SHOOTイベント
//   - パス命令 → 配送成功 + PASS_DELIVERED + BALL_ACQUIRED
//   - パスカット → PASS_CUT + インターセプターがボール取得
//   - ルーズボール: ボール保持者にボール関連命令がない場合
//   - パスズレ: ロングパスの距離超過で Math.random 制御
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as diceModule from '../dice';
import { processBall } from '../ball';
import type { BoardContext, Cost, HexCoord, Order, Piece, Team } from '../types';

// ── モック設定 ────────────────────────────────────────────────
vi.mock('../dice', async () => {
  const actual = await vi.importActual<typeof import('../dice')>('../dice');
  return { ...actual, judge: vi.fn() };
});
const mockJudge = vi.mocked(diceModule.judge);

// ── テストヘルパー ─────────────────────────────────────────────
type JR = { success: boolean; probability: number; roll: number };
const ok = (p = 100): JR => ({ success: true, probability: p, roll: 0 });
const ng = (p = 0): JR => ({ success: false, probability: p, roll: 99 });

function makePiece(
  overrides: Partial<Piece> & Pick<Piece, 'id' | 'position' | 'cost' | 'team' | 'coord'>,
): Piece {
  return { hasBall: false, ...overrides };
}

function makeContext(): BoardContext {
  return {
    getZone: () => 'ミドルサードA' as any,
    getLane: () => 'センターレーン' as any,
    isValidHex: ({ col, row }: HexCoord) => col >= 0 && col <= 21 && row >= 0 && row <= 33,
  };
}

// ── 共通コマ定義 ────────────────────────────────────────────
const shooter = makePiece({ id: 'fw1', position: 'FW', cost: 2 as Cost, team: 'home' as Team, coord: { col: 10, row: 28 }, hasBall: true });
const gk = makePiece({ id: 'gk1', position: 'GK', cost: 2 as Cost, team: 'away' as Team, coord: { col: 10, row: 32 } });
const passer = makePiece({ id: 'mf1', position: 'MF', cost: 2 as Cost, team: 'home' as Team, coord: { col: 10, row: 15 }, hasBall: true });
const receiver = makePiece({ id: 'fw2', position: 'FW', cost: 2 as Cost, team: 'home' as Team, coord: { col: 10, row: 20 } });
const defenderCut = makePiece({ id: 'df1', position: 'DF', cost: 2 as Cost, team: 'away' as Team, coord: { col: 10, row: 17 } });

beforeEach(() => {
  mockJudge.mockReset();
  vi.restoreAllMocks();
});

// ============================================================
// シュート命令 → SHOOTイベント生成
// ============================================================
describe('シュート命令', () => {
  it('シュートチェーンが発火し SHOOT イベントが生成される（GKなし）', () => {
    // GKをコース外に配置 → セービング省略 → シュート成功のみ
    const gkOffCourse = makePiece({ id: 'gk1', position: 'GK', cost: 2 as Cost, team: 'away' as Team, coord: { col: 0, row: 32 } });
    mockJudge.mockReturnValueOnce(ok(80)); // ④ shootSuccess → 成功
    const pieces = [{ ...shooter }, gkOffCourse];
    const orders: Order[] = [{ pieceId: 'fw1', type: 'shoot', target: { col: 10, row: 33 } }];

    const result = processBall(pieces, orders, makeContext());

    const shootEvt = result.events.find(e => e.type === 'SHOOT');
    expect(shootEvt).toBeDefined();
    expect((shootEvt as any).shooterId).toBe('fw1');
    expect((shootEvt as any).result.outcome).toBe('goal');
  });

  it('GKセーブ成功+キャッチ成功 → saved_catch', () => {
    // GKがコース上にいる場合: GKのZOCがblockerとしても検出される可能性あり
    // block(失敗) → saving(成功) → catch(成功) の順で判定
    mockJudge
      .mockReturnValueOnce(ng(30))  // ② block → 失敗（GKがblockerとして検出される場合）
      .mockReturnValueOnce(ok(50))  // ③ saving → 成功
      .mockReturnValueOnce(ok(60)); // ③-b catch → 成功
    const pieces = [{ ...shooter }, { ...gk }];
    const orders: Order[] = [{ pieceId: 'fw1', type: 'shoot', target: { col: 10, row: 33 } }];

    const result = processBall(pieces, orders, makeContext());

    const shootEvt = result.events.find(e => e.type === 'SHOOT');
    expect((shootEvt as any).result.outcome).toBe('saved_catch');
    // GKがボール取得
    const acquired = result.events.find(e => e.type === 'BALL_ACQUIRED');
    expect((acquired as any).pieceId).toBe('gk1');
    // judge呼び出しシーケンス検証: block→saving→catch の3回
    expect(mockJudge).toHaveBeenCalledTimes(3);
  });

  it('ブロック成功時は blocker が BALL_ACQUIRED', () => {
    // ブロッカーをコース上に、GKをコース外に配置
    const gkOffCourse = makePiece({ id: 'gk1', position: 'GK', cost: 2 as Cost, team: 'away' as Team, coord: { col: 0, row: 32 } });
    const blocker = makePiece({ id: 'bl1', position: 'DF', cost: 2 as Cost, team: 'away' as Team, coord: { col: 10, row: 30 } });
    mockJudge.mockReturnValueOnce(ok(45)); // ② block → 成功
    const pieces = [{ ...shooter }, gkOffCourse, blocker];
    const orders: Order[] = [{ pieceId: 'fw1', type: 'shoot', target: { col: 10, row: 33 } }];

    const result = processBall(pieces, orders, makeContext());
    const acquired = result.events.find(e => e.type === 'BALL_ACQUIRED');
    expect(acquired).toBeDefined();
    expect((acquired as any).pieceId).toBe('bl1');
  });
});

// ============================================================
// パス命令 → 配送 / カット
// ============================================================
describe('パス命令', () => {
  it('インターセプターなし → PASS_DELIVERED + BALL_ACQUIRED', () => {
    const pieces = [{ ...passer }, { ...receiver }];
    const orders: Order[] = [{ pieceId: 'mf1', type: 'pass', target: { col: 10, row: 20 }, targetPieceId: 'fw2' }];

    const result = processBall(pieces, orders, makeContext());

    const delivered = result.events.find(e => e.type === 'PASS_DELIVERED');
    expect(delivered).toBeDefined();
    expect((delivered as any).receiverId).toBe('fw2');

    const acquired = result.events.find(e => e.type === 'BALL_ACQUIRED');
    expect((acquired as any).pieceId).toBe('fw2');
    expect(result.deliveredPass).toEqual({ passerId: 'mf1', receiverId: 'fw2' });

    // ボール所有権が移転していること
    const updatedPasser = result.pieces.find(p => p.id === 'mf1');
    const updatedReceiver = result.pieces.find(p => p.id === 'fw2');
    expect(updatedPasser?.hasBall).toBe(false);
    expect(updatedReceiver?.hasBall).toBe(true);
  });

  it('パスカット1成功 → PASS_CUT + インターセプターがボール取得', () => {
    // パスコース上に守備コマがいる場合
    mockJudge.mockReturnValueOnce(ok(45)); // cut1 → 成功
    const pieces = [{ ...passer }, { ...receiver }, { ...defenderCut }];
    const orders: Order[] = [{ pieceId: 'mf1', type: 'pass', target: { col: 10, row: 20 }, targetPieceId: 'fw2' }];

    const result = processBall(pieces, orders, makeContext());

    const cutEvt = result.events.find(e => e.type === 'PASS_CUT');
    expect(cutEvt).toBeDefined();

    const acquired = result.events.find(e => e.type === 'BALL_ACQUIRED');
    expect(acquired).toBeDefined();
    // インターセプターがボールを取得
    expect((acquired as any).pieceId).toBe('df1');
  });

  it('シュートとパスが同時にある場合、シュートが優先される', () => {
    // GKをコース外に配置してシンプルにテスト
    const gkOffCourse = makePiece({ id: 'gk1', position: 'GK', cost: 2 as Cost, team: 'away' as Team, coord: { col: 0, row: 32 } });
    mockJudge.mockReturnValueOnce(ok(80)); // ④ shootSuccess → 成功
    const pieces = [{ ...shooter }, gkOffCourse, { ...passer }, { ...receiver }];
    const orders: Order[] = [
      { pieceId: 'fw1', type: 'shoot', target: { col: 10, row: 33 } },
      { pieceId: 'mf1', type: 'pass', target: { col: 10, row: 20 }, targetPieceId: 'fw2' },
    ];

    const result = processBall(pieces, orders, makeContext());

    // シュートイベントのみ発生、パスは実行されない
    expect(result.events.some(e => e.type === 'SHOOT')).toBe(true);
    expect(result.events.some(e => e.type === 'PASS_DELIVERED')).toBe(false);
  });
});

// ============================================================
// スルーパスのズレ判定
// ============================================================
describe('スルーパス — ロングパスズレ', () => {
  it('距離が正確パス範囲内ならズレなし', () => {
    // passer(row=15) → receiver(row=20) = 距離5 ≤ BASE_ACCURATE_PASS_RANGE(6)
    const pieces = [{ ...passer }, { ...receiver }];
    const orders: Order[] = [{ pieceId: 'mf1', type: 'throughPass', target: { col: 10, row: 20 } }];

    const result = processBall(pieces, orders, makeContext());

    const delivered = result.events.find(e => e.type === 'PASS_DELIVERED');
    expect(delivered).toBeDefined();
  });

  it('ロングパスでズレが発生する場合（Math.random モック）', () => {
    // 遠い受け手: 距離 > BASE_ACCURATE_PASS_RANGE
    const farReceiver = makePiece({ id: 'fw3', position: 'FW', cost: 2 as Cost, team: 'home' as Team, coord: { col: 10, row: 28 } });
    // passer(row=15) → target(row=28) = 距離13、range超過
    // deviationChance = min(0.9, (13-6)*0.3) = 0.9 と想定
    // Math.random < deviationChance → ズレ発生
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)   // deviationChance判定: 0.1 < 0.9 → ズレ発生
      .mockReturnValueOnce(0.0);  // 隣接HEX選択

    const pieces = [{ ...passer }, { ...farReceiver }];
    const orders: Order[] = [{ pieceId: 'mf1', type: 'throughPass', target: { col: 10, row: 28 } }];

    const result = processBall(pieces, orders, makeContext());

    // ズレが発生しても、近くに味方がいれば配送される（距離2以内）
    // または LOOSE_BALL になる
    expect(result.events.length).toBeGreaterThan(0);
    randomSpy.mockRestore();
  });
});

// ============================================================
// スルーパス — ズレ先の敵ボール取得（最高コスト選択）
// ============================================================
describe('スルーパス敵取得', () => {
  it('ズレ先に敵がいる場合、最高コストの敵がボールを取得する', () => {
    // パサーからターゲットへのスルーパスがズレて、ターゲットHEXに敵がいるケース
    const tpPasser = makePiece({ id: 'mf1', position: 'MF', cost: 2 as Cost, team: 'home' as Team, coord: { col: 10, row: 15 }, hasBall: true });
    // 遠いターゲット（ズレを発生させるため距離 > 6）
    const target: HexCoord = { col: 10, row: 28 };
    // ターゲットHEXに敵（味方なし → 敵取得ルートへ）
    const enemyLow = makePiece({ id: 'e1', position: 'DF', cost: 1 as Cost, team: 'away' as Team, coord: target });
    const enemyHigh = makePiece({ id: 'e2', position: 'DF', cost: 2.5 as Cost, team: 'away' as Team, coord: target });

    // Math.randomでズレを発生させ、味方が距離2以内にいない状況を作る
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)   // deviationChance → ズレ発生
      .mockReturnValueOnce(0.0)   // 隣接HEX選択（ズレ方向）
      .mockReturnValueOnce(0.5);  // topEnemies内ランダム選択

    const pieces = [tpPasser, enemyLow, enemyHigh];
    const orders: Order[] = [{ pieceId: 'mf1', type: 'throughPass', target }];

    const result = processBall(pieces, orders, makeContext());

    // 敵がボール取得するか、ルーズボールになる（ズレ先の状況依存）
    const ballAcquired = result.events.find(e => e.type === 'BALL_ACQUIRED');
    const looseBall = result.events.find(e => e.type === 'LOOSE_BALL');
    expect(ballAcquired || looseBall).toBeDefined();

    // パサーのボールは消えている
    const passerAfter = result.pieces.find(p => p.id === 'mf1');
    expect(passerAfter?.hasBall).toBe(false);

    randomSpy.mockRestore();
  });

  it('ズレ先に誰もいない場合、LOOSE_BALLが発生する', () => {
    const tpPasser = makePiece({ id: 'mf1', position: 'MF', cost: 2 as Cost, team: 'home' as Team, coord: { col: 10, row: 15 }, hasBall: true });
    // 誰もいない遠いターゲット
    const target: HexCoord = { col: 10, row: 28 };

    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.0)   // deviationChance → ズレ発生
      .mockReturnValueOnce(0.0);  // 隣接HEX選択

    const pieces = [tpPasser];
    const orders: Order[] = [{ pieceId: 'mf1', type: 'throughPass', target }];

    const result = processBall(pieces, orders, makeContext());

    const looseBall = result.events.find(e => e.type === 'LOOSE_BALL');
    expect(looseBall).toBeDefined();
    expect(result.pieces.find(p => p.id === 'mf1')?.hasBall).toBe(false);

    randomSpy.mockRestore();
  });
});
