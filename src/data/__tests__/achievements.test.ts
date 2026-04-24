// ============================================================
// achievements.test.ts — 実績バッジシステムテスト
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACHIEVEMENTS,
  getAchievementById,
  evaluateAndEarnAchievements,
  getEarnedAchievements,
  resetAchievements,
} from '../achievements';

// localStorage モック
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('ACHIEVEMENTS', () => {
  it('実績が定義されている', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThan(0);
  });

  it('IDが一意', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全実績にicon/name_ja/description_jaがある', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.icon.length).toBeGreaterThan(0);
      expect(a.name_ja.length).toBeGreaterThan(0);
      expect(a.description_ja.length).toBeGreaterThan(0);
    }
  });

  it('categoryがbattle/team/milestoneのいずれか', () => {
    for (const a of ACHIEVEMENTS) {
      expect(['battle', 'team', 'milestone']).toContain(a.category);
    }
  });
});

describe('getAchievementById', () => {
  it('存在するIDで取得できる', () => {
    const a = getAchievementById('first_victory');
    expect(a).toBeDefined();
    expect(a!.name_ja).toBe('初勝利');
  });

  it('存在しないIDでundefined', () => {
    expect(getAchievementById('nonexistent')).toBeUndefined();
  });
});

describe('evaluateAndEarnAchievements', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('敗北時は実績なし', () => {
    const result = evaluateAndEarnAchievements({
      result: 'lose', myScore: 0, opScore: 2, gameMode: 'com',
    });
    expect(result).toEqual([]);
  });

  it('引き分け時は実績なし', () => {
    const result = evaluateAndEarnAchievements({
      result: 'draw', myScore: 1, opScore: 1, gameMode: 'com',
    });
    expect(result).toEqual([]);
  });

  it('初勝利で first_victory 獲得', () => {
    const result = evaluateAndEarnAchievements({
      result: 'win', myScore: 2, opScore: 1, gameMode: 'com',
    });
    expect(result).toContain('first_victory');
  });

  it('完封勝利で clean_sheet 獲得', () => {
    const result = evaluateAndEarnAchievements({
      result: 'win', myScore: 1, opScore: 0, gameMode: 'com',
    });
    expect(result).toContain('clean_sheet');
  });

  it('同じ実績は2回獲得しない', () => {
    evaluateAndEarnAchievements({
      result: 'win', myScore: 1, opScore: 0, gameMode: 'com',
    });
    const second = evaluateAndEarnAchievements({
      result: 'win', myScore: 2, opScore: 0, gameMode: 'com',
    });
    expect(second).not.toContain('first_victory');
    expect(second).not.toContain('clean_sheet');
  });

  it('チーム撃破で対応実績を獲得', () => {
    const result = evaluateAndEarnAchievements({
      result: 'win', myScore: 1, opScore: 0, gameMode: 'com',
      presetTeamId: 'team_1_founding_eleven',
    });
    expect(result).toContain('defeat_founding_eleven');
  });

  it('ジャイアントキリング判定', () => {
    const result = evaluateAndEarnAchievements({
      result: 'win', myScore: 1, opScore: 0, gameMode: 'com',
      myTotalCost: 11, opTotalCost: 21.5,
    });
    expect(result).toContain('giant_killer');
  });

  it('全チーム撃破で all_teams_defeated', () => {
    // 4チームを順に撃破
    for (const teamId of [
      'team_1_founding_eleven',
      'team_2_banned_day',
      'team_3_total_football',
      'team_4_empty_archive',
    ]) {
      evaluateAndEarnAchievements({
        result: 'win', myScore: 1, opScore: 0, gameMode: 'com',
        presetTeamId: teamId,
      });
    }
    const earned = getEarnedAchievements();
    expect(earned.has('all_teams_defeated')).toBe(true);
  });

  it('resetAchievementsで全クリア', () => {
    evaluateAndEarnAchievements({
      result: 'win', myScore: 1, opScore: 0, gameMode: 'com',
    });
    expect(getEarnedAchievements().size).toBeGreaterThan(0);
    resetAchievements();
    expect(getEarnedAchievements().size).toBe(0);
  });
});
