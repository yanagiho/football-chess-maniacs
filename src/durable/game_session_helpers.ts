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
  /**
   * 受理済みのターン入力（player_id → 入力）。
   * インメモリではなく GameState に持たせて永続化することで、
   * 相手の入力を待つ間に DO がハイバネート/退避しても手が消えない。
   */
  turnInputs: Record<string, TurnInput>;
  /**
   * 各チームの編成テンプレート（D1 teams.field_pieces 由来）。
   * 初期配置・得点後リスタート・ハーフタイムの盤面再生成に使う。
   * null の場合は固定4-4-2にフォールバックする。
   */
  homeField?: FormationFieldPiece[] | null;
  awayField?: FormationFieldPiece[] | null;
  homeBench?: BenchFieldPiece[] | null;
  awayBench?: BenchFieldPiece[] | null;
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

/** Board.pieces(+bench) → PieceInfo[] に変換（バリデーション用）。ベンチは交代検証に必要 */
export function boardToPieceInfos(board: Board): PieceInfo[] {
  const fieldInfos = board.pieces.map(p => ({
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
  const benchInfos = (board.bench ?? []).map(p => ({
    id: p.id,
    team: p.team,
    position: p.position,
    cost: p.cost,
    coord: p.coord,
    hasBall: false,
    moveRange: 0,
    isBench: true,
  }));
  return [...fieldInfos, ...benchInfos];
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
    benchPieceId: raw.bench_piece,
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

/**
 * チーム編成1枚分（D1 teams.field_pieces 由来）。
 * 座標は home 視点（row が小さいほど自陣）。away はミラー(33-row)して配置する。
 */
export interface FormationFieldPiece {
  position: Position;
  cost: Cost;
  col: number;
  row: number;
}

/** 固定4-4-2フォーメーション（編成未指定時のフォールバック） */
const DEFAULT_FIELD: FormationFieldPiece[] = INITIAL_FORMATION.map(f => ({
  position: f.pos, cost: f.cost, col: f.col, row: f.row,
}));

/** field_pieces が盤面構築に使える形か（11枚・座標が盤内）を検証 */
export function isValidField(field: unknown): field is FormationFieldPiece[] {
  return (
    Array.isArray(field) &&
    field.length === 11 &&
    field.every(f =>
      f && typeof f === 'object' &&
      typeof (f as FormationFieldPiece).position === 'string' &&
      typeof (f as FormationFieldPiece).cost === 'number' &&
      typeof (f as FormationFieldPiece).col === 'number' &&
      typeof (f as FormationFieldPiece).row === 'number' &&
      (f as FormationFieldPiece).col >= 0 && (f as FormationFieldPiece).col <= 21 &&
      (f as FormationFieldPiece).row >= 0 && (f as FormationFieldPiece).row <= 33,
    )
  );
}

/** ベンチコマ1枚分（D1 teams.bench_pieces 由来）。座標は交代時に上書きされる。 */
export interface BenchFieldPiece {
  position: Position;
  cost: Cost;
}

/** bench_pieces が使える形か（配列で各要素に position/cost）を検証 */
export function isValidBench(bench: unknown): bench is BenchFieldPiece[] {
  return (
    Array.isArray(bench) &&
    bench.every(b =>
      b && typeof b === 'object' &&
      typeof (b as BenchFieldPiece).position === 'string' &&
      typeof (b as BenchFieldPiece).cost === 'number',
    )
  );
}

/** 1チーム分のコマを生成（away は row をミラー）。ID接頭辞 h/a はエンジンのチーム判定に必須 */
function placeTeam(field: FormationFieldPiece[], team: Team): Piece[] {
  const prefix = team === 'home' ? 'h' : 'a';
  return field.map((f, i) => ({
    id: `${prefix}${String(i + 1).padStart(2, '0')}`,
    team,
    position: f.position,
    cost: f.cost,
    coord: { col: f.col, row: team === 'home' ? f.row : 33 - f.row },
    hasBall: false,
  }));
}

/** ベンチコマを生成。ID は盤面(01-11)と衝突しない 12 番以降。座標は交代時に上書きされる。 */
function placeBench(bench: BenchFieldPiece[], team: Team): Piece[] {
  const prefix = team === 'home' ? 'h' : 'a';
  return bench.map((b, i) => ({
    id: `${prefix}${String(12 + i).padStart(2, '0')}`,
    team,
    position: b.position,
    cost: b.cost,
    coord: { col: 0, row: 0 },
    hasBall: false,
  }));
}

/**
 * 両チームの編成から初期盤面を生成し、キックオフ側のFWにボールを付与する。
 * 不正/未指定の編成は固定4-4-2にフォールバック。ベンチは交代の投入元。
 */
export function createBoardFromFormation(
  homeField: unknown,
  awayField: unknown,
  kickoffTeam: Team,
  homeBench?: unknown,
  awayBench?: unknown,
): Board {
  const home = isValidField(homeField) ? homeField : DEFAULT_FIELD;
  const away = isValidField(awayField) ? awayField : DEFAULT_FIELD;
  const pieces: Piece[] = [...placeTeam(home, 'home'), ...placeTeam(away, 'away')];
  const bench: Piece[] = [
    ...placeBench(isValidBench(homeBench) ? homeBench : [], 'home'),
    ...placeBench(isValidBench(awayBench) ? awayBench : [], 'away'),
  ];
  const fw = pieces.find(p => p.team === kickoffTeam && p.position === 'FW')
    ?? pieces.find(p => p.team === kickoffTeam);
  if (fw) fw.hasBall = true;
  return { pieces, snapshot: [], bench };
}

/** 固定4-4-2の初期盤面を生成（編成なしのフォールバック経路）。 */
export function createInitialBoard(kickoffTeam: Team): Board {
  return createBoardFromFormation(null, null, kickoffTeam);
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
