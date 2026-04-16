// ============================================================
// gemma_client.ts — Workers AI (Gemma) 呼び出し（§9-1）
// モデルIDは環境変数 AI_MODEL_ID から取得。
// タイムアウト制御付き。
// ============================================================

import type { PromptMessages } from './prompt_builder';

// ================================================================
// 型定義
// ================================================================

/** Workers AI バインディング（Cloudflare env.AI 互換） */
export interface AiBinding {
  run(model: string, input: { messages: Array<{ role: string; content: string }> }): Promise<AiResponse>;
}

/** Cloudflare env.AI → AiBinding ラッパー */
export function wrapAiBinding(ai: { run(model: string, inputs: unknown): Promise<unknown> }): AiBinding {
  return {
    run: (model, input) => ai.run(model, input) as Promise<AiResponse>,
  };
}

export interface AiResponse {
  response?: string;
}

export interface GemmaClientConfig {
  /** Workers AI バインディング */
  ai: AiBinding;
  /** モデルID（env.AI_MODEL_ID） e.g. "@cf/google/gemma-3-12b-it" */
  modelId: string;
  /** 推論タイムアウト (ms)。デフォルト 500ms（§9-4） */
  timeoutMs?: number;
}

export interface GemmaResult {
  /** 生のレスポンステキスト */
  raw: string;
  /** 推論にかかった時間 (ms) */
  latencyMs: number;
}

export type GemmaError =
  | { type: 'timeout'; latencyMs: number }
  | { type: 'empty_response' }
  | { type: 'api_error'; error: unknown };

// ================================================================
// Gemma呼び出し
// ================================================================

const DEFAULT_TIMEOUT_MS = 500;

/**
 * §9-1 Workers AI (Gemma) を呼び出す。
 *
 * タイムアウト or エラー時は Left（GemmaError）を返す。
 * 成功時は Right（GemmaResult）を返す。
 */
export async function callGemma(
  config: GemmaClientConfig,
  prompt: PromptMessages,
): Promise<{ ok: true; result: GemmaResult } | { ok: false; error: GemmaError }> {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();

  try {
    // §9-4: 500ms以内に応答がない場合フォールバック
    const result = await Promise.race([
      runInference(config, prompt),
      timeout(timeoutMs),
    ]);

    const latencyMs = Date.now() - start;

    if (result === TIMEOUT_SENTINEL) {
      return { ok: false, error: { type: 'timeout', latencyMs } };
    }

    const response = result as AiResponse;
    const raw = response.response ?? '';

    if (!raw.trim()) {
      return { ok: false, error: { type: 'empty_response' } };
    }

    return { ok: true, result: { raw, latencyMs } };
  } catch (error) {
    return { ok: false, error: { type: 'api_error', error } };
  }
}

// ── 内部ヘルパー ──

const TIMEOUT_SENTINEL = Symbol('timeout');

async function runInference(
  config: GemmaClientConfig,
  prompt: PromptMessages,
): Promise<AiResponse> {
  // §9-1: env.AI.run(MODEL_ID, { messages })
  return config.ai.run(config.modelId, {
    messages: prompt.messages,
  });
}

function timeout(ms: number): Promise<typeof TIMEOUT_SENTINEL> {
  return new Promise((resolve) => setTimeout(() => resolve(TIMEOUT_SENTINEL), ms));
}
