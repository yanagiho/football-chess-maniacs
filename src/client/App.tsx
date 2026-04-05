// ============================================================
// App.tsx — アプリケーションルート
// ページ遷移管理。ゲームモード追跡。
// ============================================================

import React, { useState, useCallback } from 'react';
import type { Page, GameMode } from './types';

import Title from './pages/Title';
import ModeSelect from './pages/ModeSelect';
import TeamSelect from './pages/TeamSelect';
import Formation from './pages/Formation';
import Matching from './pages/Matching';
import Battle from './pages/Battle';
import HalfTime from './pages/HalfTime';
import Result from './pages/Result';
import Replay from './pages/Replay';

export default function App() {
  const [page, setPage] = useState<Page>('title');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('com');

  const navigate = useCallback((p: Page) => setPage(p), []);

  const handleSelectMode = useCallback((mode: GameMode) => {
    setGameMode(mode);
  }, []);

  const handleMatchFound = useCallback((id: string) => {
    console.log('[App] matchFound:', id, '→ navigating to battle');
    setMatchId(id);
    setPage('battle');
  }, []);

  return (
    <>
      {/* グローバルCSS アニメーション */}
      <style>{`
        @keyframes piecePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes urgentBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        {page === 'title' && <Title onNavigate={navigate} />}
        {page === 'modeSelect' && (
          <ModeSelect onNavigate={navigate} onSelectMode={handleSelectMode} />
        )}
        {page === 'teamSelect' && <TeamSelect onNavigate={navigate} />}
        {page === 'formation' && <Formation onNavigate={navigate} />}
        {page === 'matching' && (
          <Matching
            onNavigate={navigate}
            onMatchFound={handleMatchFound}
            gameMode={gameMode}
          />
        )}
        {page === 'battle' && (
          <Battle
            onNavigate={navigate}
            matchId={matchId ?? undefined}
            gameMode={gameMode}
          />
        )}
        {page === 'halfTime' && (
          <HalfTime
            scoreHome={0}
            scoreAway={0}
            onNavigate={navigate}
            onReady={() => navigate('battle')}
          />
        )}
        {page === 'result' && (
          <Result
            scoreHome={0}
            scoreAway={0}
            myTeam="home"
            reason="completed"
            onNavigate={navigate}
          />
        )}
        {page === 'replay' && (
          <Replay onNavigate={navigate} matchId={matchId ?? undefined} />
        )}
      </div>
    </>
  );
}
