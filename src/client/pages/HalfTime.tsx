// ============================================================
// HalfTime.tsx — ハーフタイム画面
// ============================================================

import React, { useState, useEffect } from 'react';
import type { Page } from '../types';

interface HalfTimeProps {
  scoreHome: number;
  scoreAway: number;
  onNavigate: (page: Page) => void;
  onReady: () => void;
}

const HALFTIME_DURATION = 30; // 30秒

export default function HalfTime({ scoreHome, scoreAway, onNavigate, onReady }: HalfTimeProps) {
  const [countdown, setCountdown] = useState(HALFTIME_DURATION);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onReady();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onReady]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 24,
        background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
      }}
    >
      <h2 style={{ fontSize: 20, color: '#888' }}>ハーフタイム</h2>

      {/* スコア */}
      <div style={{ fontSize: 48, fontWeight: 'bold' }}>
        <span style={{ color: '#4488cc' }}>{scoreHome}</span>
        <span style={{ color: '#666', margin: '0 12px' }}>-</span>
        <span style={{ color: '#cc4444' }}>{scoreAway}</span>
      </div>

      {/* 後半開始カウントダウン */}
      <div style={{ fontSize: 14, color: '#888' }}>
        後半開始まで {countdown}秒
      </div>

      {/* TODO: 交代・フォーメーション変更UI */}
      <div style={{ fontSize: 13, color: '#555', padding: '20px', textAlign: 'center' }}>
        交代・フォーメーション変更が可能です
      </div>

      <button
        onClick={onReady}
        style={{
          padding: '12px 32px',
          borderRadius: 10,
          border: 'none',
          background: '#44aa44',
          color: '#fff',
          fontSize: 16,
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        準備完了
      </button>
    </div>
  );
}
