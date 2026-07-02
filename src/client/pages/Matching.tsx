// ============================================================
// Matching.tsx — マッチング待機画面（§4-2）
// COM対戦: 即座にマッチング成立 → battle画面へ
// オンライン対戦: WebSocket接続 → キュー参加 → マッチ成立通知待ち
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiUrl, getWsBaseUrl, type Page, type GameMode, type Team, type MatchmakingWsMessage, type ComDifficulty } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { t } from '../i18n';
import type { PresetTeam } from '../../data/presetTeams';
import { resolveActiveTeamId } from '../utils/resolveActiveTeamId';

interface MatchingProps {
  onNavigate: (page: Page) => void;
  onMatchFound: (matchId: string, team?: Team, serverComToken?: string) => void;
  gameMode: GameMode;
  authToken: string;
  comDifficulty?: ComDifficulty;
  /** COM対戦の対戦相手（NPC_TEAMSから選出済み。COM対戦のみ渡される） */
  opponent?: PresetTeam | null;
}

export default function Matching({ onNavigate, onMatchFound, gameMode, authToken, comDifficulty = 'regular', opponent }: MatchingProps) {
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<'searching' | 'found' | 'com_suggested' | 'error'>('searching');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startTimeRef = useRef(Date.now());
  const matchFoundRef = useRef(false);
  const teamIdRef = useRef<string>('default'); // WS接続前に実teamIdを解決して格納

  // ── マッチメイキングWS メッセージ処理 ──
  const handleMmMessage = useCallback((msg: unknown) => {
    const data = msg as MatchmakingWsMessage;

    switch (data.type) {
      case 'MATCHMAKING_CONNECTED':
        // 接続成功 → キュー参加
        // rating はサーバーがD1の値で上書きするため申告値は無視される（詐称防止）。
        // teamId は接続前に解決済み（resolveActiveTeamId）。サーバーがD1から編成をロードする。
        wsSend({
          type: 'JOIN_QUEUE',
          rating: 0,
          teamId: teamIdRef.current,
          // モード別プール（casualはレーティング対象外）。サーバーは未指定をranked扱い
          mode: gameMode === 'casual' ? 'casual' : 'ranked',
        });
        break;

      case 'QUEUE_JOINED':
        break;

      case 'MATCH_FOUND':
        if (!matchFoundRef.current) {
          matchFoundRef.current = true;
          setStatus('found');
          onMatchFound(data.matchId, data.team);
        }
        break;

      case 'COM_SUGGESTED':
        setStatus('com_suggested');
        break;

      case 'ERROR':
        console.error('[Matching] WS error:', data.message);
        setErrorMsg(data.message);
        setStatus('error');
        break;
    }
  }, [onMatchFound]);

  // ── WebSocket接続（オンライン対戦用） ──
  const wsUrl = `${getWsBaseUrl()}/match/ws`;
  const { connect: wsConnect, disconnect: wsDisconnect, send: wsSend, status: wsStatus } = useWebSocket({
    url: wsUrl,
    token: authToken,
    onMessage: handleMmMessage,
    onDisconnect: () => {
      if (!matchFoundRef.current && status === 'searching') {
        // WS disconnected
      }
    },
    autoReconnect: true,
  });

  // ── オンライン対戦: WS接続開始 ──
  useEffect(() => {
    if (gameMode === 'com' || gameMode === 'comVsCom') return;
    if (!authToken) {
      setErrorMsg(t('matching.login_required'));
      setStatus('error');
      return;
    }

    let cancelled = false;
    (async () => {
      // WS接続前に編成teamIdを解決（JOIN_QUEUEで送る）
      teamIdRef.current = await resolveActiveTeamId(authToken);
      if (cancelled) return;
      wsConnect();
    })();
    return () => {
      cancelled = true;
      wsDisconnect();
    };
  }, [gameMode, authToken, wsConnect, wsDisconnect]);

  // ── COM対戦: 即座にマッチング成立 ──
  // VITE_USE_GEMMA=true の場合はサーバーサイドCOM（GameSession DO経由）
  // それ以外はクライアントサイドCOM（従来の即時マッチ）
  // refガードなし: React StrictModeの再マウントでもtimerが正常に動くようにする
  useEffect(() => {
    if (gameMode !== 'com' && gameMode !== 'comVsCom') return;

    const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
    const useGemma = viteEnv.VITE_USE_GEMMA === 'true' && gameMode !== 'comVsCom';

    if (useGemma) {
      // サーバーサイドCOM: GameSession DO を作成して接続
      let cancelled = false;
      let matched = false;
      (async () => {
        try {
          const res = await fetch(apiUrl('/match/com'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              comDifficulty,
              comEra: '現代',
            }),
          });
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
          const data = await res.json() as { matchId: string; userId: string; team: 'home' | 'away'; token: string };
          if (cancelled || matched) return;
          matched = true;
          setStatus('found');
          onMatchFound(data.matchId, data.team, data.token);
        } catch (e) {
          console.warn('[Matching] Server-side COM creation failed, falling back to client-side:', e);
          if (cancelled || matched) return;
          matched = true;
          const comMatchId = `com_${Date.now()}`;
          setStatus('found');
          onMatchFound(comMatchId);
        }
      })();

      return () => { cancelled = true; };
    } else {
      // クライアントサイドCOM（従来）: 1秒後に即マッチ
      const timer = setTimeout(() => {
        const comMatchId = `com_${Date.now()}`;
        setStatus('found');
        onMatchFound(comMatchId);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [gameMode, onMatchFound, comDifficulty]);

  // ── オンライン対戦: 経過時間カウント ──
  useEffect(() => {
    if (gameMode === 'com' || gameMode === 'comVsCom') return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameMode]);

  // §4-2 30秒超でCOM提案（オンライン対戦のみ — サーバー側COM_SUGGESTEDのフォールバック）
  useEffect(() => {
    if (gameMode === 'com' || gameMode === 'comVsCom') return;
    if (elapsed >= 30 && status === 'searching') {
      setStatus('com_suggested');
    }
  }, [elapsed, status, gameMode]);

  // ── COM対戦 / COM観戦時は専用のUI ──
  if (gameMode === 'com' || gameMode === 'comVsCom') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 24,
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>{gameMode === 'comVsCom' ? t('mode.com_watch') : t('mode.com')}</h2>
        {opponent && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <span style={{ fontSize: 12, color: '#888' }}>{t('team.opponent_label')}</span>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: '#cc8800' }}>{opponent.emoji}</span>
            <span style={{ fontSize: 15, fontWeight: 'bold' }}>{opponent.name}</span>
            <span style={{ fontSize: 12, color: '#888' }}>{t('team.era_label', { era: opponent.era })}</span>
          </div>
        )}
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#44aa44',
          animation: 'spin 1s linear infinite',
        }} />
        <div style={{ fontSize: 14, color: '#aaa' }}>{t('matching.preparing')}</div>
      </div>
    );
  }

  // ── オンライン対戦のUI ──
  const phaseLabel = elapsed < 10
    ? t('matching.phase_same_region')
    : elapsed < 20
    ? t('matching.phase_expanding')
    : elapsed < 30
    ? t('matching.phase_cross_region')
    : t('matching.phase_com_suggest');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 24, padding: 20,
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>{t('matching.title')}</h2>

      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#44aa44',
        animation: 'spin 1s linear infinite',
      }} />

      <div style={{ fontSize: 14, color: '#aaa' }}>{phaseLabel}</div>

      <div style={{ fontSize: 28, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
      </div>

      <div style={{ fontSize: 12, color: '#666' }}>
        {elapsed < 10 ? '±200' : elapsed < 20 ? '±400' : t('matching.all_regions')}
        {wsStatus !== 'connected' && wsStatus !== 'disconnected' && (
          <span style={{ marginLeft: 8, color: '#888' }}>({wsStatus})</span>
        )}
      </div>

      {status === 'error' && errorMsg && (
        <div style={{
          padding: '12px 16px', background: 'rgba(200,50,50,0.15)',
          borderRadius: 8, color: '#f88', fontSize: 13, maxWidth: 300, textAlign: 'center',
        }}>
          {errorMsg}
        </div>
      )}

      {status === 'com_suggested' && (
        <div style={{
          padding: '16px 20px', background: 'rgba(255,255,255,0.05)',
          borderRadius: 12, textAlign: 'center', maxWidth: 300,
        }}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            {t('matching.no_opponent')}<br />{t('matching.start_com_confirm')}
          </div>
          <button
            onClick={() => {
              const comMatchId = `com_${Date.now()}`;
              onMatchFound(comMatchId);
            }}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: '#4488cc', color: '#fff', fontSize: 14,
              fontWeight: 'bold', cursor: 'pointer',
            }}
          >
            {t('matching.start_com')}
          </button>
        </div>
      )}

      <button
        onClick={() => onNavigate('modeSelect')}
        style={{
          marginTop: 16, padding: '8px 24px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          color: '#888', fontSize: 14, cursor: 'pointer',
        }}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}
