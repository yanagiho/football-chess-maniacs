import { describe, expect, it } from 'vitest';
import { NPC_TEAMS } from '../npc_teams';
import { PRESET_TEAMS } from '../presetTeams';

describe('PRESET_TEAMS', () => {
  it('NPCチーム定義から世界観プリセットを生成する', () => {
    expect(PRESET_TEAMS).toHaveLength(NPC_TEAMS.length);
    expect(PRESET_TEAMS[0].id).toBe('npc_shelf_1');
    expect(PRESET_TEAMS[0].name).toBe('草創期オールスター');
    expect(PRESET_TEAMS[0].nameEn).toBe('Dawn All-Stars');
  });

  it('全チームが11人・表示情報・コスト集計を持つ', () => {
    for (const team of PRESET_TEAMS) {
      expect(team.pieces).toHaveLength(11);
      expect(team.totalCost).toBe(team.pieces.reduce((sum, piece) => sum + piece.cost, 0));

      for (const piece of team.pieces) {
        expect(piece.pieceId).toBeGreaterThan(0);
        expect(piece.name).not.toBe('');
        expect(piece.nameEn).not.toBe('');
        expect(piece.summary).not.toBe('');
        expect([1, 1.5, 2, 2.5, 3]).toContain(piece.cost);
      }
    }
  });

  it('NPC配置はaway側座標として保持する', () => {
    for (const team of PRESET_TEAMS) {
      for (const piece of team.pieces) {
        expect(piece.col).toBeGreaterThanOrEqual(0);
        expect(piece.col).toBeLessThanOrEqual(21);
        expect(piece.row).toBeGreaterThanOrEqual(17);
        expect(piece.row).toBeLessThanOrEqual(33);
      }
    }
  });
});
