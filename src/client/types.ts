// ============================================================
// types.ts — クライアント側型定義
// ============================================================

export type Position = 'GK' | 'DF' | 'SB' | 'VO' | 'MF' | 'OM' | 'WG' | 'FW';
export type Cost = 1 | 1.5 | 2 | 2.5 | 3;
export type Team = 'home' | 'away';
export type ActionMode = 'move' | 'pass' | 'shoot' | 'dribble' | 'substitute' | 'skill' | null;

export interface HexCoord {
  col: number;
  row: number;
}

export interface HexCell {
  col: number;
  row: number;
  x: number;
  y: number;
  zone: string;
  lane: string;
}

export interface PieceData {
  id: string;
  team: Team;
  position: Position;
  cost: Cost;
  coord: HexCoord;
  hasBall: boolean;
  moveRange: number;
  isBench: boolean;
}

export interface OrderData {
  pieceId: string;
  action: ActionMode;
  targetHex?: HexCoord;
  targetPieceId?: string;
  benchPieceId?: string;
}

/** ポジション別色（§6-1） */
export const POSITION_COLORS: Record<Position, string> = {
  GK: '#f0c040',
  DF: '#4080d0',
  SB: '#60c0e0',
  VO: '#9060c0',
  MF: '#50b060',
  OM: '#e08040',
  WG: '#d04040',
  FW: '#e8e8e8',
};

/** ゲーム状態 */
export interface GameState {
  matchId: string;
  turn: number;
  board: {
    pieces: PieceData[];
  };
  scoreHome: number;
  scoreAway: number;
  myTeam: Team;
  status: 'waiting' | 'playing' | 'finished';
  turnStartedAt: number | null;
  /** 今ターンの指示 */
  orders: Map<string, OrderData>;
  /** 選択中のコマID */
  selectedPieceId: string | null;
  /** 現在のアクションモード */
  actionMode: ActionMode;
}

/** WebSocketメッセージ型 */
export type WsMessage =
  | { type: 'TURN_RESULT'; turn: number; board: GameState['board']; scoreHome: number; scoreAway: number; events: GameEvent[] }
  | { type: 'MATCH_END'; reason: string; scoreHome: number; scoreAway: number }
  | { type: 'OPPONENT_DISCONNECTED'; graceSeconds: number }
  | { type: 'RECONNECT'; state: { turn: number; board: GameState['board']; scoreHome: number; scoreAway: number } }
  | { type: 'INPUT_ACCEPTED'; turn: number }
  | { type: 'INPUT_REJECTED'; violations: unknown[] }
  | { type: 'RATE_LIMIT_WARNING' }
  | { type: 'PONG'; timestamp: number }
  | { type: 'ERROR'; message: string };

/** ゲームイベント（アニメーション用） */
export interface GameEvent {
  type: string;
  phase: number;
  [key: string]: unknown;
}

/** ゲームモード */
export type GameMode = 'ranked' | 'casual' | 'com';

/** 画面遷移 */
export type Page =
  | 'title'
  | 'modeSelect'
  | 'teamSelect'
  | 'formation'
  | 'matching'
  | 'battle'
  | 'halfTime'
  | 'result'
  | 'replay';
