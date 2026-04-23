// ============================================================
// npc_teams.ts — NPC チーム定義（7時代 × 1チーム）
// COM対戦で使用する7つのプリセットNPCチーム
// Founding Eleven (8,9,10,23,35,36,37,55,70,82,104) は除外
// ============================================================

export interface NpcTeamPiece {
  piece_id: number;
  position: string;
  col: number;
  row: number;
}

export interface NpcTeam {
  id: string;
  shelf: number;
  name_ja: string;
  name_en: string;
  formation: string;
  starters: NpcTeamPiece[];
  total_cost: number;
}

/**
 * 7 NPC チーム（Shelf 1-7）
 * 各チーム: 1 GK + 10 FP、総コスト 14-20
 * 配置座標は away 側 (row 17-33) のデフォルト 4-4-2 等
 */
export const NPC_TEAMS: NpcTeam[] = [
  // ── Shelf 1: Dawn (草創期) Era 1-2 ──
  // 利用可能: 001-022 (Founding Eleven除外: 8,9,10)
  {
    id: 'npc_shelf_1',
    shelf: 1,
    name_ja: '草創期オールスター',
    name_en: 'Dawn All-Stars',
    formation: '4-4-2',
    total_cost: 18,
    starters: [
      { piece_id: 5,  position: 'GK', col: 10, row: 30 },  // Henry Ashworth GK 1.5
      { piece_id: 1,  position: 'DF', col: 4,  row: 27 },  // Edmund Blackwood DF 2
      { piece_id: 15, position: 'DF', col: 8,  row: 27 },  // Pierre Danton DF 1.5
      { piece_id: 16, position: 'DF', col: 12, row: 27 },  // Dušan Petrović DF 1
      { piece_id: 20, position: 'DF', col: 16, row: 27 },  // Violet Connor DF 1
      { piece_id: 2,  position: 'VO', col: 6,  row: 24 },  // Archie MacFarlane VO 1.5
      { piece_id: 6,  position: 'MF', col: 10, row: 24 },  // Duncan Caird MF 1
      { piece_id: 11, position: 'OM', col: 14, row: 24 },  // Elizabeth Hawthorne OM 2
      { piece_id: 7,  position: 'OM', col: 18, row: 24 },  // Oliver Blackwood OM 2
      { piece_id: 4,  position: 'FW', col: 8,  row: 21 },  // Wilfred Thorne FW 2
      { piece_id: 13, position: 'FW', col: 12, row: 21 },  // James Blackwood FW 2.5
    ],
  },

  // ── Shelf 2: Interwar (戦間期) Era 3-4 ──
  // 利用可能: 024-054 (Founding Eleven除外: 23,35,36,37)
  {
    id: 'npc_shelf_2',
    shelf: 2,
    name_ja: '戦間期オールスター',
    name_en: 'Interwar All-Stars',
    formation: '3-5-2',
    total_cost: 19,
    starters: [
      { piece_id: 34, position: 'GK', col: 10, row: 30 },  // Thomas Gallagher GK 1
      { piece_id: 27, position: 'DF', col: 6,  row: 27 },  // William Blackwood DF 2.5
      { piece_id: 32, position: 'DF', col: 10, row: 27 },  // François Lecomte DF 1.5
      { piece_id: 38, position: 'DF', col: 14, row: 27 },  // Viktor Weisshaupt DF 2
      { piece_id: 30, position: 'VO', col: 6,  row: 24 },  // Ned MacFarlane SB 1.5
      { piece_id: 26, position: 'MF', col: 10, row: 24 },  // Carlo Montefiore MF 2
      { piece_id: 40, position: 'MF', col: 14, row: 24 },  // André Dubois MF 1.5
      { piece_id: 25, position: 'OM', col: 8,  row: 22 },  // Miloš Kovačević OM 2
      { piece_id: 39, position: 'OM', col: 12, row: 22 },  // Heinrich Weisshaupt OM 2
      { piece_id: 28, position: 'FW', col: 8,  row: 20 },  // Dorothy Blackwood FW 3
      { piece_id: 24, position: 'FW', col: 12, row: 20 },  // Aaron Mensah FW 1
    ],
  },

  // ── Shelf 3: Post-War (戦後黄金期) Era 5-6 ──
  // 利用可能: 056-086 (Founding Eleven除外: 55,70)
  {
    id: 'npc_shelf_3',
    shelf: 3,
    name_ja: '戦後オールスター',
    name_en: 'Post-War All-Stars',
    formation: '4-3-3',
    total_cost: 19.5,
    starters: [
      { piece_id: 56, position: 'GK', col: 10, row: 30 },  // Rudolf Weisshaupt GK 1.5
      { piece_id: 58, position: 'DF', col: 4,  row: 27 },  // Franco Montefiore DF 2
      { piece_id: 63, position: 'DF', col: 8,  row: 27 },  // Daniel Dubois DF 1.5
      { piece_id: 67, position: 'DF', col: 12, row: 27 },  // Dimitri Kovačević DF 1.5
      { piece_id: 69, position: 'SB', col: 16, row: 27 },  // Chedi Diallo SB 1
      { piece_id: 59, position: 'VO', col: 8,  row: 24 },  // Robert Blackwood VO 2
      { piece_id: 60, position: 'MF', col: 10, row: 24 },  // João Silva MF 2
      { piece_id: 62, position: 'MF', col: 14, row: 24 },  // Ronald MacFarlane MF 1.5
      { piece_id: 71, position: 'WG', col: 4,  row: 21 },  // Pedro Silva WG 3
      { piece_id: 57, position: 'FW', col: 10, row: 21 },  // Paolo Montefiore FW 2
      { piece_id: 64, position: 'FW', col: 16, row: 21 },  // Joaquim Silva FW 1.5
    ],
  },

  // ── Shelf 4: Expansion (テレビ・拡張期) Era 7 ──
  // 利用可能: 087-104 (Founding Eleven除外: 82,104)
  {
    id: 'npc_shelf_4',
    shelf: 4,
    name_ja: '拡張期オールスター',
    name_en: 'Expansion All-Stars',
    formation: '4-4-2',
    total_cost: 18.5,
    starters: [
      { piece_id: 88, position: 'GK', col: 10, row: 30 },  // Angus MacFarlane GK 1.5
      { piece_id: 91, position: 'DF', col: 4,  row: 27 },  // Curtis Blackwood DF 2
      { piece_id: 92, position: 'DF', col: 8,  row: 27 },  // Stefan Kovačević DF 2
      { piece_id: 95, position: 'SB', col: 12, row: 27 },  // Zoran Babić SB 1
      { piece_id: 97, position: 'SB', col: 16, row: 27 },  // Jacques Dubois SB 1.5
      { piece_id: 90, position: 'MF', col: 6,  row: 24 },  // Otto Weisshaupt MF 2
      { piece_id: 87, position: 'OM', col: 10, row: 24 },  // Sergio Montefiore OM 2.5
      { piece_id: 93, position: 'MF', col: 14, row: 24 },  // Fábio Silva MF 1.5
      { piece_id: 96, position: 'OM', col: 18, row: 24 },  // Aisha Okonkwo OM 1
      { piece_id: 89, position: 'FW', col: 8,  row: 21 },  // Dragan Kovačević FW 2
      { piece_id: 94, position: 'FW', col: 12, row: 21 },  // Olufemi Adeyemi FW 1.5
    ],
  },

  // ── Shelf 5: Modernization (近代化期) Era 8-9 ──
  // 利用可能: 105-137
  {
    id: 'npc_shelf_5',
    shelf: 5,
    name_ja: '近代化期オールスター',
    name_en: 'Modernization All-Stars',
    formation: '4-2-3-1',
    total_cost: 20,
    starters: [
      { piece_id: 110, position: 'GK', col: 10, row: 30 },  // Michael Weisshaupt GK 1.5
      { piece_id: 106, position: 'DF', col: 4,  row: 27 },  // Nigel Blackwood DF 2
      { piece_id: 107, position: 'DF', col: 8,  row: 27 },  // Daniele Montefiore DF 2
      { piece_id: 112, position: 'SB', col: 12, row: 27 },  // Branko Milić SB 1.5
      { piece_id: 119, position: 'SB', col: 16, row: 27 },  // Camille Dubois SB 1
      { piece_id: 109, position: 'VO', col: 8,  row: 25 },  // Eduardo Silva VO 2
      { piece_id: 121, position: 'VO', col: 12, row: 25 },  // Goran Petrović VO 1.5
      { piece_id: 105, position: 'OM', col: 6,  row: 22 },  // Hamish MacFarlane II OM 2.5
      { piece_id: 111, position: 'MF', col: 10, row: 22 },  // Kamal Ibrahim MF 1
      { piece_id: 108, position: 'WG', col: 14, row: 22 },  // Nathalie Dubois WG 1.5
      { piece_id: 122, position: 'FW', col: 10, row: 20 },  // David Blackwood FW 2
    ],
  },

  // ── Shelf 6: Global (グローバル期) Era 10-11 ──
  // 利用可能: 138-170
  {
    id: 'npc_shelf_6',
    shelf: 6,
    name_ja: 'グローバル期オールスター',
    name_en: 'Global All-Stars',
    formation: '4-3-3',
    total_cost: 20,
    starters: [
      { piece_id: 147, position: 'GK', col: 10, row: 30 },  // Benjamin Weisshaupt GK 1.5
      { piece_id: 140, position: 'DF', col: 4,  row: 27 },  // George Blackwood DF 2
      { piece_id: 143, position: 'DF', col: 8,  row: 27 },  // Valentina Montefiore DF 1.5
      { piece_id: 155, position: 'SB', col: 12, row: 27 },  // Nils Weisshaupt SB 2
      { piece_id: 159, position: 'SB', col: 16, row: 27 },  // Ian MacFarlane SB 1
      { piece_id: 141, position: 'VO', col: 8,  row: 24 },  // Lucas Silva VO 2
      { piece_id: 142, position: 'MF', col: 10, row: 24 },  // Alessandra Montefiore MF 2
      { piece_id: 156, position: 'OM', col: 14, row: 24 },  // Cedric Blackwood OM 2.5
      { piece_id: 138, position: 'WG', col: 4,  row: 21 },  // Adeola Okonkwo WG 3
      { piece_id: 157, position: 'FW', col: 10, row: 21 },  // Musa Kouyaté FW 1
      { piece_id: 139, position: 'FW', col: 16, row: 21 },  // Celeste Montefiore FW 1.5
    ],
  },

  // ── Shelf 7: Present (現代) Era 12-13 ──
  // 利用可能: 171-200
  {
    id: 'npc_shelf_7',
    shelf: 7,
    name_ja: '現代オールスター',
    name_en: 'Present All-Stars',
    formation: '3-4-3',
    total_cost: 19.5,
    starters: [
      { piece_id: 194, position: 'GK', col: 10, row: 30 },  // Yusuf El-Taeb GK 1.5
      { piece_id: 173, position: 'DF', col: 6,  row: 27 },  // Caleb Blackwood DF 2
      { piece_id: 195, position: 'DF', col: 10, row: 27 },  // Emilia Bergman DF 1.5
      { piece_id: 176, position: 'DF', col: 14, row: 27 },  // Emmanuel MacFarlane DF 2
      { piece_id: 178, position: 'VO', col: 6,  row: 24 },  // Nathalie Dubois II VO 1.5
      { piece_id: 187, position: 'OM', col: 10, row: 24 },  // Benedikt Weisshaupt OM 3
      { piece_id: 174, position: 'MF', col: 14, row: 24 },  // Rafael Silva MF 2
      { piece_id: 190, position: 'WG', col: 18, row: 24 },  // Musa Okonkwo WG 2
      { piece_id: 171, position: 'FW', col: 6,  row: 21 },  // Hannah MacFarlane FW 1.5
      { piece_id: 192, position: 'FW', col: 10, row: 21 },  // Júlia Silva FW 2
      { piece_id: 200, position: 'FW', col: 14, row: 21 },  // Pietro De Sanctis FW 1
    ],
  },
];

/** shelf番号からNPCチームを取得 */
export function getNpcTeamByShelf(shelf: number): NpcTeam | undefined {
  return NPC_TEAMS.find((t) => t.shelf === shelf);
}
