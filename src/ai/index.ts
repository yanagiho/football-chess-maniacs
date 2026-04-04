// ============================================================
// index.ts — AI モジュール エクスポート
// ============================================================

// 局面評価（§4）
export { evaluateBoard, recommendStrategy } from './evaluator';
export type { EvaluationResult, Strategy } from './evaluator';

// 合法手生成（§5）
export { generateAllLegalMoves, toLegalMovesJson } from './legal_moves';
export type { PieceLegalMoves, LegalAction, LegalMovesContext, ShootZone } from './legal_moves';

// ルールベースAI（フォールバック / ブートストラップ）
export { generateRuleBasedOrders, validateAndFillGemmaOutput } from './rule_based';
export type { RuleBasedInput, RuleBasedOutput, GemmaOrder } from './rule_based';

// プロンプト生成（§2）
export { buildPrompt } from './prompt_builder';
export type { Difficulty, Era, PromptContext, TurnHistoryEntry } from './prompt_builder';

// Gemmaクライアント（§9-1）
export { callGemma } from './gemma_client';
export type { AiBinding, GemmaClientConfig, GemmaResult, GemmaError } from './gemma_client';

// 出力パーサー（§9-3）
export { parseGemmaOutput } from './output_parser';
export type { ParseResult, ParseStats, RawGemmaOrder } from './output_parser';

// フォールバック（§9-4）
export { decideFallbackFromError, decideFallbackFromParse, applyFallback, buildErrorLog } from './fallback';
export type { FallbackReason, FallbackDecision, FallbackResult, AiErrorLog } from './fallback';

// 統合COM AI（§1-1）
export { ComAi, createComAi } from './com_ai';
export type { ComAiConfig, ComAiTurnInput, ComAiTurnResult } from './com_ai';
