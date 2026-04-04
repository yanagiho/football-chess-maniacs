// ============================================================
// data_extract.ts — 盤面→指示ペアの抽出（§3-1 Phase 1）
//
// MatchResult から Gemma ファインチューニング用の
// 学習データ（盤面状態 + 合法手 → 指示）を抽出する。
// JSONL形式で出力。
// ============================================================

import type { Piece, Order, GameEvent, Team } from '../../engine/types';
import type { MatchResult, TurnRecord } from './auto_play';
import { generateAllLegalMoves, toLegalMovesJson, type LegalMovesContext } from '../legal_moves';

// ================================================================
// 学習データレコードの型
// ================================================================

export interface TrainingRecord {
  /** 試合ID */
  match_id: string;
  /** ターン番号 */
  turn: number;
  /** 指示を出したチーム */
  team: Team;
  /** 試合の勝者 */
  winner: 'home' | 'away' | 'draw';
  /** 盤面状態（全コマ） */
  board_state: SerializedPiece[];
  /** スコア */
  score: { home: number; away: number };
  /** 残りターン */
  remaining_turns: number;
  /** このチームの合法手リスト */
  legal_moves: object[];
  /** このチームの指示（正解ラベル） */
  orders: SerializedOrder[];
  /** このターンのイベント（結果フィードバック用） */
  events: string[];
}

interface SerializedPiece {
  id: string;
  team: Team;
  position: string;
  cost: number;
  hex: [number, number];
  has_ball?: boolean;
}

interface SerializedOrder {
  piece_id: string;
  action: string;
  target_hex?: [number, number];
  target_piece?: string;
}

// ================================================================
// 抽出メイン
// ================================================================

/**
 * §3-1 Phase 1: 試合結果から学習データレコードを抽出する。
 *
 * 1試合90ターン × home/away 2チーム = 最大180レコード。
 * 勝者側のデータのみ抽出することも可能（filterWinner オプション）。
 *
 * @param match          試合結果
 * @param filterWinner   勝者側のデータのみ抽出するか（Phase 3用）
 */
export function extractTrainingData(
  match: MatchResult,
  filterWinner: boolean = false,
): TrainingRecord[] {
  const records: TrainingRecord[] = [];

  for (const turn of match.turnRecords) {
    // home 側
    if (!filterWinner || match.winner === 'home' || match.winner === 'draw') {
      const homeRecord = buildRecord(match, turn, 'home');
      if (homeRecord) records.push(homeRecord);
    }

    // away 側
    if (!filterWinner || match.winner === 'away' || match.winner === 'draw') {
      const awayRecord = buildRecord(match, turn, 'away');
      if (awayRecord) records.push(awayRecord);
    }
  }

  return records;
}

function buildRecord(
  match: MatchResult,
  turn: TurnRecord,
  team: Team,
): TrainingRecord | null {
  const orders = team === 'home' ? turn.homeOrders : turn.awayOrders;
  if (orders.length === 0) return null;

  // 合法手を再計算（学習データにはGemmaへの入力と同じフォーマットが必要）
  const legalCtx: LegalMovesContext = {
    pieces: turn.boardBefore,
    myTeam: team,
    remainingSubs: 3,
    maxFieldCost: 16,
    benchPieces: [],
  };
  const legalMoves = generateAllLegalMoves(legalCtx);

  return {
    match_id: match.matchId,
    turn: turn.turn,
    team,
    winner: match.winner,
    board_state: serializePieces(turn.boardBefore),
    score: { home: turn.scoreHome, away: turn.scoreAway },
    remaining_turns: 90 - turn.turn,
    legal_moves: toLegalMovesJson(legalMoves, 5),
    orders: serializeOrders(orders),
    events: turn.events.map((e) => e.type),
  };
}

// ================================================================
// シリアライズ
// ================================================================

function serializePieces(pieces: Piece[]): SerializedPiece[] {
  return pieces.map((p) => ({
    id: p.id,
    team: p.team,
    position: p.position,
    cost: p.cost,
    hex: [p.coord.col, p.coord.row] as [number, number],
    ...(p.hasBall ? { has_ball: true } : {}),
  }));
}

function serializeOrders(orders: Order[]): SerializedOrder[] {
  return orders.map((o) => ({
    piece_id: o.pieceId,
    action: o.type,
    ...(o.target ? { target_hex: [o.target.col, o.target.row] as [number, number] } : {}),
  }));
}

// ================================================================
// JSONL 出力ヘルパー
// ================================================================

/**
 * TrainingRecord 配列を JSONL 文字列に変換
 */
export function toJsonl(records: TrainingRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

/**
 * 複数試合の統計サマリを生成
 */
export interface DatasetStats {
  totalMatches: number;
  totalRecords: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  avgTurnsPerMatch: number;
  avgGoalsPerMatch: number;
}

export function calcDatasetStats(matches: MatchResult[]): DatasetStats {
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let totalGoals = 0;
  let totalTurns = 0;

  for (const m of matches) {
    if (m.winner === 'home') homeWins++;
    else if (m.winner === 'away') awayWins++;
    else draws++;
    totalGoals += m.scoreHome + m.scoreAway;
    totalTurns += m.totalTurns;
  }

  return {
    totalMatches: matches.length,
    totalRecords: matches.length * 90 * 2, // 概算
    homeWins,
    awayWins,
    draws,
    avgTurnsPerMatch: matches.length > 0 ? totalTurns / matches.length : 0,
    avgGoalsPerMatch: matches.length > 0 ? totalGoals / matches.length : 0,
  };
}
