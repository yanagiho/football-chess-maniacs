// ============================================================
// lastSetup.ts — 前回の対戦設定の永続化（速い層 §1.3）
// モード・難易度・編成・チーム識別情報を localStorage に記憶し、
// マイページ（Title.tsx）の自チームカード表示に使う。
// ============================================================

import type { GameMode, ComDifficulty, FormationData, TeamOrigin } from '../types';
import { t } from '../i18n';

export interface LastSetup {
  gameMode: GameMode;
  comDifficulty: ComDifficulty;
  formationData: FormationData | null;
  /** 自チームカード表示用（formationData.teamName/teamEmoji/origin のスナップショット） */
  teamName?: string;
  teamEmoji?: string;
  origin?: TeamOrigin;
}

const STORAGE_KEY = 'fcms_last_setup';

/** チーム名の表示用フォールバック（未設定時は「マイチーム」） */
export function resolveTeamName(name?: string): string {
  return name && name.trim().length > 0 ? name : t('team.default_name');
}

const DEFAULT_TEAM_EMOJI = '⚽';

export function loadLastSetup(): LastSetup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.gameMode !== 'string') return null;
    return {
      gameMode: parsed.gameMode,
      comDifficulty: parsed.comDifficulty ?? 'regular',
      formationData: parsed.formationData ?? null,
      teamName: parsed.teamName ?? parsed.formationData?.teamName,
      teamEmoji: parsed.teamEmoji ?? parsed.formationData?.teamEmoji ?? DEFAULT_TEAM_EMOJI,
      origin: parsed.origin ?? parsed.formationData?.origin ?? 'custom',
    };
  } catch {
    return null;
  }
}

export function saveLastSetup(setup: LastSetup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch { /* ignore */ }
}
