// ============================================================
// RankingScreen.tsx — ランキング画面（B3）
// ============================================================

import React, { useState } from 'react';
import type { Page } from '../types';

interface RankingScreenProps {
  onNavigate: (page: Page) => void;
}

type Tab = 'overall' | 'weekly' | 'friends';

interface RankEntry {
  rank: number;
  name: string;
  elo: number;
  wins: number;
  draws: number;
  losses: number;
  recent: ('W' | 'D' | 'L')[];
}

function generateMockData(): RankEntry[] {
  const names = [
    'TacticMaster', 'HexKing', 'GoalHunter', 'MidFieldro', 'DefenseWall',
    'WingSpeed', 'SetPieceAce', 'CounterKing', 'TikiTaka', 'PressHigh',
    'LongBall', 'Dribbler99', 'PassMaster', 'HeaderKing', 'FreeKickPro',
    'VolleyAce', 'SweepKeeper', 'BoxToBox', 'Regista10', 'Trequartista',
  ];
  return names.map((name, i) => {
    const elo = 1500 - i * 25 + Math.floor(Math.random() * 30);
    const total = 30 + Math.floor(Math.random() * 50);
    const wins = Math.floor(total * (0.3 + Math.random() * 0.4));
    const draws = Math.floor((total - wins) * 0.3);
    const losses = total - wins - draws;
    const recent: ('W' | 'D' | 'L')[] = Array.from({ length: 5 }, () => {
      const r = Math.random();
      return r < 0.5 ? 'W' : r < 0.7 ? 'D' : 'L';
    });
    return { rank: i + 1, name, elo, wins, draws, losses, recent };
  });
}

const MOCK_DATA = generateMockData();
const MY_RANK: RankEntry = {
  rank: 42, name: 'You', elo: 1000, wins: 5, draws: 3, losses: 2,
  recent: ['W', 'W', 'D', 'L', 'W'],
};

const MEDAL = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];
const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: 'overall', label: '総合' },
  { id: 'weekly', label: '今週' },
  { id: 'friends', label: 'フレンド' },
];

const RECENT_COLOR = { W: '#44aa44', D: '#888', L: '#cc4444' };
const RECENT_SYMBOL = { W: '\u25CB', D: '\u25B3', L: '\u25CF' };

export default function RankingScreen({ onNavigate }: RankingScreenProps) {
  const [tab, setTab] = useState<Tab>('overall');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      height: '100%', background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold', padding: '20px 0 12px', color: '#fff' }}>RANKING</h2>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {TAB_LABELS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            border: tab === t.id ? '1px solid #4488cc' : '1px solid rgba(255,255,255,0.1)',
            background: tab === t.id ? 'rgba(68,136,204,0.2)' : 'transparent',
            color: tab === t.id ? '#4488cc' : '#888',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* テーブル */}
      <div style={{ flex: 1, overflowY: 'auto', width: '100%', maxWidth: 440, padding: '0 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: '#666', fontSize: 11 }}>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>#</th>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>Name</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>Elo</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>W-D-L</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>Recent</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_DATA.map(entry => (
              <tr key={entry.rank} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '8px 4px', color: '#ddd' }}>
                  {entry.rank <= 3 ? MEDAL[entry.rank] : entry.rank}
                </td>
                <td style={{ padding: '8px 4px', color: '#fff', fontWeight: entry.rank <= 3 ? 'bold' : 'normal' }}>
                  {entry.name}
                </td>
                <td style={{ padding: '8px 4px', color: '#aaa', textAlign: 'right' }}>{entry.elo}</td>
                <td style={{ padding: '8px 4px', color: '#888', textAlign: 'right', fontSize: 11 }}>
                  {entry.wins}-{entry.draws}-{entry.losses}
                </td>
                <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                  {entry.recent.map((r, i) => (
                    <span key={i} style={{ color: RECENT_COLOR[r], fontSize: 12, marginLeft: 2 }}>
                      {RECENT_SYMBOL[r]}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 自分の順位（固定表示） */}
      <div style={{
        width: '100%', maxWidth: 440, padding: '10px 16px',
        background: 'rgba(68,136,204,0.1)', borderTop: '1px solid rgba(68,136,204,0.3)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
      }}>
        <span style={{ color: '#4488cc', fontWeight: 'bold' }}>#{MY_RANK.rank} {MY_RANK.name}</span>
        <span style={{ color: '#aaa' }}>Elo {MY_RANK.elo}</span>
        <span style={{ color: '#888', fontSize: 11 }}>{MY_RANK.wins}-{MY_RANK.draws}-{MY_RANK.losses}</span>
      </div>

      <button onClick={() => onNavigate('title')} style={{
        margin: '12px 0 20px', padding: '8px 24px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        color: '#888', fontSize: 14, cursor: 'pointer',
      }}>
        戻る
      </button>
    </div>
  );
}
