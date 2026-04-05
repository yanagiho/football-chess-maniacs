// ============================================================
// data_extract.ts — 盤面→指示ペアの抽出（§3-1 Phase 1）
//
// MatchのTurnRecordからGemmaファインチューニング用の
// 学習データ（盤面状態 → 指示）を抽出する。
// 1レコードずつストリーミング書き込み対応。
// ============================================================

import type { Piece, Order, GameEvent, Team } from '../../engine/types';
import type { TurnRecord, MatchSummary } from './auto_play';

// ================================================================
// 学習データレコードの型
// ================================================================

export interface TrainingRecord {
  match_id: string;
  turn: number;
  team: Team;
  winner: 'home' | 'away' | 'draw';
  board_state: SerializedPiece[];
  score: { home: number; away: number };
  remaining_turns: number;
  orders: SerializedOrder[];
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
}

// ================================================================
// ストリーミング抽出（1ターン → 最大2レコード）
// ================================================================

/**
 * 1ターン分のTurnRecordから学習データレコードを抽出する。
 * メモリに全試合を蓄積せず、1ターンずつ処理するために使う。
 *
 * @param record       1ターンの記録
 * @param summary      試合サマリ（winner判定用）
 * @param filterWinner 勝者側のデータのみ抽出するか
 * @returns 0〜2件のTrainingRecord
 */
export function extractTurnRecords(
  record: TurnRecord,
  summary: MatchSummary,
  filterWinner: boolean = false,
): TrainingRecord[] {
  const results: TrainingRecord[] = [];

  if (!filterWinner || summary.winner === 'home' || summary.winner === 'draw') {
    const r = buildRecord(summary, record, 'home');
    if (r) results.push(r);
  }

  if (!filterWinner || summary.winner === 'away' || summary.winner === 'draw') {
    const r = buildRecord(summary, record, 'away');
    if (r) results.push(r);
  }

  return results;
}

function buildRecord(
  summary: MatchSummary,
  turn: TurnRecord,
  team: Team,
): TrainingRecord | null {
  const orders = team === 'home' ? turn.homeOrders : turn.awayOrders;
  if (orders.length === 0) return null;

  return {
    match_id: summary.matchId,
    turn: turn.turn,
    team,
    winner: summary.winner,
    board_state: serializePieces(turn.boardBefore),
    score: { home: turn.scoreHome, away: turn.scoreAway },
    remaining_turns: 90 - turn.turn,
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
// 統計ヘルパー
// ================================================================

export interface DatasetStats {
  totalMatches: number;
  totalRecords: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  avgGoalsPerMatch: number;
}

export function createStatsAccumulator() {
  let totalMatches = 0;
  let totalRecords = 0;
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let totalGoals = 0;

  return {
    addMatch(summary: MatchSummary, recordCount: number) {
      totalMatches++;
      totalRecords += recordCount;
      totalGoals += summary.scoreHome + summary.scoreAway;
      if (summary.winner === 'home') homeWins++;
      else if (summary.winner === 'away') awayWins++;
      else draws++;
    },
    getStats(): DatasetStats {
      return {
        totalMatches,
        totalRecords,
        homeWins,
        awayWins,
        draws,
        avgGoalsPerMatch: totalMatches > 0 ? totalGoals / totalMatches : 0,
      };
    },
  };
}
