// ============================================================
// preset_teams.ts — プリセットチーム v2.0（階段型4チーム）
// 心理設計: Progression / Discovery / Mastery / Attachment
// SS露出順序: 0 → 2 → 2 → 3（変更不可）
// 座標はフォーメーションテンプレートから自動生成（ハードコードなし）
// ============================================================

import type { PresetTeam, PresetPiecePlacement } from '../types/piece';
import type { TeamTactics } from '../ai/ai_context';

// ── フォーメーションテンプレート（home側 row 0-16） ──
// away側は MAX_ROW - row で自動反転

const MAX_ROW = 33;

type FormationSlot = {
  position: string;
  col: number;
  row: number;
};

/**
 * フォーメーション別テンプレート
 * 各スロットのポジションと座標（home側）を定義。
 * チームのポジション構成に合わせてスロットをマッチングする。
 */
const FORMATION_TEMPLATES: Record<string, FormationSlot[]> = {
  // 4-4-2: GK, DF×2, SB×2, VO, MF×2, WG, FW×2
  '4-4-2': [
    { position: 'GK', col: 10, row: 1 },
    { position: 'DF', col: 7,  row: 5 },
    { position: 'DF', col: 13, row: 5 },
    { position: 'SB', col: 4,  row: 6 },
    { position: 'SB', col: 16, row: 6 },
    { position: 'VO', col: 10, row: 9 },
    { position: 'MF', col: 7,  row: 12 },
    { position: 'MF', col: 13, row: 12 },
    { position: 'WG', col: 4,  row: 14 },
    { position: 'FW', col: 8,  row: 16 },
    { position: 'FW', col: 12, row: 16 },
  ],
  // 3-5-2: GK, DF×2, VO(sweeper), SB×2(WB), VO(DM), MF, OM, FW, WG
  '3-5-2': [
    { position: 'GK', col: 10, row: 1 },
    { position: 'DF', col: 6,  row: 4 },
    { position: 'DF', col: 14, row: 4 },
    { position: 'VO', col: 10, row: 5 },
    { position: 'SB', col: 3,  row: 9 },
    { position: 'SB', col: 17, row: 9 },
    { position: 'VO', col: 10, row: 10 },
    { position: 'MF', col: 7,  row: 12 },
    { position: 'OM', col: 13, row: 13 },
    { position: 'FW', col: 8,  row: 16 },
    { position: 'WG', col: 12, row: 16 },
  ],
  // 4-3-3: GK, DF×2, SB×2, MF, OM×2, WG×2, FW
  '4-3-3': [
    { position: 'GK', col: 10, row: 1 },
    { position: 'DF', col: 7,  row: 5 },
    { position: 'DF', col: 13, row: 5 },
    { position: 'SB', col: 4,  row: 6 },
    { position: 'SB', col: 16, row: 6 },
    { position: 'MF', col: 10, row: 10 },
    { position: 'OM', col: 7,  row: 12 },
    { position: 'OM', col: 13, row: 12 },
    { position: 'WG', col: 4,  row: 15 },
    { position: 'WG', col: 16, row: 15 },
    { position: 'FW', col: 10, row: 16 },
  ],
  // 4-2-3-1: GK, DF×2, SB×2, VO, MF, OM×2, WG, FW
  '4-2-3-1': [
    { position: 'GK', col: 10, row: 1 },
    { position: 'DF', col: 7,  row: 5 },
    { position: 'DF', col: 13, row: 5 },
    { position: 'SB', col: 4,  row: 6 },
    { position: 'SB', col: 16, row: 6 },
    { position: 'VO', col: 8,  row: 9 },
    { position: 'MF', col: 12, row: 9 },
    { position: 'OM', col: 6,  row: 13 },
    { position: 'OM', col: 14, row: 13 },
    { position: 'WG', col: 10, row: 14 },
    { position: 'FW', col: 10, row: 16 },
  ],
};

// ── テンプレートエクスポート（テスト・将来の拡張用） ──

export { FORMATION_TEMPLATES };

// ── 座標生成 ──

type TeamMember = {
  piece_id: number;
  position: string;
  cost: number;
};

/**
 * チームメンバーにフォーメーションテンプレートから away 側座標を割り当てる。
 * ポジションでスロットをマッチングし、row を反転。
 */
function buildAwayPlacements(
  formation: string,
  members: TeamMember[],
): PresetPiecePlacement[] {
  const template = FORMATION_TEMPLATES[formation];
  if (!template) throw new Error(`Unknown formation: ${formation}`);

  const usedSlots = new Set<number>();
  const placements: PresetPiecePlacement[] = [];

  for (const member of members) {
    const slotIdx = template.findIndex(
      (s, i) => !usedSlots.has(i) && s.position === member.position,
    );
    if (slotIdx === -1) {
      throw new Error(
        `No slot for position ${member.position} (piece_id=${member.piece_id}) in formation ${formation}`,
      );
    }
    usedSlots.add(slotIdx);
    const slot = template[slotIdx];
    placements.push({
      piece_id: member.piece_id,
      position: member.position,
      cost: member.cost,
      hex_col: slot.col,
      hex_row: MAX_ROW - slot.row,
    });
  }

  return placements;
}

// ── チームメンバー定義（piece_master 準拠） ──

const TEAM_1_MEMBERS: TeamMember[] = [
  { piece_id: 8,   position: 'GK', cost: 1 },   // Tom Harding
  { piece_id: 9,   position: 'DF', cost: 1 },   // Elijah McKay
  { piece_id: 55,  position: 'DF', cost: 1 },   // Marius Beckmann
  { piece_id: 37,  position: 'SB', cost: 1 },   // Josef Hartmann
  { piece_id: 70,  position: 'SB', cost: 1 },   // Ernesto Rivera
  { piece_id: 35,  position: 'VO', cost: 1 },   // Lucy Bryce
  { piece_id: 10,  position: 'MF', cost: 1 },   // Samuel Reid
  { piece_id: 82,  position: 'MF', cost: 1 },   // Kevin Mahoney
  { piece_id: 23,  position: 'WG', cost: 1 },   // Lucas Ashcroft
  { piece_id: 36,  position: 'FW', cost: 1 },   // Frank MacKenzie
  { piece_id: 104, position: 'FW', cost: 1 },   // Sam Williams
];

const TEAM_2_MEMBERS: TeamMember[] = [
  { piece_id: 51,  position: 'GK', cost: 1.5 }, // Agnes Mallory
  { piece_id: 25,  position: 'DF', cost: 2 },   // Viktor Weisshaupt
  { piece_id: 50,  position: 'DF', cost: 1.5 }, // Hannah Brighton
  { piece_id: 29,  position: 'VO', cost: 2 },   // Miloš Kovačević (sweeper)
  { piece_id: 30,  position: 'SB', cost: 1.5 }, // Ronald MacFarlane
  { piece_id: 48,  position: 'SB', cost: 1.5 }, // Angus MacFarlane
  { piece_id: 47,  position: 'VO', cost: 2.5 }, // Stefan Kovačević (DM)
  { piece_id: 27,  position: 'MF', cost: 1.5 }, // Pierre Dubois
  { piece_id: 38,  position: 'OM', cost: 3 },   // Dorothy Blackwood ★SS
  { piece_id: 39,  position: 'FW', cost: 3 },   // Violet Connor ★SS
  { piece_id: 49,  position: 'WG', cost: 1.5 }, // Aaron Adeyo
];

const TEAM_3_MEMBERS: TeamMember[] = [
  { piece_id: 98,  position: 'GK', cost: 1.5 }, // Sergei Ivanov
  { piece_id: 88,  position: 'DF', cost: 3 },   // Rudolf Weisshaupt ★SS
  { piece_id: 99,  position: 'DF', cost: 1.5 }, // William O'Connor
  { piece_id: 94,  position: 'SB', cost: 2 },   // Johannes MacFarlane
  { piece_id: 78,  position: 'SB', cost: 2 },   // Hamish MacFarlane II
  { piece_id: 92,  position: 'MF', cost: 2 },   // Miroslav Kovačević
  { piece_id: 96,  position: 'OM', cost: 2.5 }, // László Horváth
  { piece_id: 87,  position: 'OM', cost: 3 },   // Hans van der Berg ★SS
  { piece_id: 95,  position: 'WG', cost: 2 },   // Chedi Okonkwo
  { piece_id: 102, position: 'WG', cost: 1 },   // Hugo Morales
  { piece_id: 91,  position: 'FW', cost: 2.5 }, // Joaquim Silva
];

const TEAM_4_MEMBERS: TeamMember[] = [
  { piece_id: 194, position: 'GK', cost: 1.5 }, // Yusuf El-Taeb
  { piece_id: 157, position: 'DF', cost: 2.5 }, // Cedric Blackwood
  { piece_id: 176, position: 'DF', cost: 2 },   // Ivan Petrović
  { piece_id: 181, position: 'SB', cost: 1.5 }, // Hannah MacFarlane
  { piece_id: 193, position: 'SB', cost: 1.5 }, // Ryan MacFarlane
  { piece_id: 171, position: 'VO', cost: 3 },   // Juan Hernández ★SS
  { piece_id: 173, position: 'MF', cost: 2.5 }, // Nils Weisshaupt
  { piece_id: 187, position: 'OM', cost: 3 },   // Benedikt Weisshaupt ★SS
  { piece_id: 172, position: 'OM', cost: 3 },   // Adeola Okonkwo ★SS
  { piece_id: 179, position: 'WG', cost: 1.5 }, // Raphaël Janvier
  { piece_id: 192, position: 'FW', cost: 2 },   // Júlia Silva
];

// ── ヘルパー ──

function sumCost(members: TeamMember[]): number {
  return members.reduce((sum, m) => sum + m.cost, 0);
}

function countSS(members: TeamMember[]): number {
  return members.filter((m) => m.cost === 3).length;
}

// ── プリセットチーム定義 ──

export const PRESET_TEAMS: PresetTeam[] = [
  {
    team_id: 'team_1_founding_eleven',
    name_ja: '創設の11人',
    name_en: 'The Founding Eleven',
    shelf: null,
    formation_preset: '4-4-2',
    total_cost: sumCost(TEAM_1_MEMBERS),
    ss_count: countSS(TEAM_1_MEMBERS),
    difficulty_tier: 1,
    unlock_condition: null,
    starters: buildAwayPlacements('4-4-2', TEAM_1_MEMBERS),
    bench: [],
    narrative_intro_ja: '1903年、ハミッシュ・マクファーレンが盤に最初に並べた11人のファイル。有名でもなく、家系にも属さない。それでも蹴り続けた者たちだ。',
    narrative_win_ja: '創設の11人を超えた。だが忘れるな——彼らなくして、この盤は存在しなかった。',
    narrative_loss_ja: '華麗さはない。だが彼らは160年間、この盤の最初のページを占めてきた。その重みに、君はまだ届かない。',
  },
  {
    team_id: 'team_2_banned_day',
    name_ja: '禁じられた日の記憶',
    name_en: 'The Banned Day',
    shelf: 2,
    formation_preset: '3-5-2',
    total_cost: sumCost(TEAM_2_MEMBERS),
    ss_count: countSS(TEAM_2_MEMBERS),
    difficulty_tier: 2,
    unlock_condition: { type: 'defeat_team', team_id: 'team_1_founding_eleven' },
    starters: buildAwayPlacements('3-5-2', TEAM_2_MEMBERS),
    bench: [],
    narrative_intro_ja: '1920年、5万3千人がヴァイオレット・コナーの得点に沸いた。翌年、女子サッカーは禁止された。ドロシー・ブラックウッドは51年間、夢を封印された。この書棚には、沈黙を強いられた者たちのファイルが並ぶ。',
    narrative_win_ja: '禁止令は砕かれた。51年の沈黙を、君のピッチが終わらせた。ドロシーのファイルに、新しい一行が書き加えられる。',
    narrative_loss_ja: '5万3千人の歓声を知るヴァイオレット、51年を耐えたドロシー。奪われた時間の重さが、そのまま強さになっている。',
  },
  {
    team_id: 'team_3_total_football',
    name_ja: '全方位の革命',
    name_en: 'Total Football',
    shelf: 4,
    formation_preset: '4-3-3',
    total_cost: sumCost(TEAM_3_MEMBERS),
    ss_count: countSS(TEAM_3_MEMBERS),
    difficulty_tier: 3,
    unlock_condition: { type: 'defeat_team', team_id: 'team_2_banned_day' },
    starters: buildAwayPlacements('4-3-3', TEAM_3_MEMBERS),
    bench: [],
    narrative_intro_ja: '1970年代、ハンス・ファン・デル・ベルクは全方位に動き、ルドルフ・ヴァイスハウプトはリベロを発明した。サッカーが「哲学」になった時代のファイルが、この書棚にある。全員が攻め、全員が守る。',
    narrative_win_ja: '哲学を超えたのは、君自身の解釈だった。ハンスのファイルにも書かれていない手を、君は打った。',
    narrative_loss_ja: 'ハンスは全方位に動き、ルドルフは思考する壁になった。哲学とは、ただの理屈ではない。ピッチの上で証明され続ける真理だ。',
  },
  {
    team_id: 'team_4_empty_archive',
    name_ja: '無観客のアーカイブ',
    name_en: 'The Empty Archive',
    shelf: 7,
    formation_preset: '4-2-3-1',
    total_cost: sumCost(TEAM_4_MEMBERS),
    ss_count: countSS(TEAM_4_MEMBERS),
    difficulty_tier: 4,
    unlock_condition: { type: 'defeat_team', team_id: 'team_3_total_football' },
    starters: buildAwayPlacements('4-2-3-1', TEAM_4_MEMBERS),
    bench: [],
    narrative_intro_ja: 'パンデミックが観客を奪った日も、ベネディクト・ヴァイスハウプトは無人のスタジアムで叫び続けた。アデオラ・オコンクウォは膝をつき、フアン・エルナンデスは走行距離だけで勝った。これがアーカイブ最前線——まだインクの乾かないファイルたちだ。',
    narrative_win_ja: 'まだ書き終わっていないファイルを、君は超えた。だがアーカイブは更新され続ける。次に君が開く書棚には、新しい名前が並んでいるだろう。',
    narrative_loss_ja: 'ベネディクトの叫びは、空のスタンドにも届いた。アデオラの才能は、家系10代の重みを背負っている。最前線のファイルは、まだ完結していない。',
  },
];

// ── チーム戦術パラメータ ──
// フォーメーションと難易度tierに基づくAI行動調整

const TEAM_TACTICS: Record<string, TeamTactics> = {
  // Team 1: 4-4-2 創設の11人。デフォルトラインそのまま、初心者向けの弱体化
  team_1_founding_eleven: {
    diffOverrides: {
      shootRange: 5,
      maxPressers: 1,
      skipRate: 0.15,
      relayMaxDist: 6,
    },
  },

  // Team 2: 3-5-2 禁じられた日。SBがWBとして高い位置を取り、中盤を厚くする
  team_2_banned_day: {
    lineRanges: {
      SB: {
        attack: { min: 8, max: 24 },  // WBとして高い位置まで上がる
        defense: { min: 5, max: 16 },  // 守備時もやや高め
      },
      VO: {
        attack: { min: 8, max: 20 },   // スイーパー/DMは控えめ
        defense: { min: 5, max: 15 },
      },
    },
    diffOverrides: {
      maxPressers: 2,
      relayMaxDist: 10,  // 中盤が厚いので中継パスが効く
    },
  },

  // Team 3: 4-3-3 トータルフットボール。全ポジションが広い行動範囲を持つ
  team_3_total_football: {
    lineRanges: {
      DF: {
        attack: { min: 5, max: 22 },   // DFも攻撃参加
        defense: { min: 3, max: 15 },
      },
      SB: {
        attack: { min: 5, max: 22 },   // SBも高い位置まで
        defense: { min: 3, max: 15 },
      },
      MF: {
        attack: { min: 10, max: 28 },  // MFが広く動く
        defense: { min: 6, max: 20 },
      },
      OM: {
        attack: { min: 12, max: 30 },  // OMは最前線付近まで
        defense: { min: 8, max: 22 },
      },
      WG: {
        attack: { min: 14, max: 32 },  // WGはサイド突破
        defense: { min: 10, max: 22 },
      },
    },
    diffOverrides: {
      shootRange: 8,
      maxPressers: 3,
      useZocPassBlock: true,
      relayMaxDist: 10,
    },
  },

  // Team 4: 4-2-3-1 無観客のアーカイブ。DFラインが低く、OM/WGがカウンターで一気に上がる
  team_4_empty_archive: {
    lineRanges: {
      DF: {
        attack: { min: 3, max: 16 },   // DF低め維持
        defense: { min: 2, max: 12 },
      },
      SB: {
        attack: { min: 3, max: 18 },
        defense: { min: 2, max: 12 },
      },
      VO: {
        attack: { min: 10, max: 22 },  // ダブルボランチ
        defense: { min: 6, max: 16 },
      },
      OM: {
        attack: { min: 16, max: 30 },  // OMが高い位置を取る
        defense: { min: 10, max: 20 },
      },
      WG: {
        attack: { min: 16, max: 32 },  // WGも高い位置
        defense: { min: 12, max: 22 },
      },
    },
    diffOverrides: {
      shootRange: 9,
      maxPressers: 3,
      useZocPassBlock: true,
      relayMaxDist: 12,
      pickBest: true,
    },
  },
};

export { TEAM_TACTICS };

/** team_id からチーム戦術パラメータを取得 */
export function getTeamTactics(teamId: string): TeamTactics | undefined {
  return TEAM_TACTICS[teamId];
}

// ── エクスポート ──

/** team_id からプリセットチームを取得 */
export function getPresetTeamById(teamId: string): PresetTeam | undefined {
  return PRESET_TEAMS.find((t) => t.team_id === teamId);
}

/** difficulty_tier からプリセットチームを取得 */
export function getPresetTeamByTier(tier: number): PresetTeam | undefined {
  return PRESET_TEAMS.find((t) => t.difficulty_tier === tier);
}
