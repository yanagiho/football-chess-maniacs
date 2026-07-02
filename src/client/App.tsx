// ============================================================
// App.tsx — アプリケーションルート
// ページ遷移管理。ゲームモード追跡。
// ============================================================

import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import type { Page, GameMode, Team, FormationData, ComDifficulty, MatchEndData, MatchStats, MvpInfo, TurnSnapshot } from './types';

import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// 初回描画に必要なタイトル/モード選択は同期import。
// それ以外（特に重い Battle + エンジン/ボード/ミニゲーム）は遅延ロードして初期バンドルを削減。
import Title from './pages/Title';
import ModeSelect from './pages/ModeSelect';

const Formation = lazy(() => import('./pages/Formation'));
const Matching = lazy(() => import('./pages/Matching'));
const Battle = lazy(() => import('./pages/Battle'));
const HalfTime = lazy(() => import('./pages/HalfTime'));
const Replay = lazy(() => import('./pages/Replay'));

const ResultScreen = lazy(() => import('./screens/ResultScreen'));
const ShopScreen = lazy(() => import('./screens/ShopScreen'));
const RankingScreen = lazy(() => import('./screens/RankingScreen'));
const CollectionScreen = lazy(() => import('./screens/CollectionScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'));
const FriendMatchScreen = lazy(() => import('./screens/FriendMatchScreen'));
const PresetTeamsScreen = lazy(() => import('./screens/PresetTeamsScreen'));
const ReplayScreen = lazy(() => import('./screens/ReplayScreen'));

import type { PresetTeam } from '../data/presetTeams';
import { pickNpcOpponent, pickRandomNpcTeam } from '../data/presetTeams';
import { MAX_ROW } from './types';
import { loadLastSetup, saveLastSetup, type LastSetup } from './utils/lastSetup';
import { saveActiveMatch, loadActiveMatch, clearActiveMatch, type ActiveMatchInfo } from './utils/activeMatch';
import { apiUrl } from './types';
import { useLocale } from './i18n/useLocale';
import { t } from './i18n';

/** PresetTeam（NPC_TEAMS由来）をFormationDataへ変換する（自チーム割当・プリセット選択の両方で使用） */
function presetTeamToFormationData(team: PresetTeam): FormationData {
  return {
    starters: team.pieces.map((piece) => ({
      id: `preset-${team.id}-${piece.pieceId}`,
      position: piece.position,
      cost: piece.cost,
      col: piece.col,
      row: MAX_ROW - piece.row,
    })),
    bench: [],
    teamName: team.name,
    teamEmoji: team.emoji,
    origin: 'preset',
  };
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
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  useLocale(); // ロケール変更時にルートから再描画し、全画面の t()/tn() 表示を更新する

  // JWT認証トークン: AuthProvider が Universo SSO fragment 消費 / ログインモーダル / localStorage を一元管理する
  const { accessToken: authToken, isLoggedIn, requireLogin } = useAuth();

  const [page, setPage] = useState<Page>('title');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('com');
  const [myTeam, setMyTeam] = useState<Team>('home');
  const [formationData, setFormationData] = useState<FormationData | null>(null);
  const [comDifficulty, setComDifficulty] = useState<ComDifficulty>('regular');
  // COM対戦の対戦相手（NPC_TEAMSから選出）。startMatch呼び出し毎にCOM系モードのみ再抽選
  const [comOpponent, setComOpponent] = useState<PresetTeam | null>(null);
  // ModeSelect「編成して開始」でプレビューされた相手（編成画面を経由してもマッチング相手が変わらないよう保持）
  const [pendingOpponent, setPendingOpponent] = useState<PresetTeam | null>(null);

  // 試合結果データ（Battle → Result 引継ぎ）
  const [matchEndData, setMatchEndData] = useState<MatchEndData>({
    scoreHome: 0, scoreAway: 0, myTeam: 'home', reason: 'completed',
    stats: emptyStats(), mvp: null,
  });
  // リプレイデータ（C9）
  const [replayTurns, setReplayTurns] = useState<TurnSnapshot[]>([]);

  // 前回の対戦設定（速い層）。タイトルの「前回の編成で対戦」で復元
  const [lastSetup, setLastSetup] = useState<LastSetup | null>(() => loadLastSetup());
  // Phase5 T11: 未編成プレイヤーが「今すぐ対戦」でNPCチームを割り当てられた試合かどうか（リザルト画面の編成誘導バナー用）
  const [quickMatchBanner, setQuickMatchBanner] = useState(false);

  const navigate = useCallback((p: Page) => setPage(p), []);

  // マッチング開始の共通処理: 状態反映 + 前回設定の永続化 + 遷移
  // opponent省略時（前回設定の復元等）はCOM系モードのみ新規抽選。ModeSelectでプレビュー済みの場合はそのまま引き継ぐ
  const startMatch = useCallback(
    (mode: GameMode, difficulty: ComDifficulty, formation: FormationData | null, opponent?: PresetTeam | null, unformedQuickMatch = false) => {
      setGameMode(mode);
      setComDifficulty(difficulty);
      setFormationData(formation);
      setQuickMatchBanner(unformedQuickMatch);
      setComOpponent(
        opponent !== undefined
          ? opponent
          : (mode === 'com' || mode === 'comVsCom') ? pickNpcOpponent(difficulty) : null,
      );
      // T11: 未編成プレイヤーへの自動割当チームは「編成済み」扱いにしない
      // （lastSetupを更新すると次回以降ずっと同じチーム固定になり、毎回ランダムという設計意図に反するため）
      if (!unformedQuickMatch) {
        const setup: LastSetup = {
          gameMode: mode,
          comDifficulty: difficulty,
          formationData: formation,
          teamName: formation?.teamName,
          teamEmoji: formation?.teamEmoji,
          origin: formation?.origin ?? 'custom',
        };
        saveLastSetup(setup);
        setLastSetup(setup);
      }
      setPage('matching');
    },
    [],
  );

  // 対戦セットアップ「編成して開始」: モード/難易度/相手プレビューを保持して編成画面へ
  const handleStartWithFormation = useCallback((mode: GameMode, difficulty: ComDifficulty, opponent?: PresetTeam | null) => {
    setGameMode(mode);
    setComDifficulty(difficulty);
    setPendingOpponent(opponent ?? null);
    setPage('formation');
  }, []);

  // 対戦セットアップ「この設定で開始」/「観戦を開始」: 既存（前回）編成で直行
  const handleStartNow = useCallback(
    (mode: GameMode, difficulty: ComDifficulty, opponent?: PresetTeam | null) => {
      startMatch(mode, difficulty, mode === 'comVsCom' ? null : formationData, opponent);
    },
    [startMatch, formationData],
  );

  // 編成画面の「マッチング開始」: 編成を保存してマッチングへ（ModeSelectでプレビュー済みの相手を引き継ぐ）
  const handleFormationConfirm = useCallback(
    (data: FormationData) => {
      startMatch(gameMode, comDifficulty, data, pendingOpponent);
    },
    [startMatch, gameMode, comDifficulty, pendingOpponent],
  );

  // T11/T12: マイページの「COM対戦」ワンクリックボタン。編成済みなら前回の編成でそのまま対戦、
  // 未編成なら顔のあるNPCチームを毎回ランダムに1つ自チームとして割り当てて対戦へ直行する。
  // T12でのバグ修正: モードは常に'com'固定（lastSetup.gameModeがオンライン系だと、
  // ワンクリックのはずが待機マッチングに化けてしまう不具合があったため引き継がない）
  const handleQuickMatch = useCallback(() => {
    if (lastSetup?.formationData) {
      startMatch('com', lastSetup.comDifficulty, lastSetup.formationData);
    } else {
      const opponent = pickNpcOpponent(comDifficulty);
      const myTeamPreset = pickRandomNpcTeam(opponent.id);
      startMatch('com', comDifficulty, presetTeamToFormationData(myTeamPreset), opponent, true);
    }
  }, [lastSetup, comDifficulty, startMatch]);

  // T12: マイページの「ランダム対戦」ワンクリックボタン。対戦タイプ選択を経由せずオンライン(カジュアル)へ直行する。
  // 未ログイン時はModeSelectのオンライン導線と同様にログインモーダルへ誘導する
  const handleQuickOnlineMatch = useCallback(() => {
    if (!isLoggedIn) {
      requireLogin(t('modeselect.online_type'));
      return;
    }
    startMatch('casual', comDifficulty, formationData);
  }, [isLoggedIn, requireLogin, startMatch, comDifficulty, formationData]);

  // サーバーサイドCOM用のトークン（POST /match/com が返すuserId）
  const [comAuthToken, setComAuthToken] = useState<string | null>(null);

  // handleMatchFound（deps空）から最新gameModeを読むためのref
  const gameModeRef = useRef(gameMode);
  gameModeRef.current = gameMode;

  // ── リロード復帰導線（outgame_plan_v2 §7）──
  // 起動時にsessionStorageの進行中マッチを確認し、サーバーで生存確認できたらバナー表示。
  // 終了済み/参加者不一致なら黙って破棄する
  const [resumableMatch, setResumableMatch] = useState<ActiveMatchInfo | null>(null);
  useEffect(() => {
    if (!authToken) return;
    const saved = loadActiveMatch();
    if (!saved) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl(`/match/${saved.matchId}`), {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const body = await res.json() as { status?: string };
          if (body.status === 'playing') {
            setResumableMatch(saved);
            return;
          }
        }
        // 終了済み・404等は黙って破棄
        clearActiveMatch();
      } catch {
        // 生存確認に失敗した場合は破棄せず保持（次回起動で再確認）
      }
    })();
    return () => { cancelled = true; };
  }, [authToken]);

  const handleResumeMatch = useCallback(() => {
    if (!resumableMatch) return;
    setGameMode(resumableMatch.gameMode);
    setComOpponent(null);
    setMatchId(resumableMatch.matchId);
    setMyTeam(resumableMatch.team);
    setResumableMatch(null);
    setPage('battle'); // Battle側のWS接続→サーバーのRECONNECTフローで盤面復元される
  }, [resumableMatch]);

  const handleAbandonMatch = useCallback(() => {
    if (!resumableMatch) return;
    // サーバーへ離脱通知（即時不戦敗処理。失敗してもDISCONNECT_GRACE_MSで同じ結果になる）
    if (authToken) {
      fetch(apiUrl(`/match/${resumableMatch.matchId}/leave`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
    clearActiveMatch();
    setResumableMatch(null);
  }, [resumableMatch, authToken]);

  const handleMatchFound = useCallback((id: string, team?: Team, serverComToken?: string) => {
    setMatchId(id);
    setMyTeam(team ?? 'home');
    if (serverComToken) {
      setComAuthToken(serverComToken);
    }
    // リロード復帰用に進行中マッチを保存（COMセッションはヘルパー側で除外される）。
    // friend_はレーティング非対象のcasual扱い
    saveActiveMatch({
      matchId: id,
      team: team ?? 'home',
      gameMode: id.startsWith('friend_') || gameModeRef.current !== 'ranked' ? 'casual' : 'ranked',
    });
    setPage('battle');
  }, []);

  // フレンド対戦の合流成立: レーティング非対象の通常オンライン試合として開始する
  const handleFriendMatchFound = useCallback((id: string, team?: Team) => {
    setGameMode('casual');
    setComOpponent(null);
    handleMatchFound(id, team);
  }, [handleMatchFound]);

  const handleMatchEnd = useCallback((data: MatchEndData) => {
    clearActiveMatch(); // リザルト到達 = 進行中マッチ終了
    setMatchEndData(data);
    setReplayTurns(data.replayTurns ?? []);
    setPage('result');
  }, []);

  const handleSelectPresetTeam = useCallback((team: PresetTeam) => {
    startMatch('com', comDifficulty, presetTeamToFormationData(team));
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
        <Suspense fallback={
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#44aa44',
              animation: 'spin 1s linear infinite',
            }} />
          </div>
        }>
        {page === 'title' && (
          <Title onNavigate={navigate} lastSetup={lastSetup} onQuickMatch={handleQuickMatch} onQuickOnlineMatch={handleQuickOnlineMatch} resumableMatch={resumableMatch} onResumeMatch={handleResumeMatch} onAbandonMatch={handleAbandonMatch} />
        )}
        {page === 'modeSelect' && (
          <ModeSelect
            initialMode={gameMode}
            initialDifficulty={comDifficulty}
            onStartWithFormation={handleStartWithFormation}
            onStartNow={handleStartNow}
            onNavigate={navigate}
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
            authToken={authToken ?? ''}
            comDifficulty={comDifficulty}
            opponent={comOpponent}
          />
        )}
        {page === 'battle' && (
          <Battle
            onNavigate={navigate}
            matchId={matchId ?? undefined}
            gameMode={gameMode}
            authToken={comAuthToken ?? authToken ?? undefined}
            myTeam={myTeam}
            formationData={formationData}
            onMatchEnd={handleMatchEnd}
            comDifficulty={comDifficulty}
            opponent={comOpponent}
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
            showFormationBanner={quickMatchBanner}
          />
        )}
        {page === 'replay' && (
          <Replay onNavigate={navigate} matchId={matchId ?? undefined} />
        )}
        {page === 'shop' && <ShopScreen onNavigate={navigate} authToken={authToken ?? undefined} />}
        {page === 'ranking' && <RankingScreen onNavigate={navigate} authToken={authToken ?? undefined} />}
        {page === 'collection' && <CollectionScreen onNavigate={navigate} authToken={authToken ?? undefined} />}
        {page === 'profile' && <ProfileScreen onNavigate={navigate} />}
        {page === 'settings' && <SettingsScreen onNavigate={navigate} />}
        {page === 'friendMatch' && (
          <FriendMatchScreen onNavigate={navigate} authToken={authToken ?? ''} onMatchFound={handleFriendMatchFound} />
        )}
        {page === 'presetTeams' && (
          <PresetTeamsScreen onNavigate={navigate} onSelectPresetTeam={handleSelectPresetTeam} />
        )}
        {page === 'replayViewer' && (
          <ReplayScreen onNavigate={navigate} turns={replayTurns} myTeam={matchEndData.myTeam} />
        )}
        </Suspense>
      </div>
    </SettingsProvider>
  );
}
