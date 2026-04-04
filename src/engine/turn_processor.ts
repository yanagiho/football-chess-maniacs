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
  Order,
  Piece,
  TurnResult,
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
  // 次のターン用ボードを構築
  // ──────────────────────────────────────────────────────────
  const newBoard: Board = {
    pieces: phase3.pieces,
    snapshot,
  };

  return { board: newBoard, events: allEvents };
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
