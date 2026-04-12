// ============================================================
// App.tsx — アプリケーションルート
// ページ遷移管理。ゲームモード追跡。
// ============================================================

import React, { useState, useCallback } from 'react';
import type { Page, GameMode, Team, FormationData, ComDifficulty, MatchEndData, MatchStats, MvpInfo } from './types';

import { SettingsProvider } from './contexts/SettingsContext';

import Title from './pages/Title';
import ModeSelect from './pages/ModeSelect';
import TeamSelect from './pages/TeamSelect';
import Formation from './pages/Formation';
import Matching from './pages/Matching';
import Battle from './pages/Battle';
import HalfTime from './pages/HalfTime';
import Replay from './pages/Replay';

import ResultScreen from './screens/ResultScreen';
import ShopScreen from './screens/ShopScreen';
import RankingScreen from './screens/RankingScreen';
import CollectionScreen from './screens/CollectionScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import DifficultySelectScreen from './screens/DifficultySelectScreen';
import FriendMatchScreen from './screens/FriendMatchScreen';
import PresetTeamsScreen from './screens/PresetTeamsScreen';
import ReplayScreen from './screens/ReplayScreen';

import type { PresetTeam } from '../data/presetTeams';
import type { PieceData, GameEvent } from './types';

/** リプレイ用ターンスナップショット */
interface TurnSnapshot {
  turn: number;
  pieces: PieceData[];
  events: GameEvent[];
  scoreHome: number;
  scoreAway: number;
}

/** デフォルトの空スタッツ */
function emptyStats(): MatchStats {
  return {
    possession: { home: 50, away: 50 },
    shots: { home: 0, away: 0 },
    shotsOnTarget: { home: 0, away: 0 },
    passesAttempted: { home: 0, away: 0 },
    passesCompleted: { home: 0, away: 0 },
    tackles: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    offsides: { home: 0, away: 0 },
    cornerKicks: { home: 0, away: 0 },
  };
}

export default function App() {
  const [page, setPage] = useState<Page>('title');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('com');
  const [myTeam, setMyTeam] = useState<Team>('home');
  const [formationData, setFormationData] = useState<FormationData | null>(null);
  const [comDifficulty, setComDifficulty] = useState<ComDifficulty>('regular');
  // JWT認証トークン（ログインフロー実装後にセット。localStorageフォールバック）
  const [authToken] = useState<string>(() => localStorage.getItem('fcms_token') ?? '');

  // 試合結果データ（Battle → Result 引継ぎ）
  const [matchEndData, setMatchEndData] = useState<MatchEndData>({
    scoreHome: 0, scoreAway: 0, myTeam: 'home', reason: 'completed',
    stats: emptyStats(), mvp: null,
  });
  // リプレイデータ（C9）
  const [replayTurns, setReplayTurns] = useState<TurnSnapshot[]>([]);

  const navigate = useCallback((p: Page) => setPage(p), []);

  const handleSelectMode = useCallback((mode: GameMode) => {
    setGameMode(mode);
  }, []);

  const handleFormationConfirm = useCallback((data: FormationData) => {
    setFormationData(data);
    setPage('matching');
  }, []);

  const handleMatchFound = useCallback((id: string, team?: Team) => {
    setMatchId(id);
    setMyTeam(team ?? 'home');
    setPage('battle');
  }, []);

  const handleMatchEnd = useCallback((data: MatchEndData) => {
    setMatchEndData(data);
    setPage('result');
  }, []);

  const handleSelectDifficulty = useCallback((diff: ComDifficulty) => {
    setComDifficulty(diff);
  }, []);

  const handleSelectPresetTeam = useCallback((_team: PresetTeam) => {
    // プリセットチームのコマをフォーメーションデータに変換
    // Formation画面で自動配置するため、ここでは遷移のみ
    // 将来: formationData にプリセットを注入
  }, []);

  // ModeSelect からの遷移: COM時は難易度選択を挟む
  // mode引数で選択されたモードを直接受け取り、state更新のタイミングに依存しない
  const handleModeSelectNavigate = useCallback((p: Page, mode?: GameMode) => {
    if (p === 'teamSelect' && mode === 'com') {
      setPage('difficultySelect');
    } else {
      setPage(p);
    }
  }, []);

  return (
    <SettingsProvider>
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
          <ModeSelect onNavigate={handleModeSelectNavigate} onSelectMode={handleSelectMode} />
        )}
        {page === 'teamSelect' && <TeamSelect onNavigate={navigate} />}
        {page === 'formation' && (
          <Formation onNavigate={navigate} onFormationConfirm={handleFormationConfirm} />
        )}
        {page === 'matching' && (
          <Matching
            onNavigate={navigate}
            onMatchFound={handleMatchFound}
            gameMode={gameMode}
            authToken={authToken}
          />
        )}
        {page === 'battle' && (
          <Battle
            onNavigate={navigate}
            matchId={matchId ?? undefined}
            gameMode={gameMode}
            authToken={authToken}
            myTeam={myTeam}
            formationData={formationData}
            onMatchEnd={handleMatchEnd}
          />
        )}
        {page === 'halfTime' && (
          <HalfTime
            scoreHome={matchEndData.scoreHome}
            scoreAway={matchEndData.scoreAway}
            onNavigate={navigate}
            onReady={() => navigate('battle')}
          />
        )}
        {page === 'result' && (
          <ResultScreen
            scoreHome={matchEndData.scoreHome}
            scoreAway={matchEndData.scoreAway}
            myTeam={matchEndData.myTeam}
            reason={matchEndData.reason}
            stats={matchEndData.stats}
            mvp={matchEndData.mvp}
            gameMode={gameMode}
            onNavigate={navigate}
          />
        )}
        {page === 'replay' && (
          <Replay onNavigate={navigate} matchId={matchId ?? undefined} />
        )}
        {page === 'shop' && <ShopScreen onNavigate={navigate} />}
        {page === 'ranking' && <RankingScreen onNavigate={navigate} />}
        {page === 'collection' && <CollectionScreen onNavigate={navigate} />}
        {page === 'profile' && <ProfileScreen onNavigate={navigate} />}
        {page === 'settings' && <SettingsScreen onNavigate={navigate} />}
        {page === 'difficultySelect' && (
          <DifficultySelectScreen onNavigate={navigate} onSelectDifficulty={handleSelectDifficulty} />
        )}
        {page === 'friendMatch' && <FriendMatchScreen onNavigate={navigate} />}
        {page === 'presetTeams' && (
          <PresetTeamsScreen onNavigate={navigate} onSelectPresetTeam={handleSelectPresetTeam} />
        )}
        {page === 'replayViewer' && (
          <ReplayScreen onNavigate={navigate} turns={replayTurns} myTeam={matchEndData.myTeam} />
        )}
      </div>
    </SettingsProvider>
  );
}
