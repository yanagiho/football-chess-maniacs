// ============================================================
// turn_processor.ts — フェーズ0〜3 のターン処理オーケストレーター
//
// §9-2 全フェーズを順番に実行し TurnResult を返す。
//
// 入力:
//   board        — 現在のボード状態
//   homeOrders   — home チームの指示配列
//   awayOrders   — away チームの指示配列
//   context      — HEX情報プロバイダ（zone/lane/isValid）
//
// 出力:
//   TurnResult { board, events }
//
// フェーズ概要:
//   Phase 0: スナップショット（移動前位置を記録）
//   Phase 1: コマ移動（ZOC停止→競合→タックル→ファウル）
//   Phase 2: ボール処理（シュート→パス配送→パスカット）
//   Phase 3: 特殊判定（オフサイド）
// ============================================================

import { processBall } from './ball';
import { processMovement } from './movement';
import { processSpecial } from './special';
import type {
  Board,
  BoardContext,
  GameEvent,
  HexCoord,
  Order,
  Piece,
  TurnResult,
  LooseBallEvent,
  BallAcquiredEvent,
} from './types';

// ============================================================
// ターン処理メイン
// ============================================================

/**
 * 1ターン分の処理を実行する。
 *
 * @param board       現在のボード状態
 * @param homeOrders  home チームの指示（最大11枚分）
 * @param awayOrders  away チームの指示（最大11枚分）
 * @param context     HEX情報プロバイダ
 * @returns           フェーズ3完了後のボード + 全イベントリスト
 */
export function processTurn(
  board: Board,
  homeOrders: Order[],
  awayOrders: Order[],
  context: BoardContext,
): TurnResult {
  const allEvents: GameEvent[] = [];

  // ──────────────────────────────────────────────────────────
  // フェーズ0: スナップショット
  // ターン開始時の全コマ位置を記録（オフサイド判定用）
  // ──────────────────────────────────────────────────────────
  const snapshot: Piece[] = board.pieces.map(p => ({
    ...p,
    coord: { ...p.coord },
  }));

  // 両チームの指示を結合
  const allOrders: Order[] = [...homeOrders, ...awayOrders];

  // ──────────────────────────────────────────────────────────
  // フェーズ1: コマ移動
  // ──────────────────────────────────────────────────────────
  const phase1 = processMovement(board.pieces, allOrders, context);
  allEvents.push(...phase1.events);

  // ──────────────────────────────────────────────────────────
  // フェーズ1.5: フリーボール争奪（ルーズボール）
  // ──────────────────────────────────────────────────────────
  let freeBallHex: HexCoord | null = board.freeBallHex ?? null;
  if (freeBallHex) {
    const contestResult = resolveLooseBall(phase1.pieces, freeBallHex);
    allEvents.push(...contestResult.events);
    if (contestResult.acquiredBy) {
      freeBallHex = null; // 誰かが拾った
    } else {
      freeBallHex = contestResult.newFreeBallHex; // まだフリー
    }
  }

  // ──────────────────────────────────────────────────────────
  // フェーズ2: ボール処理
  // フェーズ1 完了後の盤面を使用
  // ──────────────────────────────────────────────────────────
  const phase2 = processBall(phase1.pieces, allOrders, context);
  allEvents.push(...phase2.events);

  // ──────────────────────────────────────────────────────────
  // フェーズ3: 特殊判定（オフサイド）
  // フェーズ0 スナップショットを基準に判定
  // ──────────────────────────────────────────────────────────
  const phase3 = processSpecial(phase2.pieces, snapshot, phase2.deliveredPass);
  allEvents.push(...phase3.events);

  // ──────────────────────────────────────────────────────────
  // フェーズ2後: スルーパスでフリーボールが発生したかチェック
  // ──────────────────────────────────────────────────────────
  // ボールを持っているコマがいなければフリーボール
  const anyoneHasBall = phase3.pieces.some(p => p.hasBall);
  if (!anyoneHasBall && !freeBallHex) {
    // throughPassの結果で誰も拾えなかった場合など
    // throughPass先のtargetHexをフリーボール位置とする
    const tpOrder = allOrders.find(o => o.type === 'throughPass' && o.target);
    if (tpOrder?.target) {
      freeBallHex = tpOrder.target;
    }
  }

  // ──────────────────────────────────────────────────────────
  // ボール整合性チェック＋自動修正
  // ──────────────────────────────────────────────────────────
  const finalPieces = phase3.pieces;
  const ballHolders = finalPieces.filter(p => p.hasBall);
  if (ballHolders.length > 1) {
    // 複数保持者 → 最初の1人だけ残す
    console.error('[processTurn] BUG: Multiple ball holders:', ballHolders.map(p => p.id));
    for (let i = 1; i < ballHolders.length; i++) ballHolders[i].hasBall = false;
  }
  if (ballHolders.length > 0 && freeBallHex) {
    // 保持者とフリーボールが共存 → フリーを消す
    freeBallHex = null;
  }
  if (ballHolders.length === 0 && !freeBallHex) {
    // ボールが消失 → 元の保持者に戻す
    console.error('[processTurn] BUG: Ball disappeared! Restoring from snapshot.');
    const origHolder = snapshot.find(p => p.hasBall);
    if (origHolder) {
      const piece = finalPieces.find(p => p.id === origHolder.id);
      if (piece) {
        piece.hasBall = true;
      } else {
        // 元の保持者が見つからない → 最初のFPに渡す
        const fallback = finalPieces[0];
        if (fallback) fallback.hasBall = true;
      }
    } else {
      // スナップショットにも保持者がいない → 最初のFPに渡す
      const fallback = finalPieces[0];
      if (fallback) fallback.hasBall = true;
    }
  }

  // ──────────────────────────────────────────────────────────
  // 次のターン用ボードを構築
  // ──────────────────────────────────────────────────────────
  const newBoard: Board = {
    pieces: finalPieces,
    snapshot,
    freeBallHex,
  };

  return { board: newBoard, events: allEvents };
}

// ============================================================
// フリーボール争奪（ルーズボール）
// ============================================================

interface LooseBallResult {
  events: GameEvent[];
  acquiredBy: string | null;
  newFreeBallHex: HexCoord | null;
}

function resolveLooseBall(pieces: Piece[], freeBallHex: HexCoord): LooseBallResult {
  const events: GameEvent[] = [];
  const fbKey = `${freeBallHex.col},${freeBallHex.row}`;

  // freeBallHexにいるコマを検出
  const onHex = pieces.filter(p => `${p.coord.col},${p.coord.row}` === fbKey);

  if (onHex.length === 0) {
    // 隣接HEX（距離1）にいるコマを検出
    const adjacent = pieces.filter(p => {
      const dc = Math.abs(p.coord.col - freeBallHex.col);
      const dr = Math.abs(p.coord.row - freeBallHex.row);
      return dc <= 1 && dr <= 1 && (dc + dr > 0);
    });
    if (adjacent.length === 0) {
      // 誰も近くにいない → フリーボール継続
      events.push({ type: 'LOOSE_BALL', phase: 1, coord: freeBallHex, acquiredBy: null } as LooseBallEvent);
      return { events, acquiredBy: null, newFreeBallHex: freeBallHex };
    }
    // 隣接コマの中でコスト最高が拾う
    const winner = pickByHighestCost(adjacent);
    winner.hasBall = true;
    events.push({ type: 'LOOSE_BALL', phase: 1, coord: freeBallHex, acquiredBy: winner.id } as LooseBallEvent);
    events.push({ type: 'BALL_ACQUIRED', phase: 1, pieceId: winner.id } as BallAcquiredEvent);
    return { events, acquiredBy: winner.id, newFreeBallHex: null };
  }

  if (onHex.length === 1) {
    // 1チームの1コマだけ → 自動取得
    onHex[0].hasBall = true;
    events.push({ type: 'LOOSE_BALL', phase: 1, coord: freeBallHex, acquiredBy: onHex[0].id } as LooseBallEvent);
    events.push({ type: 'BALL_ACQUIRED', phase: 1, pieceId: onHex[0].id } as BallAcquiredEvent);
    return { events, acquiredBy: onHex[0].id, newFreeBallHex: null };
  }

  // 複数コマが同一HEXにいる場合 — コスト最高で比較
  const winner = pickByHighestCost(onHex);
  winner.hasBall = true;
  events.push({ type: 'LOOSE_BALL', phase: 1, coord: freeBallHex, acquiredBy: winner.id } as LooseBallEvent);
  events.push({ type: 'BALL_ACQUIRED', phase: 1, pieceId: winner.id } as BallAcquiredEvent);
  return { events, acquiredBy: winner.id, newFreeBallHex: null };
}

/** コスト最高のコマを選出（同コストなら乱数） */
function pickByHighestCost(candidates: Piece[]): Piece {
  const maxCost = Math.max(...candidates.map(p => p.cost));
  const topCandidates = candidates.filter(p => p.cost === maxCost);
  return topCandidates[Math.floor(Math.random() * topCandidates.length)];
}

// ============================================================
// ユーティリティ: BoardContext の標準実装ファクトリ
// ============================================================

/**
 * hex_map.json のデータから BoardContext を生成する。
 *
 * 使用例:
 *   import hexMapData from '../data/hex_map.json';
 *   const context = createBoardContext(hexMapData);
 */
export function createBoardContext(
  hexMapData: Array<{ col: number; row: number; zone: string; lane: string }>,
): BoardContext {
  const lookup = new Map(hexMapData.map(h => [`${h.col},${h.row}`, h]));

  return {
    getZone(coord) {
      return (lookup.get(`${coord.col},${coord.row}`)?.zone as import('./types').Zone) ??
        'ミドルサードA';
    },
    getLane(coord) {
      return (lookup.get(`${coord.col},${coord.row}`)?.lane as import('./types').Lane) ??
        'センターレーン';
    },
    isValidHex(coord) {
      return lookup.has(`${coord.col},${coord.row}`);
    },
  };
}

// ============================================================
// ユーティリティ: イベントフィルタ
// ============================================================

/** 特定フェーズのイベントだけ抽出 */
export function eventsOfPhase(
  events: GameEvent[],
  phase: 0 | 1 | 2 | 3,
): GameEvent[] {
  return events.filter(e => (e as { phase?: number }).phase === phase);
}

/** 特定タイプのイベントだけ抽出 */
export function eventsOfType<T extends GameEvent>(
  events: GameEvent[],
  type: T['type'],
): T[] {
  return events.filter((e): e is T => e.type === type);
}

/** ゴールが発生したか確認 */
export function hasGoal(events: GameEvent[]): boolean {
  return events.some(e => e.type === 'SHOOT' && (e as import('./types').ShootEvent).result.outcome === 'goal');
}

/** ファウルが発生した場合にその情報を返す */
export function getFoulEvent(events: GameEvent[]): import('./types').FoulEvent | null {
  return events.find((e): e is import('./types').FoulEvent => e.type === 'FOUL') ?? null;
}
