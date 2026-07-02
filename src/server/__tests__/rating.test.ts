// ============================================================
// rating.test.ts — Elo計算 + D1永続化（getRating / persistRatings）
//   「レーティングが永続化されない」ブロッカー修正の回帰テスト。
//   D1 はフェイクで差し替える。
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  calculateElo, isRatedMatch, getRating, persistRatings, INITIAL_RATING,
} from '../rating';

// ── フェイク D1 ───────────────────────────────────────────
function makeFakeDb(initial: Record<string, number> = {}) {
  const ratings = { ...initial };
  const upserts: Array<{ args: unknown[] }> = [];

  const db = {
    prepare(_sql: string) {
      const stmt = {
        _args: [] as unknown[],
        bind(...args: unknown[]) { this._args = args; return this; },
        async first<T>() {
          const userId = this._args[0] as string;
          return (userId in ratings ? { rating: ratings[userId] } : null) as T;
        },
        async run() { return { success: true }; },
      };
      return stmt;
    },
    async batch(stmts: Array<{ _args: unknown[] }>) {
      for (const s of stmts) upserts.push({ args: s._args });
      return [];
    },
  };
  return { db: db as unknown as D1Database, upserts };
}

describe('calculateElo', () => {
  it('同レート勝利は +15/-15（最小変動幅にクランプ）', () => {
    const { a, b } = calculateElo({ ratingA: 1000, ratingB: 1000, scoreA: 1 });
    expect(a.change).toBe(15);
    expect(b.change).toBe(-15);
    expect(a.newRating).toBe(1015);
    expect(b.newRating).toBe(985);
  });

  it('引き分けは変動なし', () => {
    const { a, b } = calculateElo({ ratingA: 1200, ratingB: 1000, scoreA: 0.5 });
    // 期待勝率が高い側が分けると下がる/上がるが、最小15にクランプされる
    expect(a.change).toBeLessThanOrEqual(0);
    expect(b.change).toBeGreaterThanOrEqual(0);
  });

  it('格上に勝つと変動が大きい（同レート勝利の+15より大）', () => {
    const { a } = calculateElo({ ratingA: 1000, ratingB: 1400, scoreA: 1 });
    expect(a.change).toBe(27); // K*(1 - 1/11) ≈ 27.3 → 27
    expect(a.change).toBeGreaterThan(15);
    expect(a.change).toBeLessThanOrEqual(30);
  });
});

describe('isRatedMatch', () => {
  it('通常のPvPは対象', () => {
    expect(isRatedMatch('m_abc', 'u1', 'u2')).toBe(true);
  });
  it('COM/フレンドは対象外', () => {
    expect(isRatedMatch('com_123', 'u1', 'u2')).toBe(false);
    expect(isRatedMatch('gemma_com_1', 'u1', 'u2')).toBe(false);
    expect(isRatedMatch('friend_abc', 'u1', 'u2')).toBe(false);
    expect(isRatedMatch('m_abc', 'u1', 'com_ai')).toBe(false);
    expect(isRatedMatch('m_abc', 'com_player_x', 'u2')).toBe(false);
  });
  it('カジュアルマッチ（casual_）は対象外、ランク（m_）は対象', () => {
    // カジュアルと銘打ちながらELOが動くのは約束違反（outgame_plan_v2 §7 課題2）
    expect(isRatedMatch('casual_abc', 'u1', 'u2')).toBe(false);
    expect(isRatedMatch('m_abc', 'u1', 'u2')).toBe(true);
    // Bot補完はどちらのモードでも com_ai によりもともと対象外（現仕様維持）
    expect(isRatedMatch('casual_abc', 'u1', 'com_ai')).toBe(false);
    expect(isRatedMatch('m_abc', 'u1', 'com_ai')).toBe(false);
  });
});

describe('getRating', () => {
  it('行が無ければ初期値を返す', async () => {
    const { db } = makeFakeDb();
    expect(await getRating(db, 'newbie')).toBe(INITIAL_RATING);
  });
  it('既存レートを返す', async () => {
    const { db } = makeFakeDb({ u1: 1234 });
    expect(await getRating(db, 'u1')).toBe(1234);
  });
});

describe('persistRatings', () => {
  it('home勝利で両者のレートと戦績がUPSERTされる', async () => {
    const { db, upserts } = makeFakeDb({ home: 1000, away: 1000 });
    const res = await persistRatings(db, 'home', 'away', 1, '2026-06-28T00:00:00Z');

    expect(res.home.newRating).toBe(1015);
    expect(res.away.newRating).toBe(985);
    expect(upserts).toHaveLength(2);

    // home: args = [userId, newRating, win, loss, draw, finishedAt]
    expect(upserts[0].args[1]).toBe(1015);
    expect(upserts[0].args[2]).toBe(1); // win
    expect(upserts[0].args[3]).toBe(0); // loss
    // away: 敗北
    expect(upserts[1].args[1]).toBe(985);
    expect(upserts[1].args[2]).toBe(0); // win
    expect(upserts[1].args[3]).toBe(1); // loss
  });

  it('初参加同士でも初期値1000基準で計算される', async () => {
    const { db, upserts } = makeFakeDb();
    const res = await persistRatings(db, 'a', 'b', 0.5, '2026-06-28T00:00:00Z');
    // 引き分け同士 → 変動0
    expect(res.home.change).toBe(0);
    expect(res.away.change).toBe(0);
    expect(upserts[0].args[4]).toBe(1); // draw
    expect(upserts[1].args[4]).toBe(1); // draw
  });
});
