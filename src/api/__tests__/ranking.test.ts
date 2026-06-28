// ============================================================
// ranking.test.ts — ランキング整形ヘルパー（rankName / buildRankEntries）
// ============================================================

import { describe, it, expect } from 'vitest';
import { rankName, buildRankEntries, type RatingRow } from '../ranking';

describe('rankName', () => {
  it('display_name があればそれを使う', () => {
    expect(rankName({ user_id: 'u123456789', rating: 1000, wins: 0, losses: 0, draws: 0, display_name: 'TacticMaster' }))
      .toBe('TacticMaster');
  });
  it('display_name が無ければ userId 先頭6文字の匿名表記', () => {
    expect(rankName({ user_id: 'abcdef123456', rating: 1000, wins: 0, losses: 0, draws: 0 }))
      .toBe('Player abcdef');
  });
  it('display_name が空白のみなら匿名表記にフォールバック', () => {
    expect(rankName({ user_id: 'xyz000', rating: 1000, wins: 0, losses: 0, draws: 0, display_name: '   ' }))
      .toBe('Player xyz000');
  });
});

describe('buildRankEntries', () => {
  const rows: RatingRow[] = [
    { user_id: 'a', rating: 1200, wins: 5, losses: 1, draws: 0, display_name: 'Alpha' },
    { user_id: 'b', rating: 1100, wins: 3, losses: 2, draws: 1 },
  ];

  it('1始まりで順位を採番し RankEntry へ整形', () => {
    const out = buildRankEntries(rows);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ rank: 1, name: 'Alpha', elo: 1200, wins: 5, losses: 1 });
    expect(out[1]).toMatchObject({ rank: 2, name: 'Player b', elo: 1100 });
  });

  it('baseRank を指定すると自分の順位採番に使える', () => {
    const out = buildRankEntries([rows[1]], 42);
    expect(out[0].rank).toBe(42);
  });

  it('空配列なら空', () => {
    expect(buildRankEntries([])).toEqual([]);
  });
});
