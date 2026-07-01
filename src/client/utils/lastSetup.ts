// ============================================================
// lastSetup.ts — 前回の対戦設定の永続化（速い層 §1.3）
// モード・難易度・編成を localStorage に記憶し、
// タイトルの「前回の編成で対戦」でワンタップ復元する。
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

const MODE_KEYS: Record<GameMode, string> = {
  ranked: 'mode.ranked',
  casual: 'mode.casual',
  com: 'mode.com',
  comVsCom: 'mode.com_watch',
};

const DIFFICULTY_KEYS: Record<ComDifficulty, string> = {
  beginner: 'difficulty.beginner',
  regular: 'difficulty.regular',
  maniac: 'difficulty.maniac',
};

function modeLabel(m: GameMode): string {
  return t(MODE_KEYS[m]);
}

function difficultyLabel(d: ComDifficulty): string {
  return t(DIFFICULTY_KEYS[d]);
}

/** 「前回の編成で対戦」ボタンのサブラベル（例: "COM対戦 · レギュラー"） */
export function describeLastSetup(setup: LastSetup): string {
  const parts: string[] = [modeLabel(setup.gameMode)];
  if (setup.gameMode === 'com' || setup.gameMode === 'comVsCom') {
    parts.push(difficultyLabel(setup.comDifficulty));
  }
  return parts.join(' · ');
}
