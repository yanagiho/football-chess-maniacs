// ============================================================
// com_ai.ts — 統合COM AIクラス（§1-1 基本構造）
//
// [安全層] 合法手生成 + 盤面評価
//     ↓
// [判断層] Gemma推論 (Workers AI)
//     ↓
// [検証層] パース + 合法性チェック + フォールバック
//
// 500ms以内に全処理を完了。障害時はルールベースに自動切替。
// ============================================================

import type { Piece, Team, Order, GameEvent } from '../engine/types';
import { evaluateBoard, recommendStrategy, type EvaluationResult, type Strategy } from './evaluator';
import { generateAllLegalMoves, toLegalMovesJson, type PieceLegalMoves, type LegalMovesContext } from './legal_moves';
import { generateRuleBasedOrders, type RuleBasedInput } from './rule_based';
import { buildPrompt, type Difficulty, type Era, type TurnHistoryEntry } from './prompt_builder';
import { callGemma, type AiBinding } from './gemma_client';
import { parseGemmaOutput, type ParseStats } from './output_parser';
import {
  decideFallbackFromError,
  decideFallbackFromParse,
  applyFallback,
  buildErrorLog,
  type FallbackReason,
  type AiErrorLog,
} from './fallback';

// ================================================================
// 型定義
// ================================================================

export interface ComAiConfig {
  /** Workers AI バインディング */
  ai: AiBinding;
  /** モデルID（env.AI_MODEL_ID） */
  modelId: string;
  /** 推論タイムアウト (ms) デフォルト500 */
  timeoutMs?: number;
}

export interface ComAiTurnInput {
  pieces: Piece[];
  myTeam: Team;
  scoreHome: number;
  scoreAway: number;
  turn: number;
  maxTurn?: number;
  remainingSubs: number;
  benchPieces: Piece[];
  maxFieldCost?: number;
  difficulty: Difficulty;
  era: Era;
  /** 直近3ターンの履歴 */
  recentHistory?: TurnHistoryEntry[];
  /** 相手プレイヤーの傾向サマリ（マニアックのみ） */
  playerTendency?: string;
  /** 試合ID（エラーログ用） */
  matchId?: string;
}

export interface ComAiTurnResult {
  /** 最終的な全コマの指示 */
  orders: Order[];
  /** 局面評価 */
  evaluation: EvaluationResult;
  /** 推奨戦略 */
  strategy: Strategy;
  /** Gemmaが使われたか */
  usedGemma: boolean;
  /** Gemma推論レイテンシ (ms) */
  gemmaLatencyMs: number | null;
  /** フォールバック理由（なければnull） */
  fallbackReason: FallbackReason | null;
  /** Gemma由来の指示数 */
  gemmaOrderCount: number;
  /** ルールベース補完の指示数 */
  ruleBasedFillCount: number;
  /** パース統計（Gemma使用時のみ） */
  parseStats: ParseStats | null;
  /** エラーログ（R2記録用。エラーがなければnull） */
  errorLog: AiErrorLog | null;
}

// ================================================================
// 統合COM AIクラス
// ================================================================

export class ComAi {
  private config: ComAiConfig;

  constructor(config: ComAiConfig) {
    this.config = config;
  }

  /**
   * §1-1 基本構造に従い、1ターン分のAI指示を生成する。
   *
   * 処理フロー:
   *  1. [安全層] 合法手生成 + 盤面評価 (目標50ms)
   *  2. [判断層] Gemma推論 (目標300ms, タイムアウト500ms)
   *  3. [検証層] パース + 検証 + フォールバック (目標10ms)
   */
  async generateOrders(input: ComAiTurnInput): Promise<ComAiTurnResult> {
    const {
      pieces, myTeam, scoreHome, scoreAway, turn,
      maxTurn = 36, remainingSubs, benchPieces,
      maxFieldCost = 16, difficulty, era,
      recentHistory, playerTendency, matchId = '',
    } = input;

    const goalDiff = myTeam === 'home' ? scoreHome - scoreAway : scoreAway - scoreHome;

    // ============================================================
    // Step 1: 安全層 — 合法手生成 + 盤面評価（§9-2: 目標50ms）
    // ============================================================

    const evaluation = evaluateBoard(pieces, myTeam, scoreHome, scoreAway, turn, maxTurn);
    const strategy = recommendStrategy(goalDiff, turn, maxTurn);

    const legalCtx: LegalMovesContext = {
      pieces, myTeam, remainingSubs, maxFieldCost, benchPieces,
    };
    const legalMoves = generateAllLegalMoves(legalCtx);

    // ルールベースの最善手を事前に計算（フォールバック用）
    const rbInput: RuleBasedInput = {
      pieces, myTeam, scoreHome, scoreAway, turn, maxTurn,
      remainingSubs, benchPieces, maxFieldCost,
    };
    const ruleBasedResult = generateRuleBasedOrders(rbInput);

    // ============================================================
    // Step 2: 判断層 — Gemma推論（§9-2: 目標300ms）
    // ============================================================

    const prompt = buildPrompt({
      difficulty, era, pieces, myTeam,
      scoreHome, scoreAway, turn, maxTurn,
      legalMoves, recentHistory, playerTendency,
    });

    const gemmaResult = await callGemma(
      {
        ai: this.config.ai,
        modelId: this.config.modelId,
        timeoutMs: this.config.timeoutMs,
      },
      prompt,
    );

    // ============================================================
    // Step 3: 検証層 — パース + 検証 + フォールバック（§9-2: 目標10ms）
    // ============================================================

    // Gemmaエラーの場合 → 全面フォールバック
    if (!gemmaResult.ok) {
      const decision = decideFallbackFromError(gemmaResult.error);
      const fallback = applyFallback([], ruleBasedResult.orders, decision);

      const errorLog = buildErrorLog(matchId, turn, decision.reason, {
        gemmaLatencyMs: gemmaResult.error.type === 'timeout' ? gemmaResult.error.latencyMs : undefined,
      });

      return {
        orders: fallback.orders,
        evaluation,
        strategy,
        usedGemma: false,
        gemmaLatencyMs: gemmaResult.error.type === 'timeout' ? gemmaResult.error.latencyMs : null,
        fallbackReason: decision.reason,
        gemmaOrderCount: 0,
        ruleBasedFillCount: fallback.ruleBasedFillCount,
        parseStats: null,
        errorLog,
      };
    }

    // Gemma成功 → パース + 検証
    const parseResult = parseGemmaOutput(gemmaResult.result.raw, legalMoves);
    const parseDecision = decideFallbackFromParse(parseResult, legalMoves.length);

    if (parseDecision.fullFallback && parseDecision.reason) {
      // §9-4: 全面フォールバック（パースエラー or 過半数不正）
      const fallback = applyFallback([], ruleBasedResult.orders, parseDecision);

      const errorLog = buildErrorLog(matchId, turn, parseDecision.reason, {
        gemmaLatencyMs: gemmaResult.result.latencyMs,
        gemmaRawOutput: gemmaResult.result.raw.slice(0, 500),
        parseStats: parseResult.stats,
      });

      return {
        orders: fallback.orders,
        evaluation,
        strategy,
        usedGemma: false,
        gemmaLatencyMs: gemmaResult.result.latencyMs,
        fallbackReason: parseDecision.reason,
        gemmaOrderCount: 0,
        ruleBasedFillCount: fallback.ruleBasedFillCount,
        parseStats: parseResult.stats,
        errorLog,
      };
    }

    // 部分フォールバック or フォールバック不要
    const fallback = applyFallback(parseResult.validOrders, ruleBasedResult.orders, parseDecision);

    const errorLog = (parseDecision.needsFallback && parseDecision.reason)
      ? buildErrorLog(matchId, turn, parseDecision.reason, {
          gemmaLatencyMs: gemmaResult.result.latencyMs,
          parseStats: parseResult.stats,
        })
      : null;

    return {
      orders: fallback.orders,
      evaluation,
      strategy,
      usedGemma: true,
      gemmaLatencyMs: gemmaResult.result.latencyMs,
      fallbackReason: parseDecision.reason,
      gemmaOrderCount: fallback.gemmaOrderCount,
      ruleBasedFillCount: fallback.ruleBasedFillCount,
      parseStats: parseResult.stats,
      errorLog,
    };
  }
}

// ================================================================
// ファクトリ（Workerエントリから使用）
// ================================================================

/**
 * 環境変数からComAiインスタンスを生成
 */
export function createComAi(env: { AI: AiBinding; AI_MODEL_ID: string }): ComAi {
  return new ComAi({
    ai: env.AI,
    modelId: env.AI_MODEL_ID,
  });
}
