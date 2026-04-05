// ============================================================
// useGameState.ts — ゲーム状態管理フック
// ============================================================

import { useReducer, useCallback, useMemo } from 'react';
import type { GameState, OrderData, PieceData, ActionMode, HexCoord, WsMessage, Team } from '../types';

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
  | { type: 'INIT_MATCH'; matchId: string; myTeam: Team; board: GameState['board'] };

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
  };
}

/** §2-7 プリセット行動で対象となるポジション */
const DEFEND_POSITIONS = new Set<string>(['DF', 'SB', 'VO', 'GK']);
const ATTACK_POSITIONS = new Set<string>(['MF', 'OM', 'WG', 'FW']);

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

    case 'INIT_MATCH':
      return {
        ...createInitialState(),
        matchId: action.matchId,
        myTeam: action.myTeam,
        board: action.board,
        status: 'playing',
        turn: 1,
        turnStartedAt: Date.now(),
      };

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
