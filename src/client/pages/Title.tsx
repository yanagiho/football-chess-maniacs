// ============================================================
// Title.tsx — タイトル画面
// ============================================================

import React from 'react';
import type { Page } from '../types';

interface TitleProps {
  onNavigate: (page: Page) => void;
}

export default function Title({ onNavigate }: TitleProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 32,
        background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 50%, #0a0a1e 100%)',
      }}
    >
      {/* タイトルロゴ */}
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'clamp(28px, 6vw, 48px)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #ffd700, #ff8c00)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: 2,
            lineHeight: 1.2,
          }}
        >
          Football Chess
          <br />
          ManiacS
        </h1>
        <p style={{ color: '#888', fontSize: 14, marginTop: 8 }}>
          HEX Board Strategy
        </p>
      </div>

      {/* メニューボタン */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 240 }}>
        <TitleButton label="対戦する" onClick={() => onNavigate('modeSelect')} primary />
        <TitleButton label="リプレイ" onClick={() => onNavigate('replay')} />
      </div>

      {/* フッター */}
      <div style={{ position: 'absolute', bottom: 16, fontSize: 11, color: '#555' }}>
        GADE Inc.
      </div>
    </div>
  );
}

function TitleButton({
  label,
  onClick,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 0',
        borderRadius: 10,
        border: primary ? 'none' : '1px solid rgba(255,255,255,0.15)',
        background: primary
          ? 'linear-gradient(135deg, #2a6a2a, #3a8a3a)'
          : 'rgba(255,255,255,0.05)',
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'transform 0.1s',
      }}
    >
      {label}
    </button>
  );
}
