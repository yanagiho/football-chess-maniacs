// @vitest-environment jsdom
// ============================================================
// activeMatch.test.ts — リロード復帰用の進行中マッチ永続化
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { saveActiveMatch, loadActiveMatch, clearActiveMatch } from '../activeMatch';

describe('activeMatch (sessionStorage)', () => {
  beforeEach(() => sessionStorage.clear());

  it('save → load で保存内容が復元される', () => {
    saveActiveMatch({ matchId: 'casual_abc', team: 'away', gameMode: 'casual' });
    const loaded = loadActiveMatch();
    expect(loaded?.matchId).toBe('casual_abc');
    expect(loaded?.team).toBe('away');
    expect(loaded?.gameMode).toBe('casual');
    expect(typeof loaded?.savedAt).toBe('number');
  });

  it('clear で消える', () => {
    saveActiveMatch({ matchId: 'm_abc', team: 'home', gameMode: 'ranked' });
    clearActiveMatch();
    expect(loadActiveMatch()).toBeNull();
  });

  it('COMセッション（com_/gemma_com_）は保存されない', () => {
    saveActiveMatch({ matchId: 'com_123', team: 'home', gameMode: 'casual' });
    expect(loadActiveMatch()).toBeNull();
    saveActiveMatch({ matchId: 'gemma_com_123', team: 'home', gameMode: 'casual' });
    expect(loadActiveMatch()).toBeNull();
  });

  it('壊れたJSON・不正な形は破棄してnull', () => {
    sessionStorage.setItem('fcms_active_match', '{broken');
    expect(loadActiveMatch()).toBeNull();
    expect(sessionStorage.getItem('fcms_active_match')).toBeNull();

    sessionStorage.setItem('fcms_active_match', JSON.stringify({ matchId: 'm_x', team: 'north' }));
    expect(loadActiveMatch()).toBeNull();
  });

  it('friend_マッチも復帰対象', () => {
    saveActiveMatch({ matchId: 'friend_xyz', team: 'away', gameMode: 'casual' });
    expect(loadActiveMatch()?.matchId).toBe('friend_xyz');
  });
});
