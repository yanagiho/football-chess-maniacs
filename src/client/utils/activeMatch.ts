// ============================================================
// activeMatch.ts — 進行中オンラインマッチのタブ内永続化
// リロード後の試合復帰導線（outgame_plan_v2 §7）用。
// sessionStorage（タブ単位スコープ）を使い、別タブからの二重参加を防ぐ。
// 認証はtokenStore(localStorage)のJWTを使うため、ここにはトークンを保存しない。
// ============================================================

import type { Team } from '../types';

export interface ActiveMatchInfo {
  matchId: string;
  team: Team;
  gameMode: 'ranked' | 'casual';
  savedAt: number;
}

const KEY = 'fcms_active_match';

/** COMセッションは復帰対象外（クライアント内完結 or comSessionToken認証のため） */
function isResumableMatchId(matchId: string): boolean {
  return !matchId.startsWith('com_') && !matchId.startsWith('gemma_com_');
}

export function saveActiveMatch(info: Omit<ActiveMatchInfo, 'savedAt'>): void {
  if (!isResumableMatchId(info.matchId)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...info, savedAt: Date.now() }));
  } catch { /* ignore */ }
}

export function loadActiveMatch(): ActiveMatchInfo | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveMatchInfo>;
    if (
      typeof parsed.matchId !== 'string' || parsed.matchId.length === 0 ||
      (parsed.team !== 'home' && parsed.team !== 'away') ||
      (parsed.gameMode !== 'ranked' && parsed.gameMode !== 'casual') ||
      !isResumableMatchId(parsed.matchId)
    ) {
      clearActiveMatch();
      return null;
    }
    return parsed as ActiveMatchInfo;
  } catch {
    clearActiveMatch();
    return null;
  }
}

export function clearActiveMatch(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
