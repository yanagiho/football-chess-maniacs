// ============================================================
// ModeSelect.tsx — モード選択
// ============================================================

import React from 'react';
import type { Page } from '../types';

interface ModeSelectProps {
  onNavigate: (page: Page) => void;
}

type GameMode = 'ranked' | 'casual' | 'com';

const MODES: { id: GameMode; label: string; desc: string }[] = [
  { id: 'ranked', label: 'ランクマッチ', desc: 'レーティングに基づく真剣勝負' },
  { id: 'casual', label: 'カジュアル', desc: 'レーティング変動なしのフリー対戦' },
  { id: 'com', label: 'COM対戦', desc: 'AIと練習試合' },
];

export default function ModeSelect({ onNavigate }: ModeSelectProps) {
  const handleSelect = (_mode: GameMode) => {
    onNavigate('teamSelect');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 24,
        padding: 20,
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>モード選択</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => handleSelect(mode.id)}
            style={{
              padding: '16px 20px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 'bold' }}>{mode.label}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{mode.desc}</div>
          </button>
        ))}
      </div>

      <button
        onClick={() => onNavigate('title')}
        style={{
          marginTop: 16,
          padding: '8px 24px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          color: '#888',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        戻る
      </button>
    </div>
  );
}
