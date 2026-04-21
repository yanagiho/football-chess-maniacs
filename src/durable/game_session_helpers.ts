// ============================================================
// game_session_helpers.ts — GameSession DO の型・定数・純粋関数
// ============================================================

import type { Board, Order, OrderType, Piece, Position, Cost, Team } from '../engine/types';
import { getMovementRange } from '../engine/movement';
import type { TurnInput, RawOrder, PieceInfo } from '../middleware/validation';
import type { Difficulty, Era } from '../ai/prompt_builder';
import { boardContext } from '../engine/hex_utils';

// ================================================================
// 定数
// ================================================================

export const TURN_TIMEOUT_MS = 60_000;       // 1分
export const DISCONNECT_GRACE_MS = 30_000;   // 30秒
export const MAX_NONCE_HISTORY = 200;
export const TURNS_PER_HALF = 15;
export const MAX_AT = 3;
export const MAX_GAME_TURNS = (TURNS_PER_HALF + MAX_AT) * 2; // 36

// ================================================================
// 型定義
// ================================================================

/** ゲーム状態（DO永続ストレージに保存） */
export interface GameState {
  matchId: string;
  homeUserId: string;
  awayUserId: string;
  turn: number;
  board: Board | null;
  scoreHome: number;
  scoreAway: number;
  status: 'waiting' | 'playing' | 'halftime' | 'finished';
  turnStartedAt: number | null;
  lastSequences: Record<string, number>;
  usedNonces: string[];
  remainingSubs: Record<string, number>;
  disconnectedPlayers: Record<string, number>;
  turnLog: unknown[];
  half: 1 | 2;
  firstHalfAT: number;
  secondHalfAT: number;
  halfTimeTurn: number;
  totalTurns: number;
  kickoffTeam: 'home' | 'away';
  isComMatch?: boolean;
  comDifficulty?: Difficulty;
  comEra?: Era;
  comSessionToken?: string;
}

/** WebSocketにアタッチするメタデータ */
export interface WsAttachment {
  userId: string;
  team: 'home' | 'away';
}

// ================================================================
// BoardContext（hex_utils.tsからインポート）
// ================================================================

export { boardContext };

// ================================================================
// 純粋関数
// ================================================================

/** Board.pieces → PieceInfo[] に変換（バリデーション用） */
export function boardToPieceInfos(board: Board): PieceInfo[] {
  return board.pieces.map(p => ({
    id: p.id,
    team: p.team,
    position: p.position,
    cost: p.cost,
    coord: p.coord,
    hasBall: p.hasBall,
    moveRange: getMovementRange(
      p, false,
      boardContext.getZone(p.coord),
      boardContext.getLane(p.coord),
    ),
    isBench: false,
  }));
}

/** RawOrder → engine Order に変換 */
export function rawOrderToEngine(raw: RawOrder): Order {
  return {
    pieceId: raw.piece_id,
    type: raw.action as OrderType,
    target: raw.target_hex
      ? { col: raw.target_hex[0], row: raw.target_hex[1] }
      : undefined,
    targetPieceId: raw.target_piece,
  };
}

// ================================================================
// 初期配置生成（4-4-2フォーメーション）
// ================================================================

const INITIAL_FORMATION: Array<{ pos: Position; cost: Cost; col: number; row: number }> = [
  { pos: 'GK', cost: 1,   col: 10, row: 1 },
  { pos: 'DF', cost: 1,   col: 7,  row: 5 },
  { pos: 'DF', cost: 1.5, col: 13, row: 5 },
  { pos: 'SB', cost: 1,   col: 4,  row: 6 },
  { pos: 'SB', cost: 1.5, col: 16, row: 6 },
  { pos: 'VO', cost: 2,   col: 10, row: 9 },
  { pos: 'MF', cost: 1,   col: 7,  row: 12 },
  { pos: 'MF', cost: 1.5, col: 13, row: 12 },
  { pos: 'OM', cost: 2,   col: 10, row: 15 },
  { pos: 'WG', cost: 1.5, col: 4,  row: 17 },
  { pos: 'FW', cost: 2.5, col: 10, row: 19 },
];

/** 初期コマ配置を生成し、指定チームのFWにボールを付与 */
export function createInitialBoard(kickoffTeam: Team): Board {
  const pieces: Piece[] = [];
  for (let i = 0; i < INITIAL_FORMATION.length; i++) {
    const f = INITIAL_FORMATION[i];
    pieces.push({
      id: `h${String(i + 1).padStart(2, '0')}`,
      team: 'home',
      position: f.pos,
      cost: f.cost,
      coord: { col: f.col, row: f.row },
      hasBall: false,
    });
    pieces.push({
      id: `a${String(i + 1).padStart(2, '0')}`,
      team: 'away',
      position: f.pos,
      cost: f.cost,
      coord: { col: f.col, row: 33 - f.row },
      hasBall: false,
    });
  }
  const fw = pieces.find(p => p.team === kickoffTeam && p.position === 'FW');
  if (fw) fw.hasBall = true;
  return { pieces, snapshot: [] };
}

/** 空のターン入力（タイムアウト時のデフォルト） */
export function createEmptyTurnInput(matchId: string, turn: number, playerId: string): TurnInput {
  return {
    match_id: matchId,
    turn,
    player_id: playerId,
    sequence: -1,
    nonce: `timeout_${turn}_${playerId}`,
    orders: [],
    client_hash: '',
    timestamp: Date.now(),
  };
}
