// ============================================================
// types.ts — クライアント側型定義
// ============================================================

export type Position = 'GK' | 'DF' | 'SB' | 'VO' | 'MF' | 'OM' | 'WG' | 'FW';
export type Cost = 1 | 1.5 | 2 | 2.5 | 3;
export type Team = 'home' | 'away';
export type FreeBallSource = 'throughPass' | 'loose';
export type ActionMode = 'move' | 'pass' | 'shoot' | 'dribble' | 'throughPass' | 'substitute' | 'skill' | null;

/** ターン内フェーズ（入力制御に使用） */
export type TurnPhase = 'TURN_START' | 'INPUT' | 'WAITING' | 'EXECUTION' | 'EVENT' | 'TURN_END';

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
    freeBallHex?: HexCoord | null;
    freeBallLastTouchedTeam?: Team | null;
    freeBallLastTouchedPieceId?: string | null;
    freeBallSource?: FreeBallSource | null;
    possessionDelay?: { team: Team | null; count: number } | null;
    passiveTacticsTeams?: Team[];
  };
  scoreHome: number;
  scoreAway: number;
  myTeam: Team;
  status: 'waiting' | 'playing' | 'resolving' | 'halftime' | 'finished' | 'waiting_opponent';
  turnStartedAt: number | null;
  /** 今ターンの指示 */
  orders: Map<string, OrderData>;
  /** 選択中のコマID */
  selectedPieceId: string | null;
  /** 現在のアクションモード */
  actionMode: ActionMode;
  /** 前半アディショナルタイム（1〜3ターン） */
  additionalTime1: number;
  /** 後半アディショナルタイム（1〜3ターン） */
  additionalTime2: number;
  /** ターン内フェーズ */
  turnPhase: TurnPhase;
  /** ターン開始時の盤面スナップショット（EXECUTION再生用） */
  turnStartSnapshot: PieceData[] | null;
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

/** 編成画面から引き継ぐフォーメーションデータ */
export interface FormationPiece {
  id: string;
  position: Position;
  cost: Cost;
  col: number;
  row: number;
}

/** チームの出自: 自作編成 / プリセット(NPCチーム流用) */
export type TeamOrigin = 'custom' | 'preset';

export interface FormationData {
  starters: FormationPiece[];
  bench: FormationPiece[];
  /** チーム名（自作は既定で未設定→表示側で team.default_name にフォールバック、プリセットは PresetTeam.name を引き継ぐ） */
  teamName?: string;
  /** 代表アイコン（絵文字）。プリセットは PresetTeam.emoji を引き継ぐ */
  teamEmoji?: string;
  origin?: TeamOrigin;
}

/** ボード最大行（0-33） */
export const MAX_ROW = 33;

/** ゲームモード */
export type GameMode = 'ranked' | 'casual' | 'com' | 'comVsCom';

/** COM難易度 */
export type ComDifficulty = 'beginner' | 'regular' | 'maniac';

/** 画面遷移 */
export type Page =
  | 'title'
  | 'modeSelect'
  | 'formation'
  | 'matching'
  | 'battle'
  | 'halfTime'
  | 'result'
  | 'replay'
  | 'shop'
  | 'ranking'
  | 'collection'
  | 'profile'
  | 'settings'
  | 'friendMatch'
  | 'presetTeams'
  | 'replayViewer';

/** 試合スタッツ（リザルト画面用） */
export interface MatchStats {
  possession: { home: number; away: number };
  shots: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  passesAttempted: { home: number; away: number };
  passesCompleted: { home: number; away: number };
  tackles: { home: number; away: number };
  fouls: { home: number; away: number };
  offsides: { home: number; away: number };
  cornerKicks: { home: number; away: number };
}

/** MVP情報 */
export interface MvpInfo {
  pieceId: string;
  position: Position;
  cost: Cost;
  team: Team;
  goals: number;
  assists: number;
  tackles: number;
}

/** リプレイ1ターン分のスナップショット（ReplayScreenが再生する単位） */
export interface TurnSnapshot {
  turn: number;
  pieces: PieceData[];
  events: GameEvent[];
  scoreHome: number;
  scoreAway: number;
}

/** 試合終了データ（Battle→Result引継ぎ） */
export interface MatchEndData {
  scoreHome: number;
  scoreAway: number;
  myTeam: Team;
  reason: 'completed' | 'disconnect';
  stats: MatchStats;
  mvp: MvpInfo | null;
  /** リプレイ用の全ターン記録（COM対戦でクライアント録画。無い場合あり） */
  replayTurns?: TurnSnapshot[];
}

/** マッチメイキングWebSocketメッセージ型 */
export type MatchmakingWsMessage =
  | { type: 'MATCHMAKING_CONNECTED'; region: string }
  | { type: 'QUEUE_JOINED'; position: number }
  | { type: 'MATCH_FOUND'; matchId: string; opponent: string; team?: Team }
  | { type: 'COM_SUGGESTED'; message: string; waitTimeSeconds: number }
  | { type: 'PONG' }
  | { type: 'ERROR'; message: string };

const PRODUCTION_WORKER_ORIGIN = 'https://football-chess-maniacs.yanagiho.workers.dev';
const PRODUCTION_PAGES_HOST = 'football-chess-maniacs.pages.dev';

function getViteEnv(): Record<string, string | undefined> {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isPagesHost(hostname: string): boolean {
  return hostname === PRODUCTION_PAGES_HOST || hostname.endsWith(`.${PRODUCTION_PAGES_HOST}`);
}

/** REST API接続先ベースURL取得（dev: wrangler dev、Pages: Worker、Worker配信: 同一オリジン） */
export function getApiBaseUrl(): string {
  const configured = getViteEnv().VITE_API_BASE;
  if (configured) return trimTrailingSlash(configured);
  if (typeof window === 'undefined') return '';
  if (window.location.port === '5173') return 'http://localhost:8787';
  return isPagesHost(window.location.hostname) ? PRODUCTION_WORKER_ORIGIN : '';
}

/** REST API URLを生成する。pathは /api/... または /match/... を渡す。 */
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

/** WebSocket接続先ベースURL取得（dev: wrangler dev、Pages: Worker、Worker配信: 同一オリジン） */
export function getWsBaseUrl(): string {
  const configured = getViteEnv().VITE_WS_BASE;
  if (configured) return trimTrailingSlash(configured);
  if (typeof window === 'undefined') return 'ws://localhost:8787';
  if (location.port === '5173') return 'ws://localhost:8787';
  if (isPagesHost(location.hostname)) return 'wss://football-chess-maniacs.yanagiho.workers.dev';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}`;
}
