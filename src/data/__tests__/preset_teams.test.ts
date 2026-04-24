// ============================================================
// preset_teams.test.ts — プリセットチーム v2.0 データ検証
// ============================================================

import { describe, it, expect } from 'vitest';
import { PRESET_TEAMS, FORMATION_TEMPLATES, TEAM_TACTICS, getPresetTeamById, getPresetTeamByTier, getTeamTactics } from '../preset_teams';

describe('PRESET_TEAMS', () => {
  it('4チーム定義されている', () => {
    expect(PRESET_TEAMS).toHaveLength(4);
  });

  it('difficulty_tier が 1〜4 で一意', () => {
    const tiers = PRESET_TEAMS.map((t) => t.difficulty_tier);
    expect(tiers).toEqual([1, 2, 3, 4]);
  });

  it('team_id が一意', () => {
    const ids = PRESET_TEAMS.map((t) => t.team_id);
    expect(new Set(ids).size).toBe(4);
  });

  it('各チームのスタメンが11人', () => {
    for (const team of PRESET_TEAMS) {
      expect(team.starters).toHaveLength(11);
    }
  });

  it('各チームにGKが1人', () => {
    for (const team of PRESET_TEAMS) {
      const gks = team.starters.filter((s) => s.position === 'GK');
      expect(gks).toHaveLength(1);
    }
  });

  it('piece_id が全チームで重複しない', () => {
    const allIds = PRESET_TEAMS.flatMap((t) => t.starters.map((s) => s.piece_id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('piece_id が 1〜200 の範囲内', () => {
    for (const team of PRESET_TEAMS) {
      for (const s of team.starters) {
        expect(s.piece_id).toBeGreaterThanOrEqual(1);
        expect(s.piece_id).toBeLessThanOrEqual(200);
      }
    }
  });

  it('total_cost がスタメンのcost合計と一致', () => {
    for (const team of PRESET_TEAMS) {
      const sum = team.starters.reduce((acc, s) => acc + s.cost, 0);
      expect(team.total_cost).toBe(sum);
    }
  });

  it('ss_count がcost=3の人数と一致', () => {
    for (const team of PRESET_TEAMS) {
      const ssCount = team.starters.filter((s) => s.cost === 3).length;
      expect(team.ss_count).toBe(ssCount);
    }
  });

  it('SS露出順序が 0 → 2 → 2 → 3', () => {
    const ssCounts = PRESET_TEAMS.map((t) => t.ss_count);
    expect(ssCounts).toEqual([0, 2, 2, 3]);
  });

  it('座標がaway側（row 17〜33）', () => {
    for (const team of PRESET_TEAMS) {
      for (const s of team.starters) {
        expect(s.hex_row).toBeGreaterThanOrEqual(17);
        expect(s.hex_row).toBeLessThanOrEqual(33);
      }
    }
  });

  it('座標がボード範囲内（col 0-21, row 0-33）', () => {
    for (const team of PRESET_TEAMS) {
      for (const s of team.starters) {
        expect(s.hex_col).toBeGreaterThanOrEqual(0);
        expect(s.hex_col).toBeLessThanOrEqual(21);
        expect(s.hex_row).toBeGreaterThanOrEqual(0);
        expect(s.hex_row).toBeLessThanOrEqual(33);
      }
    }
  });

  it('同一チーム内で座標が重複しない', () => {
    for (const team of PRESET_TEAMS) {
      const coords = team.starters.map((s) => `${s.hex_col},${s.hex_row}`);
      expect(new Set(coords).size).toBe(coords.length);
    }
  });

  it('Team 1 は Founding Eleven と同じ piece_id', () => {
    const team1 = getPresetTeamById('team_1_founding_eleven')!;
    const expectedIds = [8, 9, 10, 23, 35, 36, 37, 55, 70, 82, 104];
    const actualIds = team1.starters.map((s) => s.piece_id).sort((a, b) => a - b);
    expect(actualIds).toEqual(expectedIds);
  });

  it('Team 1 のコストが全て1（Founding Eleven）', () => {
    const team1 = getPresetTeamByTier(1)!;
    for (const s of team1.starters) {
      expect(s.cost).toBe(1);
    }
  });

  it('Team 1 は解放条件なし（常に解放）', () => {
    const team1 = getPresetTeamByTier(1)!;
    expect(team1.unlock_condition).toBeNull();
  });

  it('Team 2-4 は前のチーム撃破が解放条件', () => {
    const team2 = getPresetTeamByTier(2)!;
    expect(team2.unlock_condition).toEqual({ type: 'defeat_team', team_id: 'team_1_founding_eleven' });
    const team3 = getPresetTeamByTier(3)!;
    expect(team3.unlock_condition).toEqual({ type: 'defeat_team', team_id: 'team_2_banned_day' });
    const team4 = getPresetTeamByTier(4)!;
    expect(team4.unlock_condition).toEqual({ type: 'defeat_team', team_id: 'team_3_total_football' });
  });

  it('解放条件のteam_idが実在するチームを参照', () => {
    for (const team of PRESET_TEAMS) {
      if (team.unlock_condition?.type === 'defeat_team') {
        const ref = getPresetTeamById(team.unlock_condition.team_id);
        expect(ref).toBeDefined();
      }
    }
  });

  it('bench が空（MVP時点）', () => {
    for (const team of PRESET_TEAMS) {
      expect(team.bench).toEqual([]);
    }
  });

  it('ナラティブテキストが全チームに存在', () => {
    for (const team of PRESET_TEAMS) {
      expect(team.narrative_intro_ja.length).toBeGreaterThan(0);
      expect(team.narrative_win_ja.length).toBeGreaterThan(0);
      expect(team.narrative_loss_ja.length).toBeGreaterThan(0);
    }
  });
});

describe('FORMATION_TEMPLATES', () => {
  const formations = ['4-4-2', '3-5-2', '4-3-3', '4-2-3-1'];

  it('4フォーメーション定義されている', () => {
    expect(Object.keys(FORMATION_TEMPLATES)).toHaveLength(4);
  });

  for (const f of formations) {
    it(`${f} テンプレートが11スロット`, () => {
      expect(FORMATION_TEMPLATES[f]).toHaveLength(11);
    });

    it(`${f} テンプレートにGKが1つ`, () => {
      const gks = FORMATION_TEMPLATES[f].filter((s) => s.position === 'GK');
      expect(gks).toHaveLength(1);
    });

    it(`${f} テンプレートのrow がhome側（0-16）`, () => {
      for (const slot of FORMATION_TEMPLATES[f]) {
        expect(slot.row).toBeGreaterThanOrEqual(0);
        expect(slot.row).toBeLessThanOrEqual(16);
      }
    });
  }
});

describe('getPresetTeamById', () => {
  it('存在するIDで取得できる', () => {
    const team = getPresetTeamById('team_2_banned_day');
    expect(team).toBeDefined();
    expect(team!.difficulty_tier).toBe(2);
  });

  it('存在しないIDでundefined', () => {
    expect(getPresetTeamById('nonexistent')).toBeUndefined();
  });
});

describe('getPresetTeamByTier', () => {
  it('tier 1-4 で取得できる', () => {
    for (let i = 1; i <= 4; i++) {
      expect(getPresetTeamByTier(i)).toBeDefined();
    }
  });

  it('存在しないtierでundefined', () => {
    expect(getPresetTeamByTier(5)).toBeUndefined();
  });
});

describe('TEAM_TACTICS', () => {
  it('全プリセットチームに戦術パラメータが定義されている', () => {
    for (const team of PRESET_TEAMS) {
      const tactics = getTeamTactics(team.team_id);
      expect(tactics).toBeDefined();
    }
  });

  it('getTeamTacticsで存在しないIDはundefined', () => {
    expect(getTeamTactics('nonexistent')).toBeUndefined();
  });

  it('Team 1 はdiffOverridesのみ（lineRangesなし）', () => {
    const t = TEAM_TACTICS['team_1_founding_eleven'];
    expect(t.diffOverrides).toBeDefined();
    expect(t.lineRanges).toBeUndefined();
  });

  it('Team 3 (トータルフットボール) はDF/SBの行動範囲が広い', () => {
    const t = TEAM_TACTICS['team_3_total_football'];
    expect(t.lineRanges?.DF?.attack.max).toBeGreaterThan(18); // default is 18
    expect(t.lineRanges?.SB?.attack.max).toBeGreaterThan(18);
  });

  it('Team 4 はuseZocPassBlock=true', () => {
    const t = TEAM_TACTICS['team_4_empty_archive'];
    expect(t.diffOverrides?.useZocPassBlock).toBe(true);
  });

  it('lineRangesのmin < max', () => {
    for (const [, tactics] of Object.entries(TEAM_TACTICS)) {
      if (!tactics.lineRanges) continue;
      for (const [, range] of Object.entries(tactics.lineRanges)) {
        if (!range) continue;
        expect(range.attack.min).toBeLessThan(range.attack.max);
        expect(range.defense.min).toBeLessThan(range.defense.max);
      }
    }
  });

  it('lineRangesの値がボード範囲内（0-33）', () => {
    for (const [, tactics] of Object.entries(TEAM_TACTICS)) {
      if (!tactics.lineRanges) continue;
      for (const [, range] of Object.entries(tactics.lineRanges)) {
        if (!range) continue;
        expect(range.attack.min).toBeGreaterThanOrEqual(0);
        expect(range.attack.max).toBeLessThanOrEqual(33);
        expect(range.defense.min).toBeGreaterThanOrEqual(0);
        expect(range.defense.max).toBeLessThanOrEqual(33);
      }
    }
  });
});
