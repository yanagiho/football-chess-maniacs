// ============================================================
// ConnectionBanner.tsx — 切断/再接続UI（C4）
// 5パターンの接続状態に対応
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import type { Page } from '../types';

export type ConnectionState =
  | 'connected'
  | 'reconnecting'
  | 'opponent_disconnected'
  | 'disconnected'
  | 'match_abandoned';

interface ConnectionBannerProps {
  state: ConnectionState;
  graceSeconds?: number;
  abandonReason?: string;
  onReconnect?: () => void;
  onNavigate: (page: Page) => void;
}

export default function ConnectionBanner({
  state, graceSeconds = 30, abandonReason, onReconnect, onNavigate,
}: ConnectionBannerProps) {
  const [countdown, setCountdown] = useState(graceSeconds);

  useEffect(() => {
    if (state !== 'opponent_disconnected') return;
    setCountdown(graceSeconds);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state, graceSeconds]);

  if (state === 'connected') return null;

  if (state === 'reconnecting') {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
        padding: '8px 16px', background: '#cc8800', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13,
      }}>
        <div style={{
          width: 16, height: 16, border: '2px solid #fff', borderTopColor: 'transparent',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
        }} />
        接続が不安定です。再接続中...
      </div>
    );
  }

  if (state === 'opponent_disconnected') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
      }}>
        <div style={{
          background: '#1a1a3e', borderRadius: 16, padding: 32, textAlign: 'center',
          maxWidth: 360, width: '90%',
        }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 12 }}>
            相手の接続が切れました
          </div>
          <div style={{ fontSize: 48, fontWeight: 'bold', color: '#cc8800', marginBottom: 8 }}>
            {countdown}
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>
            秒待機中... 復帰しない場合、勝利となります
          </div>
        </div>
      </div>
    );
  }

  if (state === 'disconnected') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
      }}>
        <div style={{
          background: '#1a1a3e', borderRadius: 16, padding: 32, textAlign: 'center',
          maxWidth: 360, width: '90%',
        }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#cc4444', marginBottom: 16 }}>
            接続が切れました
          </div>
          <button onClick={onReconnect} style={{
            padding: '12px 32px', borderRadius: 8, border: 'none',
            background: '#44aa44', color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
          }}>
            再接続する
          </button>
        </div>
      </div>
    );
  }

  // match_abandoned
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
    }}>
      <div style={{
        background: '#1a1a3e', borderRadius: 16, padding: 32, textAlign: 'center',
        maxWidth: 360, width: '90%',
      }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>
          試合が終了しました
        </div>
        {abandonReason && (
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{abandonReason}</div>
        )}
        <button onClick={() => onNavigate('title')} style={{
          padding: '12px 32px', borderRadius: 8, border: 'none',
          background: '#4488cc', color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
        }}>
          ホームに戻る
        </button>
      </div>
    </div>
  );
}
