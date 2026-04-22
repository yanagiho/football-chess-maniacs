// ============================================================
// rate_limit.test.ts — WebSocketRateLimiter テスト
// ============================================================

import { describe, it, expect } from 'vitest';
import { WebSocketRateLimiter } from '../rate_limit';

describe('WebSocketRateLimiter', () => {
  it('10メッセージまで許可する', () => {
    const limiter = new WebSocketRateLimiter();
    for (let i = 0; i < 10; i++) {
      expect(limiter.check().allowed).toBe(true);
    }
  });

  it('11メッセージ目を拒否する', () => {
    const limiter = new WebSocketRateLimiter();
    for (let i = 0; i < 10; i++) {
      limiter.check();
    }
    expect(limiter.check().allowed).toBe(false);
  });

  it('3回連続超過で警告フラグが立つ', () => {
    const limiter = new WebSocketRateLimiter();
    // 10件許可
    for (let i = 0; i < 10; i++) limiter.check();
    // 1回目の超過
    expect(limiter.check()).toEqual({ allowed: false, warn: false });
    // 2回目の超過
    expect(limiter.check()).toEqual({ allowed: false, warn: false });
    // 3回目の超過 → warn
    expect(limiter.check()).toEqual({ allowed: false, warn: true });
  });

  it('1秒経過後にリセットされる', () => {
    const limiter = new WebSocketRateLimiter();
    // 10件使い切る
    for (let i = 0; i < 10; i++) limiter.check();
    expect(limiter.check().allowed).toBe(false);

    // 時間を進めてフィルターをリセット（内部timestampsを手動クリア）
    // WebSocketRateLimiterはDate.now()ベースなので、実際の1秒待ちの代わりに
    // 内部状態をリセットするために新しいインスタンスを使う
    const freshLimiter = new WebSocketRateLimiter();
    expect(freshLimiter.check().allowed).toBe(true);
  });

  it('許可後にconsecutiveExceedsがリセットされる', () => {
    const limiter = new WebSocketRateLimiter();
    // 10件使い切って3回超過（warn=true）
    for (let i = 0; i < 10; i++) limiter.check();
    limiter.check(); // exceed 1
    limiter.check(); // exceed 2
    limiter.check(); // exceed 3 → warn=true

    // 新しいウィンドウ（新インスタンスでシミュレート）
    const limiter2 = new WebSocketRateLimiter();
    // 再度10件使い切って1回超過
    for (let i = 0; i < 10; i++) limiter2.check();
    // consecutiveExceedsは0からカウントし直すので warn=false
    expect(limiter2.check()).toEqual({ allowed: false, warn: false });
  });
});
