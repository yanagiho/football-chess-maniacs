// ============================================================
// turn_processor.test.ts — ターン処理 統合テスト（§9-2）
// ============================================================
//
// 検証項目:
//   - フェーズ0: スナップショット記録
//   - フェーズ1: ZOC停止 / 競合 / タックル / ファウル
//   - フェーズ2: シュート / パス配送
//   - スルーパス成立: FW が移動後の位置でパスを受け取る
//   - スルーパス + オフサイド:
//       (a) 移動前がオンサイド → オフサイドなし
//       (b) 移動前がオフサイド → オフサイド確定
//   - ファウル優先: フェーズ1でタックル成功+ファウル → ファウルイベント優先
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as diceModule from '../dice';
import { processTurn, eventsOfType } from '../turn_processor';
import type {
  BallAcquiredEvent,
  Board,
  BoardContext,
  FoulEvent,
  OffsideEvent,
  Order,
  PassDeliveredEvent,
  Piece,
  PieceMovedEvent,
  TackleEvent,
} from '../types';

vi.mock('../dice', async () => {
  const actual = await vi.importActual<typeof import('../dice')>('../dice');
  return { ...actual, judge: vi.fn() };
});
const mockJudge = vi.mocked(diceModule.judge);

// ── ヘルパー ────────────────────────────────────────────────

type JR = { success: boolean; probability: number; roll: number };
const ok = (p = 100): JR => ({ success: true,  probability: p, roll: 0 });
const ng = (p = 0):   JR => ({ success: false, probability: p, roll: 99 });

function makePiece(overrides: Partial<Piece> & Pick<Piece, 'id' | 'team' | 'position' | 'cost' | 'coord'>): Piece {
  return { hasBall: false, ...overrides };
}

function makeBoard(pieces: Piece[]): Board {
  return { pieces, snapshot: pieces.map(p => ({ ...p, coord: { ...p.coord } })) };
}

/** デフォルトの BoardContext: ミドルサードA / センターレーン */
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
// フェーズ0: スナップショット記録
// ============================================================
describe('フェーズ0: スナップショット', () => {
  it('ターン前のコマ位置がスナップショットに記録される', () => {
    const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2, coord: { col: 10, row: 20 } });
    const board = makeBoard([fw]);
    const orders: Order[] = [{ pieceId: 'fw', type: 'move', target: { col: 10, row: 24 } }];

    const result = processTurn(board, orders, [], makeContext());

    // スナップショットは移動前の位置
    expect(result.board.snapshot.find(p => p.id === 'fw')!.coord).toEqual({ col: 10, row: 20 });
    // 実際の位置は移動後
    expect(result.board.pieces.find(p => p.id === 'fw')!.coord).toEqual({ col: 10, row: 24 });
  });
});

// ============================================================
// フェーズ1: コマ移動
// ============================================================
describe('フェーズ1: コマ移動', () => {
  it('移動指示のあるコマが移動する（PIECE_MOVED イベント）', () => {
    const mf = makePiece({ id: 'mf', team: 'home', position: 'MF', cost: 2, coord: { col: 10, row: 16 } });
    const board = makeBoard([mf]);
    const orders: Order[] = [{ pieceId: 'mf', type: 'move', target: { col: 10, row: 20 } }];

    const { events } = processTurn(board, orders, [], makeContext());
    const moveEvt = eventsOfType<PieceMovedEvent>(events, 'PIECE_MOVED');
    expect(moveEvt.length).toBeGreaterThanOrEqual(1);
    const mfEvt = moveEvt.find(e => e.pieceId === 'mf');
    expect(mfEvt?.from).toEqual({ col: 10, row: 16 });
    expect(mfEvt?.to).toEqual({ col: 10, row: 20 });
  });

  it('指示なしのコマは静止', () => {
    const mf = makePiece({ id: 'mf', team: 'home', position: 'MF', cost: 2, coord: { col: 10, row: 16 } });
    const board = makeBoard([mf]);

    const { board: newBoard, events } = processTurn(board, [], [], makeContext());
    expect(newBoard.pieces.find(p => p.id === 'mf')!.coord).toEqual({ col: 10, row: 16 });
    expect(eventsOfType<PieceMovedEvent>(events, 'PIECE_MOVED').length).toBe(0);
  });

  it('敵ZOCで停止する（ZOC_STOP）', () => {
    // home MF が移動 → away DF のZOC内で停止
    const mf = makePiece({ id: 'mf', team: 'home', position: 'MF', cost: 2, coord: { col: 10, row: 18 } });
    const df = makePiece({ id: 'df', team: 'away', position: 'DF', cost: 2, coord: { col: 10, row: 22 } });
    // away DF の ZOC（偶数列隣接): (10,21),(10,23),(9,21),(9,22),(11,21),(11,22)
    // home MF の経路 (10,18)→(10,19)→(10,20)→(10,21)→... → (10,21) で ZOC停止
    const board = makeBoard([mf, df]);
    const orders: Order[] = [{ pieceId: 'mf', type: 'move', target: { col: 10, row: 26 } }];

    const { board: newBoard, events } = processTurn(board, orders, [], makeContext());

    const zocEvt = events.find(e => e.type === 'ZOC_STOP' && (e as { pieceId: string }).pieceId === 'mf');
    expect(zocEvt).toBeDefined();

    // MF は ZOC停止位置に留まっている（target の (10,26) には届いていない）
    const finalMf = newBoard.pieces.find(p => p.id === 'mf')!;
    expect(finalMf.coord.row).toBeLessThan(26);
    expect(finalMf.coord.row).toBeLessThan(22); // DF の手前で止まる
  });
});

// ============================================================
// フェーズ2: シュート
// ============================================================
describe('フェーズ2: シュート', () => {
  it('シュート → SHOOT イベントが発生する', () => {
    const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 27 }, hasBall: true });
    const board = makeBoard([fw]);
    const orders: Order[] = [{ pieceId: 'fw', type: 'shoot', target: { col: 10, row: 33 } }];

    // セービングなし(GKなし) → シュート成功チェックのみ
    mockJudge.mockReturnValue(ok(80));

    const { events } = processTurn(board, orders, [], makeContext());
    const shootEvts = eventsOfType(events, 'SHOOT');
    expect(shootEvts.length).toBe(1);
    expect((shootEvts[0] as { result: { outcome: string } }).result.outcome).toBe('goal');
  });
});

// ============================================================
// スルーパス成立テスト
// ============================================================
describe('スルーパス', () => {
  // セットアップ:
  //   OM(home, ball) at (10, 18) → pass to (10, 24) [FWの移動後位置]
  //   FW(home)       at (10, 20) → move to (10, 24)
  //   敵コマなし
  it('FW が移動後の位置でパスを受け取る（スルーパス成立）', () => {
    const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
      coord: { col: 10, row: 18 }, hasBall: true });
    const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 20 } });

    const board = makeBoard([om, fw]);
    const homeOrders: Order[] = [
      { pieceId: 'om', type: 'pass', target: { col: 10, row: 24 } }, // FWの移動後位置
      { pieceId: 'fw', type: 'move', target: { col: 10, row: 24 } },
    ];

    const { board: newBoard, events } = processTurn(board, homeOrders, [], makeContext());

    // FW が (10,24) に移動している
    const fwFinal = newBoard.pieces.find(p => p.id === 'fw')!;
    expect(fwFinal.coord).toEqual({ col: 10, row: 24 });

    // PASS_DELIVERED が発生している
    const passEvts = eventsOfType<PassDeliveredEvent>(events, 'PASS_DELIVERED');
    expect(passEvts.length).toBe(1);
    expect(passEvts[0].passerId).toBe('om');
    expect(passEvts[0].receiverId).toBe('fw');

    // FW がボールを持っている
    expect(fwFinal.hasBall).toBe(true);
    expect(newBoard.pieces.find(p => p.id === 'om')!.hasBall).toBe(false);
  });

  it('FW の移動前位置にパス → 移動後に受け手がいなければ失敗（届かない）', () => {
    const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
      coord: { col: 10, row: 18 }, hasBall: true });
    const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 20 } });

    const board = makeBoard([om, fw]);
    const homeOrders: Order[] = [
      { pieceId: 'om', type: 'pass', target: { col: 10, row: 20 } }, // FWの移動前位置
      { pieceId: 'fw', type: 'move', target: { col: 10, row: 24 } }, // FWは前に走る
    ];

    const { board: newBoard, events } = processTurn(board, homeOrders, [], makeContext());

    // 移動後の (10,20) には FW がいないため PASS_DELIVERED は発生しない
    const passEvts = eventsOfType<PassDeliveredEvent>(events, 'PASS_DELIVERED');
    expect(passEvts.length).toBe(0);

    // OM がボールを持ち続ける
    expect(newBoard.pieces.find(p => p.id === 'om')!.hasBall).toBe(true);
  });
});

// ============================================================
// オフサイド判定との連携
// ============================================================
describe('オフサイド判定（フェーズ3）', () => {
  // away 守備コマ2枚: (10,25) と (10,30)
  // home チーム攻撃（row増加方向）
  // offsideLine = 25（降順2番目）
  // defenders are on col=2 (away from col=10 action) so they don't block ZOC on pass path or FW movement
  const awayDf1 = makePiece({ id: 'ad1', team: 'away', position: 'DF', cost: 2, coord: { col: 2, row: 25 } });
  const awayDf2 = makePiece({ id: 'ad2', team: 'away', position: 'DF', cost: 2, coord: { col: 2, row: 30 } });

  describe('スルーパス: 移動前オンサイド → オフサイドなし', () => {
    it('FW が row=22（ライン25未満）から row=28 に走り込む → オンサイド', () => {
      const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
        coord: { col: 10, row: 18 }, hasBall: true });
      const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
        coord: { col: 10, row: 22 } }); // pre-move row=22 < offsideLine=25 → オンサイド

      const board = makeBoard([om, fw, awayDf1, awayDf2]);
      const homeOrders: Order[] = [
        { pieceId: 'om', type: 'pass', target: { col: 10, row: 26 } },
        { pieceId: 'fw', type: 'move', target: { col: 10, row: 26 } },
      ];

      const { events } = processTurn(board, homeOrders, [], makeContext());

      // PASS_DELIVERED が発生
      expect(eventsOfType<PassDeliveredEvent>(events, 'PASS_DELIVERED').length).toBe(1);
      // OFFSIDE は発生しない
      expect(eventsOfType<OffsideEvent>(events, 'OFFSIDE').length).toBe(0);
    });
  });

  describe('静的パス: 移動前オフサイド → オフサイド確定', () => {
    it('FW が row=28（ライン25より2以上先）でパスを受ける → 確定オフサイド', () => {
      const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
        coord: { col: 10, row: 18 }, hasBall: true });
      // FW は動かない（移動指示なし）→ pre-move = post-move = row=28
      const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
        coord: { col: 10, row: 28 } }); // row=28 > 25+1 → 確定オフサイド

      const board = makeBoard([om, fw, awayDf1, awayDf2]);
      const homeOrders: Order[] = [
        { pieceId: 'om', type: 'pass', target: { col: 10, row: 28 } },
      ];

      const { board: newBoard, events } = processTurn(board, homeOrders, [], makeContext());

      // PASS_DELIVERED は一旦発生する（フェーズ2で届く）
      expect(eventsOfType<PassDeliveredEvent>(events, 'PASS_DELIVERED').length).toBe(1);

      // OFFSIDE が発生（フェーズ3）
      const osEvts = eventsOfType<OffsideEvent>(events, 'OFFSIDE');
      expect(osEvts.length).toBe(1);
      expect(osEvts[0].receiverId).toBe('fw');
      expect(osEvts[0].result.isOffside).toBe(true);
      expect(osEvts[0].result.isGrayZone).toBe(false);

      // FW のボール保持は取り消される（守備チームに渡る）
      expect(newBoard.pieces.find(p => p.id === 'fw')!.hasBall).toBe(false);
    });
  });

  describe('グレーゾーン: ライン+1 → 50%判定', () => {
    it('FW が row=26（diff=1）→ judge成功でオフサイド', () => {
      mockJudge.mockReturnValue(ok(50)); // グレーゾーン判定

      const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
        coord: { col: 10, row: 18 }, hasBall: true });
      const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
        coord: { col: 10, row: 26 } }); // row=26, diff=1 → グレーゾーン

      const board = makeBoard([om, fw, awayDf1, awayDf2]);
      const homeOrders: Order[] = [
        { pieceId: 'om', type: 'pass', target: { col: 10, row: 26 } },
      ];

      const { events } = processTurn(board, homeOrders, [], makeContext());

      const osEvts = eventsOfType<OffsideEvent>(events, 'OFFSIDE');
      expect(osEvts.length).toBe(1);
      expect(osEvts[0].result.isGrayZone).toBe(true);
      expect(osEvts[0].result.isOffside).toBe(true);
    });

    it('FW が row=26（diff=1）→ judge失敗でオンサイド（ボール届く）', () => {
      mockJudge.mockReturnValue(ng(50)); // グレーゾーン判定 → オンサイド

      const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
        coord: { col: 10, row: 18 }, hasBall: true });
      const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
        coord: { col: 10, row: 26 } });

      const board = makeBoard([om, fw, awayDf1, awayDf2]);
      const homeOrders: Order[] = [
        { pieceId: 'om', type: 'pass', target: { col: 10, row: 26 } },
      ];

      const { board: newBoard, events } = processTurn(board, homeOrders, [], makeContext());

      expect(eventsOfType<OffsideEvent>(events, 'OFFSIDE').length).toBe(0);
      // FWがボールを持つ
      expect(newBoard.pieces.find(p => p.id === 'fw')!.hasBall).toBe(true);
    });
  });
});

// ============================================================
// ファウル優先順位（フェーズ1 統合）
// ============================================================
describe('ファウル優先順位（フェーズ1統合）', () => {
  it('タックル成功 + ファウル成立 → ファウルイベント発生 / ボール返却', () => {
    const dribbler = makePiece({ id: 'db', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 22 }, hasBall: true });
    const tackler  = makePiece({ id: 'tk', team: 'away', position: 'DF', cost: 2,
      coord: { col: 10, row: 24 } });

    const board = makeBoard([dribbler, tackler]);
    const homeOrders: Order[] = [
      { pieceId: 'db', type: 'dribble', target: { col: 10, row: 28 } },
    ];

    mockJudge
      .mockReturnValueOnce(ok(74))  // tackle 成功（DF+20: (2-2+3)×18+20=74）
      .mockReturnValueOnce(ok(25)); // foul 発生

    const ctx = makeContext({ getZone: () => 'アタッキングサード' });
    const { board: newBoard, events } = processTurn(board, homeOrders, [], ctx);

    // TACKLE イベント（success=true）
    const tackleEvts = eventsOfType<TackleEvent>(events, 'TACKLE');
    expect(tackleEvts.length).toBeGreaterThanOrEqual(1);
    expect(tackleEvts[0].result.success).toBe(true);

    // FOUL イベント
    const foulEvts = eventsOfType<FoulEvent>(events, 'FOUL');
    expect(foulEvts.length).toBeGreaterThanOrEqual(1);
    expect(foulEvts[0].result.occurred).toBe(true);
    expect(foulEvts[0].result.outcome).toBe('fk');

    // ファウル優先: ドリブラー(home)がボールを持ち直す
    expect(newBoard.pieces.find(p => p.id === 'db')!.hasBall).toBe(true);
    expect(newBoard.pieces.find(p => p.id === 'tk')!.hasBall).toBe(false);
  });

  it('タックル成功 + ファウルなし → タックラーがボール保持', () => {
    const dribbler = makePiece({ id: 'db', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 22 }, hasBall: true });
    const tackler  = makePiece({ id: 'tk', team: 'away', position: 'DF', cost: 2,
      coord: { col: 10, row: 24 } });

    mockJudge
      .mockReturnValueOnce(ok(74))  // tackle 成功
      .mockReturnValueOnce(ng(25)); // foul 不発生

    const ctx = makeContext({ getZone: () => 'アタッキングサード' });
    const { board: newBoard } = processTurn(
      makeBoard([dribbler, tackler]),
      [{ pieceId: 'db', type: 'dribble', target: { col: 10, row: 28 } }],
      [],
      ctx,
    );

    expect(newBoard.pieces.find(p => p.id === 'tk')!.hasBall).toBe(true);
    expect(newBoard.pieces.find(p => p.id === 'db')!.hasBall).toBe(false);
  });

  it('タックルがミドルサードで発生 → ファウル判定なし（judge呼び出し1回のみ）', () => {
    const dribbler = makePiece({ id: 'db', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 16 }, hasBall: true });
    const tackler  = makePiece({ id: 'tk', team: 'away', position: 'DF', cost: 2,
      coord: { col: 10, row: 18 } });

    mockJudge.mockReturnValue(ok(74)); // tackle 成功

    // ミドルサードD → ファウル発生条件外
    const ctx = makeContext({ getZone: () => 'ミドルサードD' });
    const { events } = processTurn(
      makeBoard([dribbler, tackler]),
      [{ pieceId: 'db', type: 'dribble', target: { col: 10, row: 22 } }],
      [],
      ctx,
    );

    // FOUL イベントなし
    expect(eventsOfType<FoulEvent>(events, 'FOUL').length).toBe(0);
    // judge は tackle の1回のみ
    expect(mockJudge).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// BALL_ACQUIRED イベントの追跡
// ============================================================
describe('BALL_ACQUIRED イベント', () => {
  it('パス成功時に受け手に BALL_ACQUIRED が発行される', () => {
    const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
      coord: { col: 10, row: 18 }, hasBall: true });
    const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 22 } });

    const { events } = processTurn(
      makeBoard([om, fw]),
      [{ pieceId: 'om', type: 'pass', target: { col: 10, row: 22 } }],
      [],
      makeContext(),
    );

    const ballEvts = eventsOfType<BallAcquiredEvent>(events, 'BALL_ACQUIRED');
    expect(ballEvts.some(e => e.pieceId === 'fw')).toBe(true);
  });
});
