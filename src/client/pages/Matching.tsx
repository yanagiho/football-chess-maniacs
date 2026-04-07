// ============================================================
// Matching.tsx — マッチング待機画面（§4-2）
// COM対戦: 即座にマッチング成立 → battle画面へ
// オンライン対戦: WebSocket接続 → キュー参加 → マッチ成立通知待ち
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Page, GameMode, Team, MatchmakingWsMessage } from '../types';
import { getWsBaseUrl } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';

interface MatchingProps {
  onNavigate: (page: Page) => void;
  onMatchFound: (matchId: string, team?: Team) => void;
  gameMode: GameMode;
  authToken: string;
}

export default function Matching({ onNavigate, onMatchFound, gameMode, authToken }: MatchingProps) {
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<'searching' | 'found' | 'com_suggested' | 'error'>('searching');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startTimeRef = useRef(Date.now());
  const matchFoundRef = useRef(false);

  // ── マッチメイキングWS メッセージ処理 ──
  const handleMmMessage = useCallback((msg: unknown) => {
    const data = msg as MatchmakingWsMessage;

    switch (data.type) {
      case 'MATCHMAKING_CONNECTED':
        // 接続成功 → キュー参加
        wsSend({
          type: 'JOIN_QUEUE',
          rating: 1500, // TODO: プレイヤーの実レーティング
          teamId: 'default', // TODO: 選択したチームID
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
    if (gameMode === 'com') return;
    if (!authToken) {
      setErrorMsg('ログインが必要です');
      setStatus('error');
      return;
    }

    wsConnect();
    return () => wsDisconnect();
  }, [gameMode, authToken, wsConnect, wsDisconnect]);

  // ── COM対戦: 即座にマッチング成立 ──
  // refガードなし: React StrictModeの再マウントでもtimerが正常に動くようにする
  useEffect(() => {
    if (gameMode !== 'com') return;

    const timer = setTimeout(() => {
      const comMatchId = `com_${Date.now()}`;
      setStatus('found');
      onMatchFound(comMatchId);
    }, 1000);

    return () => clearTimeout(timer);
  }, [gameMode, onMatchFound]);

  // ── オンライン対戦: 経過時間カウント ──
  useEffect(() => {
    if (gameMode === 'com') return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [gameMode]);

  // §4-2 30秒超でCOM提案（オンライン対戦のみ — サーバー側COM_SUGGESTEDのフォールバック）
  useEffect(() => {
    if (gameMode === 'com') return;
    if (elapsed >= 30 && status === 'searching') {
      setStatus('com_suggested');
    }
  }, [elapsed, status, gameMode]);

  // ── COM対戦時は専用のUI ──
  if (gameMode === 'com') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 24,
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>COM対戦</h2>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#44aa44',
          animation: 'spin 1s linear infinite',
        }} />
        <div style={{ fontSize: 14, color: '#aaa' }}>対戦を準備中...</div>
      </div>
    );
  }

  // ── オンライン対戦のUI ──
  const phaseLabel = elapsed < 10
    ? '同リージョンで検索中...'
    : elapsed < 20
    ? '検索範囲を拡大中...'
    : elapsed < 30
    ? 'クロスリージョン検索中...'
    : 'COM対戦を提案中';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 24, padding: 20,
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>マッチング中</h2>

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
        {elapsed < 10 ? '±200' : elapsed < 20 ? '±400' : '全リージョン'}
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
            対戦相手が見つかりません。<br />COM対戦を開始しますか？
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
            COM対戦を開始
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
        キャンセル
      </button>
    </div>
  );
}
