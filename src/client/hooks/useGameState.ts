// ============================================================
// useGameState.ts — ゲーム状態管理フック
// ============================================================

import { useReducer, useCallback, useMemo } from 'react';
import type { GameState, OrderData, PieceData, ActionMode, HexCoord, WsMessage, Team } from '../types';

/** 前半/後半の基本ターン数 */
const HALF_TURNS = 15;

type GameAction =
  | { type: 'SELECT_PIECE'; pieceId: string | null }
  | { type: 'SET_ACTION_MODE'; mode: ActionMode }
  | { type: 'ADD_ORDER'; order: OrderData }
  | { type: 'REMOVE_ORDER'; pieceId: string }
  | { type: 'UNDO_LAST_ORDER' }
  | { type: 'CLEAR_ORDERS' }
  | { type: 'SET_BOARD'; board: GameState['board']; turn: number; scoreHome: number; scoreAway: number }
  | { type: 'SET_STATUS'; status: GameState['status'] }
  | { type: 'APPLY_PRESET'; preset: 'forward' | 'backward' | 'defend' | 'attack'; myTeam: Team; opponentZocHexes: Set<string> }
  | { type: 'INIT_MATCH'; matchId: string; myTeam: Team; board: GameState['board'] }
  | { type: 'RESOLVE_TURN' }
  | { type: 'NEXT_TURN' }
  | { type: 'RESUME_SECOND_HALF' }
  | { type: 'APPLY_TURN_RESULT'; board: GameState['board']; turn: number; scoreHome: number; scoreAway: number }
  | { type: 'APPLY_ENGINE_RESULT'; pieces: PieceData[]; scoreHome: number; scoreAway: number };

/** ランダムなアディショナルタイム（1〜3） */
function randomAT(): number {
  return Math.floor(Math.random() * 3) + 1;
}

function createInitialState(): GameState {
  return {
    matchId: '',
    turn: 0,
    board: { pieces: [] },
    scoreHome: 0,
    scoreAway: 0,
    myTeam: 'home',
    status: 'waiting',
    turnStartedAt: null,
    orders: new Map(),
    selectedPieceId: null,
    actionMode: null,
    additionalTime1: randomAT(),
    additionalTime2: randomAT(),
  };
}

/** §2-7 プリセット行動で対象となるポジション */
const DEFEND_POSITIONS = new Set<string>(['DF', 'SB', 'VO', 'GK']);
const ATTACK_POSITIONS = new Set<string>(['MF', 'OM', 'WG', 'FW']);

/** 指示に基づいてコマを移動する簡易処理 */
function applyOrders(pieces: PieceData[], orders: Map<string, OrderData>): PieceData[] {
  const moved = pieces.map(p => {
    const order = orders.get(p.id);
    if (order?.action === 'move' && order.targetHex) {
      return { ...p, coord: { col: order.targetHex.col, row: order.targetHex.row } };
    }
    if (order?.action === 'dribble' && order.targetHex) {
      return { ...p, coord: { col: order.targetHex.col, row: order.targetHex.row } };
    }
    if (order?.action === 'pass' && order.targetPieceId && p.hasBall && p.id === order.pieceId) {
      return { ...p, hasBall: false };
    }
    if (order?.action === 'throughPass' && order.targetHex && p.hasBall && p.id === order.pieceId) {
      return { ...p, hasBall: false };
    }
    return p;
  });
  for (const [, order] of orders) {
    if (order.action === 'pass' && order.targetPieceId) {
      const idx = moved.findIndex(p => p.id === order.targetPieceId);
      if (idx !== -1) moved[idx] = { ...moved[idx], hasBall: true };
    }
    // スルーパス: targetHexに最も近い味方コマがボールを受け取る（簡易処理）
    if (order.action === 'throughPass' && order.targetHex) {
      const target = order.targetHex;
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < moved.length; i++) {
        const p = moved[i];
        if (p.id === order.pieceId || p.isBench) continue;
        if (p.team !== moved.find(pp => pp.id === order.pieceId)?.team) continue;
        const d = Math.abs(p.coord.col - target.col) + Math.abs(p.coord.row - target.row);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      if (bestIdx >= 0 && bestDist <= 2) {
        moved[bestIdx] = { ...moved[bestIdx], hasBall: true };
      }
    }
  }
  return moved;
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SELECT_PIECE':
      return { ...state, selectedPieceId: action.pieceId, actionMode: null };

    case 'SET_ACTION_MODE':
      return { ...state, actionMode: action.mode };

    case 'ADD_ORDER': {
      const newOrders = new Map(state.orders);
      newOrders.set(action.order.pieceId, action.order);
      return { ...state, orders: newOrders, selectedPieceId: null, actionMode: null };
    }

    case 'REMOVE_ORDER': {
      const newOrders = new Map(state.orders);
      newOrders.delete(action.pieceId);
      return { ...state, orders: newOrders };
    }

    case 'UNDO_LAST_ORDER': {
      const entries = [...state.orders.entries()];
      if (entries.length === 0) return state;
      const newOrders = new Map(entries.slice(0, -1));
      return { ...state, orders: newOrders };
    }

    case 'CLEAR_ORDERS':
      return { ...state, orders: new Map(), selectedPieceId: null, actionMode: null };

    case 'SET_BOARD':
      return {
        ...state,
        board: action.board,
        turn: action.turn,
        scoreHome: action.scoreHome,
        scoreAway: action.scoreAway,
        orders: new Map(),
        selectedPieceId: null,
        actionMode: null,
        turnStartedAt: Date.now(),
      };

    case 'SET_STATUS':
      return { ...state, status: action.status };

    case 'INIT_MATCH': {
      const at1 = randomAT();
      const at2 = randomAT();
      return {
        ...createInitialState(),
        matchId: action.matchId,
        myTeam: action.myTeam,
        board: action.board,
        status: 'playing',
        turn: 1,
        turnStartedAt: Date.now(),
        additionalTime1: at1,
        additionalTime2: at2,
      };
    }

    case 'RESOLVE_TURN': {
      // 命令を適用してコマを移動、resolving 状態に入る（タイマー停止）
      const resolved = applyOrders(state.board.pieces, state.orders);
      return {
        ...state,
        board: { pieces: resolved },
        status: 'resolving',
        turnStartedAt: null, // タイマー停止
        selectedPieceId: null,
        actionMode: null,
      };
    }

    case 'NEXT_TURN': {
      // safety: resolving以外から呼ばれた場合もフォールバック（リプレイスキップ等）
      if (state.status !== 'resolving' && state.status !== 'playing') {
        console.warn(`[GameState] NEXT_TURN called in unexpected status: ${state.status}`);
      }

      const nextTurn = state.turn + 1;
      const halfEnd = HALF_TURNS + state.additionalTime1;    // 前半終了ターン
      const fullEnd = HALF_TURNS * 2 + state.additionalTime1 + state.additionalTime2; // 後半終了ターン

      // RESOLVE_TURN済み（resolving状態）ならコマ移動済み、それ以外は今ここで適用
      const movedPieces = state.status === 'resolving'
        ? state.board.pieces
        : applyOrders(state.board.pieces, state.orders);

      // 前半終了 → ハーフタイム
      if (state.turn === halfEnd) {
        return {
          ...state,
          turn: nextTurn,
          board: { pieces: movedPieces },
          orders: new Map(),
          selectedPieceId: null,
          actionMode: null,
          status: 'halftime',
          turnStartedAt: null,
        };
      }

      // 試合終了
      if (nextTurn > fullEnd) {
        return { ...state, status: 'finished', orders: new Map(), selectedPieceId: null, actionMode: null };
      }

      return {
        ...state,
        turn: nextTurn,
        board: { pieces: movedPieces },
        orders: new Map(),
        selectedPieceId: null,
        actionMode: null,
        status: 'playing',
        turnStartedAt: Date.now(),
      };
    }

    case 'RESUME_SECOND_HALF':
      return {
        ...state,
        status: 'playing',
        turnStartedAt: Date.now(),
      };

    case 'APPLY_ENGINE_RESULT': {
      // COM対戦: エンジンの processTurn 結果を反映して resolving 状態に入る
      return {
        ...state,
        board: { pieces: action.pieces },
        scoreHome: action.scoreHome,
        scoreAway: action.scoreAway,
        status: 'resolving',
        turnStartedAt: null,
        orders: new Map(),
        selectedPieceId: null,
        actionMode: null,
      };
    }

    case 'APPLY_TURN_RESULT': {
      // オンライン対戦: サーバーからのターン結果を反映（ハーフタイム/試合終了の判定付き）
      const halfEnd = HALF_TURNS + state.additionalTime1;
      const fullEnd = HALF_TURNS * 2 + state.additionalTime1 + state.additionalTime2;

      let newStatus: GameState['status'] = 'playing';
      if (action.turn > fullEnd) {
        newStatus = 'finished';
      } else if (state.turn <= halfEnd && action.turn > halfEnd) {
        newStatus = 'halftime';
      }

      return {
        ...state,
        board: action.board,
        turn: action.turn,
        scoreHome: action.scoreHome,
        scoreAway: action.scoreAway,
        status: newStatus,
        orders: new Map(),
        selectedPieceId: null,
        actionMode: null,
        turnStartedAt: newStatus === 'playing' ? Date.now() : null,
      };
    }

    case 'APPLY_PRESET': {
      const newOrders = new Map(state.orders);
      const myPieces = state.board.pieces.filter(
        (p) => p.team === action.myTeam && !p.isBench,
      );
      const unorderedPieces = myPieces.filter((p) => !newOrders.has(p.id));

      for (const piece of unorderedPieces) {
        const shouldMove = shouldApplyPreset(piece, action.preset);
        if (!shouldMove) continue;

        const target = getPresetTarget(piece.coord, action.preset, action.myTeam);
        if (!target) continue;

        // ZOC圏チェック：移動先がZOC内なら除外
        const hexKey = `${target.col},${target.row}`;
        if (action.opponentZocHexes.has(hexKey)) continue;

        newOrders.set(piece.id, {
          pieceId: piece.id,
          action: 'move',
          targetHex: target,
        });
      }
      return { ...state, orders: newOrders };
    }

    default:
      return state;
  }
}

function shouldApplyPreset(piece: PieceData, preset: 'forward' | 'backward' | 'defend' | 'attack'): boolean {
  switch (preset) {
    case 'forward':
    case 'backward':
      return true;
    case 'defend':
      return DEFEND_POSITIONS.has(piece.position);
    case 'attack':
      return ATTACK_POSITIONS.has(piece.position);
  }
}

function getPresetTarget(coord: HexCoord, preset: 'forward' | 'backward' | 'defend' | 'attack', myTeam: Team): HexCoord | null {
  // home は row 増加が前方（ゴール=row33）、away は row 減少が前方（ゴール=row0）
  const dir = (preset === 'forward' || preset === 'attack') ? 1 : -1;
  const teamDir = myTeam === 'home' ? dir : -dir;
  const newRow = coord.row + teamDir;
  if (newRow < 0 || newRow > 33) return null;
  return { col: coord.col, row: newRow };
}

export function useGameState() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  const myPieces = useMemo(
    () => state.board.pieces.filter((p) => p.team === state.myTeam && !p.isBench),
    [state.board.pieces, state.myTeam],
  );

  const myBenchPieces = useMemo(
    () => state.board.pieces.filter((p) => p.team === state.myTeam && p.isBench),
    [state.board.pieces, state.myTeam],
  );

  const opponentPieces = useMemo(
    () => state.board.pieces.filter((p) => p.team !== state.myTeam),
    [state.board.pieces, state.myTeam],
  );

  const orderedCount = state.orders.size;
  const totalFieldPieces = myPieces.length;

  const selectedPiece = useMemo(
    () => state.selectedPieceId ? state.board.pieces.find((p) => p.id === state.selectedPieceId) ?? null : null,
    [state.selectedPieceId, state.board.pieces],
  );

  /** WebSocketメッセージ処理 */
  const handleWsMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'TURN_RESULT':
        dispatch({ type: 'SET_BOARD', board: msg.board, turn: msg.turn, scoreHome: msg.scoreHome, scoreAway: msg.scoreAway });
        break;
      case 'MATCH_END':
        dispatch({ type: 'SET_STATUS', status: 'finished' });
        break;
      case 'RECONNECT':
        dispatch({ type: 'SET_BOARD', board: msg.state.board, turn: msg.state.turn, scoreHome: msg.state.scoreHome, scoreAway: msg.state.scoreAway });
        break;
    }
  }, []);

  return {
    state,
    dispatch,
    myPieces,
    myBenchPieces,
    opponentPieces,
    orderedCount,
    totalFieldPieces,
    selectedPiece,
    handleWsMessage,
  };
}
