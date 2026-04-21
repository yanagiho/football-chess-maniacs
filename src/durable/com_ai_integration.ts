// ============================================================
// com_ai_integration.ts — COM AI命令生成（Gemma + ルールベースフォールバック）
// ============================================================

import type { Order, Piece } from '../engine/types';
import type { Env } from '../worker';
import { ComAi } from '../ai/com_ai';
import { generateRuleBasedOrders } from '../ai/rule_based';
import { wrapAiBinding } from '../ai/gemma_client';
import type { GameState } from './game_session_helpers';

/** COM AI全体のタイムアウト（Workers AIがハングした場合のガード） */
const COM_AI_TIMEOUT_MS = 5000;

/**
 * COM対戦用のAI命令を生成する。
 * Gemma AIを試行し、失敗時はルールベースAIにフォールバック。
 */
export async function generateComOrders(
  state: GameState,
  env: Env['Bindings'],
): Promise<Order[]> {
  if (!state.board) return [];

  const pieces = state.board.pieces;
  const difficulty = state.comDifficulty ?? 'regular';
  const era = state.comEra ?? '現代';

  const rbInput = {
    pieces,
    myTeam: 'away' as const,
    scoreHome: state.scoreHome,
    scoreAway: state.scoreAway,
    turn: state.turn,
    maxTurn: state.totalTurns,
    remainingSubs: state.remainingSubs[state.awayUserId] ?? 3,
    benchPieces: [] as Piece[],
    maxFieldCost: 16,
  };

  // Gemma AIを試行（外側タイムアウト付き）
  try {
    const aiPromise = (async () => {
      const ai = new ComAi({
        ai: wrapAiBinding(env.AI),
        modelId: env.AI_MODEL_ID,
        timeoutMs: 2000,
      });

      return ai.generateOrders({
        ...rbInput,
        difficulty,
        era,
        matchId: state.matchId,
      });
    })();

    // 外側タイムアウト: ComAi内部の2秒 + マージン
    const result = await Promise.race([
      aiPromise,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), COM_AI_TIMEOUT_MS),
      ),
    ]);

    if (!result) {
      console.warn(`[GameSession] COM AI outer timeout (${COM_AI_TIMEOUT_MS}ms), falling back to rule-based`);
      return generateRuleBasedOrders(rbInput).orders;
    }

    // エラーログをR2に保存
    if (result.errorLog) {
      try {
        const logKey = `ai-errors/${state.matchId}/${state.turn}.json`;
        await env.R2.put(logKey, JSON.stringify(result.errorLog));
      } catch {
        // R2保存失敗は無視
      }
    }

    console.log(
      `[GameSession] COM AI turn ${state.turn}: usedGemma=${result.usedGemma}, ` +
      `latency=${result.gemmaLatencyMs}ms, fallback=${result.fallbackReason}, ` +
      `gemmaOrders=${result.gemmaOrderCount}, rbFill=${result.ruleBasedFillCount}`,
    );

    return result.orders;
  } catch (e) {
    console.error(`[GameSession] COM AI error, falling back to rule-based:`, e);
    return generateRuleBasedOrders(rbInput).orders;
  }
}
