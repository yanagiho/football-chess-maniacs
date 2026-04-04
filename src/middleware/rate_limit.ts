// ============================================================
// rate_limit.ts — レート制限ミドルウェア（§7-4）
// KVベースのスライディングウィンドウ
// ============================================================

import type { Context, Next } from 'hono';
import type { Env } from '../worker';

interface RateLimitConfig {
  /** ウィンドウ秒数 */
  windowSeconds: number;
  /** ウィンドウ内の最大リクエスト数 */
  maxRequests: number;
  /** KVキーのプレフィックス */
  prefix: string;
}

/** §7-4 レート制限設定 */
export const RATE_LIMITS = {
  /** REST API全体: 60req/分 */
  restApi: { windowSeconds: 60, maxRequests: 60, prefix: 'rl:api' } satisfies RateLimitConfig,
  /** マッチングリクエスト: 5req/分 */
  matching: { windowSeconds: 60, maxRequests: 5, prefix: 'rl:match' } satisfies RateLimitConfig,
  /** ショップAPI: 10req/分 */
  shop: { windowSeconds: 60, maxRequests: 10, prefix: 'rl:shop' } satisfies RateLimitConfig,
} as const;

/**
 * KVベースのレート制限ミドルウェアを生成
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  return async (c: Context<{ Bindings: Env['Bindings']; Variables: { userId: string } }>, next: Next) => {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const kv = c.env.KV;
    const key = `${config.prefix}:${userId}`;

    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.windowSeconds;

    // KVから現在のカウンタを取得
    const stored = await kv.get(key, 'json') as { count: number; windowStart: number } | null;

    if (stored && stored.windowStart > windowStart) {
      // 同一ウィンドウ内
      if (stored.count >= config.maxRequests) {
        return c.json(
          { error: 'Too many requests', retryAfter: stored.windowStart + config.windowSeconds - now },
          429,
        );
      }
      // カウンタインクリメント
      await kv.put(key, JSON.stringify({ count: stored.count + 1, windowStart: stored.windowStart }), {
        expirationTtl: config.windowSeconds * 2,
      });
    } else {
      // 新しいウィンドウ開始
      await kv.put(key, JSON.stringify({ count: 1, windowStart: now }), {
        expirationTtl: config.windowSeconds * 2,
      });
    }

    await next();
  };
}

/**
 * WebSocketメッセージのレート制限（§7-4）
 * 1接続あたり10msg/秒。DO内部で使用。
 */
export class WebSocketRateLimiter {
  private timestamps: number[] = [];
  private consecutiveExceeds = 0;
  private readonly maxPerSecond = 10;

  /** メッセージを許可するか判定。false = 破棄 */
  check(): { allowed: boolean; warn: boolean } {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // 1秒以上前のタイムスタンプを除去
    this.timestamps = this.timestamps.filter((t) => t > oneSecondAgo);

    if (this.timestamps.length >= this.maxPerSecond) {
      this.consecutiveExceeds++;
      return { allowed: false, warn: this.consecutiveExceeds >= 3 };
    }

    this.timestamps.push(now);
    this.consecutiveExceeds = 0;
    return { allowed: true, warn: false };
  }
}
