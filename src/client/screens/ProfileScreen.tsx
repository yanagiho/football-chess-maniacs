// ============================================================
// ProfileScreen.tsx — プロフィール画面（B5）
// ============================================================

import React, { useState } from 'react';
import type { Page } from '../types';

interface ProfileScreenProps {
  onNavigate: (page: Page) => void;
}

function getRankLabel(elo: number): { label: string; color: string } {
  if (elo >= 1600) return { label: 'レジェンド', color: '#ffd700' };
  if (elo >= 1400) return { label: 'マニアック', color: '#ff4444' };
  if (elo >= 1200) return { label: 'エキスパート', color: '#cc8800' };
  if (elo >= 1000) return { label: 'レギュラー', color: '#4488cc' };
  return { label: 'ビギナー', color: '#44aa44' };
}

interface MatchRecord {
  opponent: string;
  scoreHome: number;
  scoreAway: number;
  date: string;
  won: boolean | null; // null = draw
}

const MOCK_HISTORY: MatchRecord[] = [
  { opponent: 'TacticMaster', scoreHome: 2, scoreAway: 1, date: '2026-04-06', won: true },
  { opponent: 'HexKing', scoreHome: 0, scoreAway: 0, date: '2026-04-05', won: null },
  { opponent: 'GoalHunter', scoreHome: 1, scoreAway: 3, date: '2026-04-05', won: false },
  { opponent: 'DefenseWall', scoreHome: 2, scoreAway: 0, date: '2026-04-04', won: true },
  { opponent: 'WingSpeed', scoreHome: 1, scoreAway: 1, date: '2026-04-03', won: null },
  { opponent: 'PressHigh', scoreHome: 3, scoreAway: 2, date: '2026-04-02', won: true },
  { opponent: 'CounterKing', scoreHome: 0, scoreAway: 1, date: '2026-04-01', won: false },
  { opponent: 'TikiTaka', scoreHome: 2, scoreAway: 2, date: '2026-03-31', won: null },
];

export default function ProfileScreen({ onNavigate }: ProfileScreenProps) {
  const [userName, setUserName] = useState('Player1');
  const [clubName, setClubName] = useState('FC ManiacS');
  const [editingName, setEditingName] = useState(false);
  const [editingClub, setEditingClub] = useState(false);

  const elo = 1000;
  const rank = getRankLabel(elo);
  const wins = 5, draws = 3, losses = 2, total = 10;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const bestStreak = 3;
  const bestElo = 1050;
  const piecesOwned = 42;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100%', padding: '20px 16px', gap: 16, overflowY: 'auto',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', margin: 0 }}>PROFILE</h2>

      {/* ユーザー情報 */}
      <div style={{
        width: '100%', maxWidth: 400, background: 'rgba(255,255,255,0.04)',
        borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#888', fontSize: 12, width: 70 }}>ユーザー名</span>
          {editingName ? (
            <input value={userName} onChange={e => setUserName(e.target.value)}
              onBlur={() => setEditingName(false)} autoFocus
              style={{ background: '#111', border: '1px solid #444', borderRadius: 4, color: '#fff', padding: '2px 8px', fontSize: 14 }}
            />
          ) : (
            <span onClick={() => setEditingName(true)} style={{ color: '#fff', fontSize: 14, cursor: 'pointer' }}>
              {userName}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#888', fontSize: 12, width: 70 }}>クラブ名</span>
          {editingClub ? (
            <input value={clubName} onChange={e => setClubName(e.target.value)}
              onBlur={() => setEditingClub(false)} autoFocus
              style={{ background: '#111', border: '1px solid #444', borderRadius: 4, color: '#fff', padding: '2px 8px', fontSize: 14 }}
            />
          ) : (
            <span onClick={() => setEditingClub(true)} style={{ color: '#fff', fontSize: 14, cursor: 'pointer' }}>
              {clubName}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#888', fontSize: 12, width: 70 }}>レート</span>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{elo}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#888', fontSize: 12, width: 70 }}>ランク</span>
          <span style={{ color: rank.color, fontSize: 14, fontWeight: 'bold' }}>{rank.label}</span>
        </div>
      </div>

      {/* 戦績 */}
      <div style={{
        width: '100%', maxWidth: 400, background: 'rgba(255,255,255,0.04)',
        borderRadius: 12, padding: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginBottom: 10 }}>戦績</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
          <StatRow label="総試合数" value={String(total)} />
          <StatRow label="勝率" value={`${winRate}%`} />
          <StatRow label="勝ち" value={String(wins)} color="#44aa44" />
          <StatRow label="負け" value={String(losses)} color="#cc4444" />
          <StatRow label="引き分け" value={String(draws)} />
          <StatRow label="連勝記録" value={String(bestStreak)} />
          <StatRow label="最高レート" value={String(bestElo)} />
          <StatRow label="所持コマ" value={`${piecesOwned}/200`} />
        </div>
      </div>

      {/* 対戦履歴 */}
      <div style={{
        width: '100%', maxWidth: 400, background: 'rgba(255,255,255,0.04)',
        borderRadius: 12, padding: 16,
      }}>
        <div style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginBottom: 10 }}>対戦履歴</div>
        {MOCK_HISTORY.map((m, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', fontSize: 13,
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: m.won === true ? '#44aa44' : m.won === false ? '#cc4444' : '#888',
            }} />
            <span style={{ color: '#ddd', flex: 1, marginLeft: 8 }}>{m.opponent}</span>
            <span style={{ color: '#aaa', marginRight: 8 }}>{m.scoreHome}-{m.scoreAway}</span>
            <span style={{ color: '#666', fontSize: 11 }}>{m.date}</span>
          </div>
        ))}
      </div>

      <button onClick={() => onNavigate('title')} style={{
        padding: '8px 24px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        color: '#888', fontSize: 14, cursor: 'pointer', marginBottom: 20,
      }}>
        戻る
      </button>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: color ?? '#ddd', fontWeight: 'bold' }}>{value}</span>
    </div>
  );
}
