// ============================================================
// DifficultySelectScreen.tsx — COM難易度選択画面（B7）
// ============================================================

import React from 'react';
import type { Page, ComDifficulty } from '../types';

interface DifficultySelectScreenProps {
  onNavigate: (page: Page) => void;
  onSelectDifficulty: (difficulty: ComDifficulty) => void;
}

interface DifficultyOption {
  id: ComDifficulty;
  label: string;
  icon: string;
  color: string;
  desc: string;
  detail: string;
}

const OPTIONS: DifficultyOption[] = [
  {
    id: 'beginner', label: 'ビギナー', icon: '\u{1F7E2}', color: '#44aa44',
    desc: 'はじめての方向け。COMは基本的な動きだけをします。',
    detail: '探索深度1 / ランダム率50%',
  },
  {
    id: 'regular', label: 'レギュラー', icon: '\u{1F7E1}', color: '#cc8800',
    desc: 'バランスの取れた強さ。しっかり考えて戦います。',
    detail: '探索深度2 / ランダム率20%',
  },
  {
    id: 'maniac', label: 'マニアック', icon: '\u{1F534}', color: '#cc4444',
    desc: '最強のCOM。容赦なく攻めてきます。',
    detail: '探索深度3 / ランダム率5%',
  },
];

export default function DifficultySelectScreen({ onNavigate, onSelectDifficulty }: DifficultySelectScreenProps) {
  const handleSelect = (diff: ComDifficulty) => {
    onSelectDifficulty(diff);
    onNavigate('opponentSelect');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 24, padding: 20,
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff' }}>COM難易度</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
        {OPTIONS.map(opt => (
          <button key={opt.id} onClick={() => handleSelect(opt.id)} style={{
            padding: '16px 20px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
            border: `1px solid ${opt.color}44`,
            background: `linear-gradient(135deg, ${opt.color}11, ${opt.color}08)`,
            color: '#fff', transition: 'transform 0.1s',
          }}>
            <div style={{ fontSize: 18, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{opt.icon}</span> {opt.label}
            </div>
            <div style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>{opt.desc}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{opt.detail}</div>
          </button>
        ))}
      </div>

      <button onClick={() => onNavigate('modeSelect')} style={{
        marginTop: 8, padding: '8px 24px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        color: '#888', fontSize: 14, cursor: 'pointer',
      }}>
        戻る
      </button>
    </div>
  );
}
