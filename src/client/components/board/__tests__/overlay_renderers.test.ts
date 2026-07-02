// ============================================================
// overlay_renderers.test.ts — D1: ボール軌跡の飛行進捗連動
// trailProgress / hasFlyingTrail（純粋関数）の検証
// ============================================================

import { describe, it, expect } from 'vitest';
import { trailProgress, hasFlyingTrail } from '../overlay_renderers';
import type { BallTrail } from '../Overlay';

const FROM = { col: 5, row: 10 };
const TO = { col: 10, row: 20 };

function trail(overrides: Partial<BallTrail> = {}): BallTrail {
  return { from: FROM, to: TO, type: 'pass', result: 'success', ...overrides };
}

describe('trailProgress', () => {
  it('flight情報がない静的軌跡は常に1（完成線を即描画）', () => {
    expect(trailProgress(trail(), 0)).toBe(1);
    expect(trailProgress(trail({ type: 'dribble' }), 123456)).toBe(1);
  });

  it('飛行中は経過時間の比率を返す', () => {
    const t = trail({ flight: { startedAt: 1000, durationMs: 400 } });
    expect(trailProgress(t, 1000)).toBe(0);
    expect(trailProgress(t, 1100)).toBeCloseTo(0.25);
    expect(trailProgress(t, 1200)).toBeCloseTo(0.5);
    expect(trailProgress(t, 1400)).toBe(1);
  });

  it('0〜1にクランプされる（開始前=0 / 完了後=1）', () => {
    const t = trail({ flight: { startedAt: 1000, durationMs: 400 } });
    expect(trailProgress(t, 500)).toBe(0);
    expect(trailProgress(t, 99999)).toBe(1);
  });

  it('durationMsが0以下なら1（ゼロ除算防止）', () => {
    expect(trailProgress(trail({ flight: { startedAt: 1000, durationMs: 0 } }), 1000)).toBe(1);
    expect(trailProgress(trail({ flight: { startedAt: 1000, durationMs: -5 } }), 1000)).toBe(1);
  });
});

describe('hasFlyingTrail', () => {
  it('飛行中（進捗<1）の軌跡が1本でもあればtrue', () => {
    const trails = [
      trail(), // 静的
      trail({ type: 'shoot', flight: { startedAt: 1000, durationMs: 400 } }),
    ];
    expect(hasFlyingTrail(trails, 1200)).toBe(true);
  });

  it('全軌跡が完成していればfalse（rAFループ停止＝静的描画に戻る）', () => {
    const trails = [
      trail(),
      trail({ type: 'shoot', flight: { startedAt: 1000, durationMs: 400 } }),
    ];
    expect(hasFlyingTrail(trails, 1400)).toBe(false);
    expect(hasFlyingTrail([], 0)).toBe(false);
  });
});
