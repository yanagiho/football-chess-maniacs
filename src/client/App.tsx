// ============================================================
// App.tsx — アプリケーションルート
// ページ遷移管理。ゲームモード追跡。
// ============================================================

import React, { useState, useCallback } from 'react';
import type { Page, GameMode, Team, FormationData, ComDifficulty, MatchEndData, MatchStats, MvpInfo } from './types';

import { SettingsProvider } from './contexts/SettingsContext';

import Title from './pages/Title';
import ModeSelect from './pages/ModeSelect';
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
import FriendMatchScreen from './screens/FriendMatchScreen';
import PresetTeamsScreen from './screens/PresetTeamsScreen';
import ReplayScreen from './screens/ReplayScreen';

import type { PresetTeam } from '../data/presetTeams';
import type { PieceData, GameEvent } from './types';
import { MAX_ROW } from './types';
import { loadLastSetup, saveLastSetup, type LastSetup } from './utils/lastSetup';
import { useLocale } from './i18n/useLocale';

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
  useLocale(); // ロケール変更時にルートから再描画し、全画面の t()/tn() 表示を更新する

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

  // 前回の対戦設定（速い層）。タイトルの「前回の編成で対戦」で復元
  const [lastSetup, setLastSetup] = useState<LastSetup | null>(() => loadLastSetup());

  const navigate = useCallback((p: Page) => setPage(p), []);

  // マッチング開始の共通処理: 状態反映 + 前回設定の永続化 + 遷移
  const startMatch = useCallback(
    (mode: GameMode, difficulty: ComDifficulty, formation: FormationData | null) => {
      setGameMode(mode);
      setComDifficulty(difficulty);
      setFormationData(formation);
      const setup: LastSetup = { gameMode: mode, comDifficulty: difficulty, formationData: formation };
      saveLastSetup(setup);
      setLastSetup(setup);
      setPage('matching');
    },
    [],
  );

  // タイトル「前回の編成で対戦」: 前回設定でマッチングへ直行
  const handleQuickMatch = useCallback(() => {
    if (!lastSetup) return;
    startMatch(lastSetup.gameMode, lastSetup.comDifficulty, lastSetup.formationData);
  }, [lastSetup, startMatch]);

  // 対戦セットアップ「編成して開始」: モード/難易度を保持して編成画面へ
  const handleStartWithFormation = useCallback((mode: GameMode, difficulty: ComDifficulty) => {
    setGameMode(mode);
    setComDifficulty(difficulty);
    setPage('formation');
  }, []);

  // 対戦セットアップ「この設定で開始」/「観戦を開始」: 既存（前回）編成で直行
  const handleStartNow = useCallback(
    (mode: GameMode, difficulty: ComDifficulty) => {
      startMatch(mode, difficulty, mode === 'comVsCom' ? null : formationData);
    },
    [startMatch, formationData],
  );

  // 編成画面の「マッチング開始」: 編成を保存してマッチングへ
  const handleFormationConfirm = useCallback(
    (data: FormationData) => {
      startMatch(gameMode, comDifficulty, data);
    },
    [startMatch, gameMode, comDifficulty],
  );

  // サーバーサイドCOM用のトークン（POST /match/com が返すuserId）
  const [comAuthToken, setComAuthToken] = useState<string | null>(null);

  const handleMatchFound = useCallback((id: string, team?: Team, serverComToken?: string) => {
    setMatchId(id);
    setMyTeam(team ?? 'home');
    if (serverComToken) {
      setComAuthToken(serverComToken);
    }
    setPage('battle');
  }, []);

  const handleMatchEnd = useCallback((data: MatchEndData) => {
    setMatchEndData(data);
    setPage('result');
  }, []);

  const handleSelectPresetTeam = useCallback((team: PresetTeam) => {
    const formation: FormationData = {
      starters: team.pieces.map((piece) => ({
        id: `preset-${team.id}-${piece.pieceId}`,
        position: piece.position,
        cost: piece.cost,
        col: piece.col,
        row: MAX_ROW - piece.row,
      })),
      bench: [],
    };
    startMatch('com', comDifficulty, formation);
  }, [startMatch, comDifficulty]);

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
        {page === 'title' && (
          <Title onNavigate={navigate} lastSetup={lastSetup} onQuickMatch={handleQuickMatch} />
        )}
        {page === 'modeSelect' && (
          <ModeSelect
            initialMode={gameMode}
            initialDifficulty={comDifficulty}
            onStartWithFormation={handleStartWithFormation}
            onStartNow={handleStartNow}
            onBack={() => navigate('title')}
          />
        )}
        {page === 'formation' && (
          <Formation onNavigate={navigate} onFormationConfirm={handleFormationConfirm} />
        )}
        {page === 'matching' && (
          <Matching
            onNavigate={navigate}
            onMatchFound={handleMatchFound}
            gameMode={gameMode}
            authToken={authToken}
            comDifficulty={comDifficulty}
          />
        )}
        {page === 'battle' && (
          <Battle
            onNavigate={navigate}
            matchId={matchId ?? undefined}
            gameMode={gameMode}
            authToken={comAuthToken ?? authToken}
            myTeam={myTeam}
            formationData={formationData}
            onMatchEnd={handleMatchEnd}
            comDifficulty={comDifficulty}
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
        {page === 'shop' && <ShopScreen onNavigate={navigate} authToken={authToken} />}
        {page === 'ranking' && <RankingScreen onNavigate={navigate} authToken={authToken} />}
        {page === 'collection' && <CollectionScreen onNavigate={navigate} authToken={authToken} />}
        {page === 'profile' && <ProfileScreen onNavigate={navigate} />}
        {page === 'settings' && <SettingsScreen onNavigate={navigate} />}
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
