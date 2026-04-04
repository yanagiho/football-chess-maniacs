// ============================================================
// Result.tsx — 結果画面
// ============================================================

import React from 'react';
import type { Page } from '../types';

interface ResultProps {
  scoreHome: number;
  scoreAway: number;
  myTeam: 'home' | 'away';
  reason: 'completed' | 'disconnect';
  onNavigate: (page: Page) => void;
}

export default function Result({ scoreHome, scoreAway, myTeam, reason, onNavigate }: ResultProps) {
  const myScore = myTeam === 'home' ? scoreHome : scoreAway;
  const opScore = myTeam === 'home' ? scoreAway : scoreHome;
  const result = myScore > opScore ? 'WIN' : myScore < opScore ? 'LOSE' : 'DRAW';

  const resultColor = result === 'WIN' ? '#ffd700' : result === 'LOSE' ? '#666' : '#aaa';

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
      {/* 結果表示 */}
      <div
        style={{
          fontSize: 'clamp(36px, 8vw, 56px)',
          fontWeight: 900,
          color: resultColor,
          letterSpacing: 4,
        }}
      >
        {result}
      </div>

      {reason === 'disconnect' && (
        <div style={{ fontSize: 14, color: '#cc8800' }}>
          対戦相手が切断しました
        </div>
      )}

      {/* スコア */}
      <div style={{ fontSize: 40, fontWeight: 'bold' }}>
        <span style={{ color: myTeam === 'home' ? '#4488cc' : '#cc4444' }}>{scoreHome}</span>
        <span style={{ color: '#555', margin: '0 12px' }}>-</span>
        <span style={{ color: myTeam === 'away' ? '#4488cc' : '#cc4444' }}>{scoreAway}</span>
      </div>

      {/* ボタン */}
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          onClick={() => onNavigate('replay')}
          style={{
            padding: '12px 24px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'transparent',
            color: '#aaa',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          リプレイ
        </button>
        <button
          onClick={() => onNavigate('modeSelect')}
          style={{
            padding: '12px 24px',
            borderRadius: 8,
            border: 'none',
            background: '#44aa44',
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          もう一度
        </button>
        <button
          onClick={() => onNavigate('title')}
          style={{
            padding: '12px 24px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'transparent',
            color: '#888',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          タイトルへ
        </button>
      </div>
    </div>
  );
}
