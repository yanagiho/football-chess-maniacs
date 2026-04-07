// ============================================================
// presetTeams.ts — プリセットチームデータ（B10）
// GrassRoots 7時代 × 各1チーム = 7チーム
// ============================================================

import type { Position, Cost } from '../engine/types';

export interface PresetPiece {
  position: Position;
  cost: Cost;
  name: string;
}

export interface PresetTeam {
  id: string;
  name: string;
  era: number;
  formation: string;
  emoji: string;
  pieces: PresetPiece[];
}

export const PRESET_TEAMS: PresetTeam[] = [
  // GR1 — ブラジル風 (4-4-2)
  {
    id: 'gr1_brasil',
    name: 'セレソン GR1',
    era: 1,
    formation: '4-4-2',
    emoji: '\u{1F1E7}\u{1F1F7}',
    pieces: [
      { position: 'GK', cost: 1, name: '守護神' },
      { position: 'DF', cost: 1, name: '鉄壁' },
      { position: 'DF', cost: 1.5, name: '闘将' },
      { position: 'SB', cost: 1, name: '疾風右' },
      { position: 'SB', cost: 1, name: '疾風左' },
      { position: 'MF', cost: 1.5, name: '司令塔' },
      { position: 'VO', cost: 1, name: '番犬' },
      { position: 'OM', cost: 2, name: '魔術師' },
      { position: 'WG', cost: 1.5, name: '韋駄天' },
      { position: 'FW', cost: 2, name: '怪物' },
      { position: 'FW', cost: 2, name: '点取屋' },
    ], // 合計 14.5
  },
  // GR2 — ドイツ風 (3-5-2)
  {
    id: 'gr2_deutschland',
    name: 'ゲルマン魂 GR2',
    era: 2,
    formation: '3-5-2',
    emoji: '\u{1F1E9}\u{1F1EA}',
    pieces: [
      { position: 'GK', cost: 1.5, name: '鋼の壁' },
      { position: 'DF', cost: 1.5, name: '皇帝守備' },
      { position: 'DF', cost: 1.5, name: '鉄人' },
      { position: 'DF', cost: 1, name: '番兵' },
      { position: 'SB', cost: 1.5, name: '攻撃右翼' },
      { position: 'SB', cost: 1, name: '堅守左翼' },
      { position: 'VO', cost: 1.5, name: '闘犬' },
      { position: 'MF', cost: 2, name: '将軍' },
      { position: 'OM', cost: 1.5, name: '閃光' },
      { position: 'FW', cost: 1.5, name: '爆撃機' },
      { position: 'FW', cost: 1, name: '突撃兵' },
    ], // 合計 15.5
  },
  // GR3 — イタリア風 (3-6-1)
  {
    id: 'gr3_italia',
    name: 'アズーリ GR3',
    era: 3,
    formation: '3-6-1',
    emoji: '\u{1F1EE}\u{1F1F9}',
    pieces: [
      { position: 'GK', cost: 2, name: '聖壁' },
      { position: 'DF', cost: 2, name: '岩盤' },
      { position: 'DF', cost: 1.5, name: '統率者' },
      { position: 'DF', cost: 1.5, name: '鎖' },
      { position: 'SB', cost: 1, name: '駆上右' },
      { position: 'SB', cost: 1, name: '駆上左' },
      { position: 'VO', cost: 1.5, name: '盾' },
      { position: 'MF', cost: 1.5, name: '建築家' },
      { position: 'OM', cost: 1, name: '技巧師' },
      { position: 'WG', cost: 1, name: '翼' },
      { position: 'FW', cost: 2, name: '獅子王' },
    ], // 合計 16
  },
  // GR4 — スペイン風 (4-3-3)
  {
    id: 'gr4_espana',
    name: 'ラ・ロハ GR4',
    era: 4,
    formation: '4-3-3',
    emoji: '\u{1F1EA}\u{1F1F8}',
    pieces: [
      { position: 'GK', cost: 1, name: '守り神' },
      { position: 'DF', cost: 1, name: '紳士' },
      { position: 'DF', cost: 1.5, name: '巨壁' },
      { position: 'SB', cost: 1.5, name: '翼衛右' },
      { position: 'SB', cost: 1, name: '翼衛左' },
      { position: 'MF', cost: 2.5, name: '魔法使い' },
      { position: 'MF', cost: 1.5, name: '心臓' },
      { position: 'VO', cost: 1.5, name: '破壊王' },
      { position: 'WG', cost: 1.5, name: '旋風' },
      { position: 'WG', cost: 1, name: '矢' },
      { position: 'FW', cost: 2, name: '闘牛士' },
    ], // 合計 16
  },
  // GR5 — イングランド風 (4-4-2)
  {
    id: 'gr5_england',
    name: 'スリーライオンズ GR5',
    era: 5,
    formation: '4-4-2',
    emoji: '\u{1F1EC}\u{1F1E7}',
    pieces: [
      { position: 'GK', cost: 1, name: '猫' },
      { position: 'DF', cost: 1.5, name: '壁' },
      { position: 'DF', cost: 1.5, name: '盾' },
      { position: 'SB', cost: 1, name: '突進右' },
      { position: 'SB', cost: 1.5, name: '突進左' },
      { position: 'MF', cost: 2, name: '機関車' },
      { position: 'VO', cost: 1.5, name: '番犬' },
      { position: 'WG', cost: 1.5, name: '弾丸' },
      { position: 'WG', cost: 1, name: '風車' },
      { position: 'FW', cost: 2, name: '狙撃手' },
      { position: 'FW', cost: 1.5, name: '頭突王' },
    ], // 合計 16
  },
  // GR6 — フランス風 (4-2-3-1)
  {
    id: 'gr6_france',
    name: 'レ・ブルー GR6',
    era: 6,
    formation: '4-2-3-1',
    emoji: '\u{1F1EB}\u{1F1F7}',
    pieces: [
      { position: 'GK', cost: 1, name: '城門' },
      { position: 'DF', cost: 1.5, name: '城壁' },
      { position: 'DF', cost: 1, name: '歩哨' },
      { position: 'SB', cost: 1.5, name: '騎士右' },
      { position: 'SB', cost: 1, name: '騎士左' },
      { position: 'VO', cost: 2, name: '将軍' },
      { position: 'VO', cost: 1.5, name: '副将' },
      { position: 'OM', cost: 2, name: '天才' },
      { position: 'WG', cost: 1.5, name: '疾風' },
      { position: 'WG', cost: 1, name: '稲妻' },
      { position: 'FW', cost: 2, name: '皇帝' },
    ], // 合計 16
  },
  // GR7 — 日本風 (3-4-3)
  {
    id: 'gr7_japan',
    name: 'サムライブルー GR7',
    era: 7,
    formation: '3-4-3',
    emoji: '\u{1F1EF}\u{1F1F5}',
    pieces: [
      { position: 'GK', cost: 1, name: '守護者' },
      { position: 'DF', cost: 1.5, name: '武士' },
      { position: 'DF', cost: 1, name: '忍' },
      { position: 'DF', cost: 1, name: '砦' },
      { position: 'MF', cost: 2, name: '軍師' },
      { position: 'VO', cost: 1.5, name: '猛将' },
      { position: 'SB', cost: 1.5, name: '飛脚右' },
      { position: 'SB', cost: 1, name: '飛脚左' },
      { position: 'WG', cost: 1.5, name: '隼' },
      { position: 'FW', cost: 2, name: '大砲' },
      { position: 'FW', cost: 2, name: '剣豪' },
    ], // 合計 16
  },
];
