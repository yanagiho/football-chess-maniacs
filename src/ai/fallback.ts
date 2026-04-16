// ============================================================
// fallback.ts — フォールバック制御（§9-4）
//
// §9-4 障害パターン:
//   - Workers AI応答遅延（500ms超過）→ ルールベース全11枚
//   - JSONパースエラー               → 同上
//   - 合法手外の指示が過半数          → 全指示ルールベース置換+エラーログ
//   - Workers AI完全障害             → ルールベースのみで全試合処理
// ============================================================

import type { Order } from '../engine/types';
import type { PieceLegalMoves } from './legal_moves';
import type { ParseResult } from './output_parser';
import type { GemmaError } from './gemma_client';

// ================================================================
// 型定義
// ================================================================

export type FallbackReason =
  | 'timeout'
  | 'api_error'
  | 'empty_response'
  | 'json_parse_error'
  | 'majority_illegal'
  | 'partial_fill';

export interface FallbackDecision {
  /** フォールバックが必要か */
  needsFallback: boolean;
  /** 全面フォールバック（ルールベースで全11枚置換）か */
  fullFallback: boolean;
  /** 理由（needsFallback=true 時は必ず非null） */
  reason: FallbackReason | null;
}

/** needsFallback=true のときの FallbackDecision（reason が非null保証） */
export interface FallbackDecisionWithReason extends FallbackDecision {
  needsFallback: true;
  reason: FallbackReason;
}

export interface FallbackResult {
  /** 最終的な指示（Gemma有効分＋ルールベース補完分） */
  orders: Order[];
  /** フォールバックの詳細 */
  decision: FallbackDecision;
  /** Gemma由来の指示数 */
  gemmaOrderCount: number;
  /** ルールベース補完の指示数 */
  ruleBasedFillCount: number;
}

// ================================================================
// フォールバック判定
// ================================================================

/**
 * §9-4 Gemmaエラーからフォールバック判定（常に全面フォールバック）
 */
export function decideFallbackFromError(error: GemmaError): FallbackDecisionWithReason {
  switch (error.type) {
    case 'timeout':
      return { needsFallback: true, fullFallback: true, reason: 'timeout' };
    case 'empty_response':
      return { needsFallback: true, fullFallback: true, reason: 'empty_response' };
    case 'api_error':
      return { needsFallback: true, fullFallback: true, reason: 'api_error' };
  }
}

/**
 * §9-4 パース結果からフォールバック判定
 */
export function decideFallbackFromParse(parseResult: ParseResult, totalPieces: number): FallbackDecision {
  // JSONパースエラー
  if (parseResult.stats.totalRawOrders === 0 && parseResult.stats.rejectionReasons.has('json_parse_error')) {
    return { needsFallback: true, fullFallback: true, reason: 'json_parse_error' };
  }

  // §9-4: 合法手外の指示が過半数 → 全指示ルールベースで置換
  if (parseResult.stats.totalRawOrders > 0) {
    const illegalRate = parseResult.stats.invalidCount / parseResult.stats.totalRawOrders;
    if (illegalRate > 0.5) {
      return { needsFallback: true, fullFallback: true, reason: 'majority_illegal' };
    }
  }

  // 有効order 0件（空のorders配列など）→ 全面フォールバック
  if (parseResult.stats.validCount === 0 && totalPieces > 0) {
    return { needsFallback: true, fullFallback: true, reason: 'majority_illegal' };
  }

  // 一部コマの指示が欠けている → 部分フォールバック
  if (parseResult.invalidPieceIds.length > 0) {
    return { needsFallback: true, fullFallback: false, reason: 'partial_fill' };
  }

  // フォールバック不要
  return { needsFallback: false, fullFallback: false, reason: null };
}

// ================================================================
// フォールバック適用
// ================================================================

/**
 * Gemmaの有効な指示にルールベースの指示を補完してマージする。
 *
 * @param gemmaOrders      Gemma由来の検証済みorder
 * @param ruleBasedOrders  ルールベースAIが生成した全11枚のorder
 * @param decision         フォールバック判定結果
 */
export function applyFallback(
  gemmaOrders: Order[],
  ruleBasedOrders: Order[],
  decision: FallbackDecision,
): FallbackResult {
  // 全面フォールバック
  if (decision.fullFallback) {
    return {
      orders: ruleBasedOrders,
      decision,
      gemmaOrderCount: 0,
      ruleBasedFillCount: ruleBasedOrders.length,
    };
  }

  // 部分フォールバック: Gemma有効分を残し、欠けたコマをルールベースで補完
  const gemmaIdSet = new Set(gemmaOrders.map((o) => o.pieceId));
  const filled: Order[] = [...gemmaOrders];

  let fillCount = 0;
  for (const rbOrder of ruleBasedOrders) {
    if (!gemmaIdSet.has(rbOrder.pieceId)) {
      filled.push(rbOrder);
      fillCount++;
    }
  }

  return {
    orders: filled,
    decision,
    gemmaOrderCount: gemmaOrders.length,
    ruleBasedFillCount: fillCount,
  };
}

// ================================================================
// エラーログ構造（R2永続化用）
// ================================================================

export interface AiErrorLog {
  timestamp: string;
  matchId: string;
  turn: number;
  reason: FallbackReason;
  gemmaLatencyMs?: number;
  gemmaRawOutput?: string;
  parseStats?: ParseResult['stats'];
}

/**
 * エラーログを構築（R2への記録用）
 */
export function buildErrorLog(
  matchId: string,
  turn: number,
  reason: FallbackReason,
  details: {
    gemmaLatencyMs?: number;
    gemmaRawOutput?: string;
    parseStats?: ParseResult['stats'];
  },
): AiErrorLog {
  return {
    timestamp: new Date().toISOString(),
    matchId,
    turn,
    reason,
    ...details,
  };
}
