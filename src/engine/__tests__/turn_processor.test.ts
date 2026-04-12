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
  ShootEvent,
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
  // away 守備: GK(row=33) + DF2枚(row=25, row=30)
  // home チーム攻撃（row増加方向 = row大が敵陣）
  // GK除外後 → DF: [30, 25]。降順で最後方 = row 30
  // offside line = max(HALF_LINE, max(secondLast, ball))
  //             = max(16, max(30, ball))
  // ball=OM(row=18) → max(30,18)=30 → max(16,30)=30
  // defenders are on col=2 (away from col=10) to avoid ZOC interference
  const awayGk  = makePiece({ id: 'agk', team: 'away', position: 'GK', cost: 1, coord: { col: 2, row: 33 } });
  const awayDf1 = makePiece({ id: 'ad1', team: 'away', position: 'DF', cost: 2, coord: { col: 2, row: 25 } });
  const awayDf2 = makePiece({ id: 'ad2', team: 'away', position: 'DF', cost: 2, coord: { col: 2, row: 30 } });

  // offside line with GK(33)+DF(30)+DF(25): GK除外→最後方=row30
  // ball=OM(row=18) → max(30,18)=30。max(16,30)=30。line=30
  describe('スルーパス: 移動前オンサイド → オフサイドなし', () => {
    it('FW が row=28（ライン30未満）から走り込む → オンサイド', () => {
      const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
        coord: { col: 10, row: 18 }, hasBall: true });
      const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
        coord: { col: 10, row: 28 } }); // pre-move row=28 < offsideLine=30 → オンサイド

      const board = makeBoard([om, fw, awayGk, awayDf1, awayDf2]);
      const homeOrders: Order[] = [
        { pieceId: 'om', type: 'pass', target: { col: 10, row: 28 } },
      ];

      const { events } = processTurn(board, homeOrders, [], makeContext());

      expect(eventsOfType<PassDeliveredEvent>(events, 'PASS_DELIVERED').length).toBe(1);
      expect(eventsOfType<OffsideEvent>(events, 'OFFSIDE').length).toBe(0);
    });
  });

  describe('静的パス: 移動前オフサイド → オフサイド確定', () => {
    it('FW が row=32（ライン30より2以上先）でパスを受ける → 確定オフサイド', () => {
      const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
        coord: { col: 10, row: 18 }, hasBall: true });
      const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
        coord: { col: 10, row: 32 } }); // row=32 > 30+1 → 確定オフサイド

      const board = makeBoard([om, fw, awayGk, awayDf1, awayDf2]);
      const homeOrders: Order[] = [
        { pieceId: 'om', type: 'pass', target: { col: 10, row: 32 } },
      ];

      const { board: newBoard, events } = processTurn(board, homeOrders, [], makeContext());

      expect(eventsOfType<PassDeliveredEvent>(events, 'PASS_DELIVERED').length).toBe(1);

      const osEvts = eventsOfType<OffsideEvent>(events, 'OFFSIDE');
      expect(osEvts.length).toBe(1);
      expect(osEvts[0].receiverId).toBe('fw');
      expect(osEvts[0].result.isOffside).toBe(true);
      expect(osEvts[0].result.isGrayZone).toBe(false);

      expect(newBoard.pieces.find(p => p.id === 'fw')!.hasBall).toBe(false);
    });
  });

  describe('グレーゾーン: ライン+1 → 50%判定', () => {
    it('FW が row=31（diff=1）→ judge成功でオフサイド', () => {
      mockJudge.mockReturnValue(ok(50));

      const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
        coord: { col: 10, row: 18 }, hasBall: true });
      const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
        coord: { col: 10, row: 31 } }); // row=31, diff=1 → グレーゾーン

      const board = makeBoard([om, fw, awayGk, awayDf1, awayDf2]);
      const homeOrders: Order[] = [
        { pieceId: 'om', type: 'pass', target: { col: 10, row: 31 } },
      ];

      const { events } = processTurn(board, homeOrders, [], makeContext());

      const osEvts = eventsOfType<OffsideEvent>(events, 'OFFSIDE');
      expect(osEvts.length).toBe(1);
      expect(osEvts[0].result.isGrayZone).toBe(true);
      expect(osEvts[0].result.isOffside).toBe(true);
    });

    it('FW が row=31（diff=1）→ judge失敗でオンサイド（ボール届く）', () => {
      mockJudge.mockReturnValue(ng(50));

      const om = makePiece({ id: 'om', team: 'home', position: 'OM', cost: 3,
        coord: { col: 10, row: 18 }, hasBall: true });
      const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
        coord: { col: 10, row: 31 } });

      const board = makeBoard([om, fw, awayGk, awayDf1, awayDf2]);
      const homeOrders: Order[] = [
        { pieceId: 'om', type: 'pass', target: { col: 10, row: 31 } },
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

// ============================================================
// GKシュートコース判定（isOnShootCourse）
// ============================================================
describe('GKシュートコース判定', () => {
  // homeが攻撃 → ゴール = (10, 33)
  // シューターは (10, 25) → shootPath は col=10 の直線

  it('GKがシュートコース上 → セーブ判定が実行される（savingCheck呼び出し）', () => {
    // GK を (10, 32) に配置 → shootPath上（blockerとしても検出される）
    const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 25 }, hasBall: true });
    const gk = makePiece({ id: 'gk', team: 'away', position: 'GK', cost: 2,
      coord: { col: 10, row: 32 } });

    // ② block失敗 → ③ saving成功 → ③-b catch成功 = saved_catch
    mockJudge
      .mockReturnValueOnce(ng(30))   // ② block → 失敗（GK自身がblocker）
      .mockReturnValueOnce(ok(50))   // ③ saving → 成功
      .mockReturnValueOnce(ok(60));  // ③-b catch → 成功

    const { events } = processTurn(
      makeBoard([fw, gk]),
      [{ pieceId: 'fw', type: 'shoot', target: { col: 10, row: 33 } }],
      [],
      makeContext({ getZone: () => 'ファイナルサード' }),
    );

    const shootEvt = eventsOfType<ShootEvent>(events, 'SHOOT');
    expect(shootEvt.length).toBe(1);
    expect(shootEvt[0].result.outcome).toBe('saved_catch');
    expect(shootEvt[0].result.savingCheck).toBeDefined();
  });

  it('GKがシュートコース外 → セーブ判定スキップ（GK null扱い）', () => {
    // GK を (3, 30) に配置 → col=10 のshootPathから遠い
    const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 25 }, hasBall: true });
    const gk = makePiece({ id: 'gk', team: 'away', position: 'GK', cost: 2,
      coord: { col: 3, row: 30 } });

    // セーブ判定なし → shootSuccess のみ
    mockJudge.mockReturnValueOnce(ok(80)); // ④ shootSuccess → ゴール

    const { events } = processTurn(
      makeBoard([fw, gk]),
      [{ pieceId: 'fw', type: 'shoot', target: { col: 10, row: 33 } }],
      [],
      makeContext({ getZone: () => 'ファイナルサード' }),
    );

    const shootEvt = eventsOfType<ShootEvent>(events, 'SHOOT');
    expect(shootEvt.length).toBe(1);
    expect(shootEvt[0].result.outcome).toBe('goal');
    // セーブ判定が実行されていないことを確認
    expect(shootEvt[0].result.savingCheck).toBeUndefined();
    // judgeは shootSuccess の1回のみ
    expect(mockJudge).toHaveBeenCalledTimes(1);
  });

  it('GKがシュートコースのZOC圏内（隣接1HEX） → セーブ判定が実行される', () => {
    // GK を (11, 32) に配置 → col=10のshootPathに隣接（ZOC圏内）
    // GKのZOC（odd col 11のneighbors）: (11,31),(11,33),(10,32),(10,33),(12,32),(12,33)
    // shootPathは col=10, row=26..33 → (10,32),(10,33)がGKのZOCと交差
    // GKはblockerとしても検出される可能性あり
    const fw = makePiece({ id: 'fw', team: 'home', position: 'FW', cost: 2,
      coord: { col: 10, row: 25 }, hasBall: true });
    const gk = makePiece({ id: 'gk', team: 'away', position: 'GK', cost: 2,
      coord: { col: 11, row: 32 } });

    // ② block失敗 → ③ saving失敗 → ④ shootSuccess → ゴール
    mockJudge
      .mockReturnValueOnce(ng(30))   // ② block → 失敗（GK自身がblocker）
      .mockReturnValueOnce(ng(50))   // ③ saving → 失敗
      .mockReturnValueOnce(ok(80));  // ④ shootSuccess → ゴール

    const { events } = processTurn(
      makeBoard([fw, gk]),
      [{ pieceId: 'fw', type: 'shoot', target: { col: 10, row: 33 } }],
      [],
      makeContext({ getZone: () => 'ファイナルサード' }),
    );

    const shootEvt = eventsOfType<ShootEvent>(events, 'SHOOT');
    expect(shootEvt.length).toBe(1);
    // savingCheck が実行された（成功・失敗に関わらず）
    expect(shootEvt[0].result.savingCheck).toBeDefined();
  });
});

// ============================================================
// away側の統合テスト（ファウル・シュート・パス）
// ============================================================
describe('away側の統合テスト', () => {
  it('away攻撃時: ディフェンシブサードでタックル → ファウル発生', () => {
    // awayのドリブラーがrow 8付近（ディフェンシブサード、away攻撃方向）でタックルされる
    const awayDribbler = makePiece({
      id: 'a_fw', team: 'away', position: 'FW', cost: 2.5,
      coord: { col: 10, row: 8 }, hasBall: true,
    });
    const homeTackler = makePiece({
      id: 'h_df', team: 'home', position: 'DF', cost: 1,
      coord: { col: 10, row: 6 },
    });

    // awayはrow 6方向にドリブル → homeのZOCで停止 → タックル成功 → ファウル判定
    mockJudge
      .mockReturnValueOnce(ok(60))   // タックル成功
      .mockReturnValueOnce(ok(25));  // ファウル発生

    const { events } = processTurn(
      makeBoard([awayDribbler, homeTackler]),
      [],
      [{ pieceId: 'a_fw', type: 'dribble', target: { col: 10, row: 6 } }],
      makeContext({ getZone: () => 'ディフェンシブサード' }),
    );

    const foulEvts = eventsOfType<FoulEvent>(events, 'FOUL');
    expect(foulEvts.length).toBe(1);
    expect(foulEvts[0].result.outcome).toBe('fk');
  });

  it('away攻撃時: ディフェンシブGサード PA内タックル → PK', () => {
    const awayDribbler = makePiece({
      id: 'a_fw', team: 'away', position: 'FW', cost: 2.5,
      coord: { col: 10, row: 3 }, hasBall: true,
    });
    const homeTackler = makePiece({
      id: 'h_df', team: 'home', position: 'DF', cost: 1,
      coord: { col: 10, row: 1 },
    });

    mockJudge
      .mockReturnValueOnce(ok(60))  // タックル成功
      .mockReturnValueOnce(ok(25)); // ファウル発生

    const { events } = processTurn(
      makeBoard([awayDribbler, homeTackler]),
      [],
      [{ pieceId: 'a_fw', type: 'dribble', target: { col: 10, row: 1 } }],
      makeContext({ getZone: () => 'ディフェンシブGサード' }),
    );

    const foulEvts = eventsOfType<FoulEvent>(events, 'FOUL');
    expect(foulEvts.length).toBe(1);
    expect(foulEvts[0].result.outcome).toBe('pk');
    expect(foulEvts[0].result.isPA).toBe(true);
  });

  it('awayのシュート → ゴール（row 0方向、GKなし）', () => {
    // GKなしでシュート → savingCheck省略 → shootSuccessCheckのみ
    const awayShooter = makePiece({
      id: 'a_fw', team: 'away', position: 'FW', cost: 2.5,
      coord: { col: 10, row: 5 }, hasBall: true,
    });

    mockJudge
      .mockReturnValueOnce(ok(80)); // ④ shootSuccess → ゴール

    const { events } = processTurn(
      makeBoard([awayShooter]),
      [],
      [{ pieceId: 'a_fw', type: 'shoot', target: { col: 10, row: 0 } }],
      makeContext({ getZone: () => 'ディフェンシブGサード' }),
    );

    const shootEvts = eventsOfType<ShootEvent>(events, 'SHOOT');
    expect(shootEvts.length).toBe(1);
    expect(shootEvts[0].result.outcome).toBe('goal');
  });

  it('awayのパス配送が正常に動作する', () => {
    const passer = makePiece({
      id: 'a_mf', team: 'away', position: 'MF', cost: 1.5,
      coord: { col: 10, row: 20 }, hasBall: true,
    });
    const receiver = makePiece({
      id: 'a_fw', team: 'away', position: 'FW', cost: 2.5,
      coord: { col: 10, row: 15 },
    });

    // パスカットなし
    mockJudge.mockReturnValue(ng(0));

    const { events, board } = processTurn(
      makeBoard([passer, receiver]),
      [],
      [{ pieceId: 'a_mf', type: 'pass', target: { col: 10, row: 15 }, targetPieceId: 'a_fw' }],
      makeContext(),
    );

    const passEvts = eventsOfType<PassDeliveredEvent>(events, 'PASS_DELIVERED');
    expect(passEvts.length).toBe(1);
    expect(passEvts[0].receiverId).toBe('a_fw');
    // 受け手がボールを持っている
    expect(board.pieces.find(p => p.id === 'a_fw')!.hasBall).toBe(true);
    expect(board.pieces.find(p => p.id === 'a_mf')!.hasBall).toBe(false);
  });
});
