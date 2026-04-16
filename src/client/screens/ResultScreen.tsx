// ============================================================
// ResultScreen.tsx — リザルト画面（B1）
// スタッツ表示・MVP表示・再戦/ホーム導線
// ============================================================

import React from 'react';
import type { Page, MatchStats, MvpInfo, Team } from '../types';
import PieceIcon from '../components/board/PieceIcon';

interface ResultScreenProps {
  scoreHome: number;
  scoreAway: number;
  myTeam: Team;
  reason: 'completed' | 'disconnect';
  stats: MatchStats;
  mvp: MvpInfo | null;
  gameMode: 'ranked' | 'casual' | 'com' | 'comVsCom';
  onNavigate: (page: Page) => void;
}

const STAT_ROWS: { label: string; key: keyof MatchStats }[] = [
  { label: 'ボール支配率', key: 'possession' },
  { label: 'シュート', key: 'shots' },
  { label: '枠内シュート', key: 'shotsOnTarget' },
  { label: 'パス成功/試行', key: 'passesCompleted' },
  { label: 'タックル', key: 'tackles' },
  { label: 'ファウル', key: 'fouls' },
  { label: 'オフサイド', key: 'offsides' },
  { label: 'コーナーキック', key: 'cornerKicks' },
];

function formatStat(stats: MatchStats, key: keyof MatchStats, team: 'home' | 'away'): string {
  const v = stats[key][team];
  if (key === 'possession') return `${v}%`;
  if (key === 'passesCompleted') {
    return `${stats.passesCompleted[team]}/${stats.passesAttempted[team]}`;
  }
  return String(v);
}

export default function ResultScreen({
  scoreHome, scoreAway, myTeam, reason, stats, mvp, gameMode, onNavigate,
}: ResultScreenProps) {
  const myScore = myTeam === 'home' ? scoreHome : scoreAway;
  const opScore = myTeam === 'home' ? scoreAway : scoreHome;
  const result = myScore > opScore ? 'WIN' : myScore < opScore ? 'LOSE' : 'DRAW';
  const resultColor = result === 'WIN' ? '#ffd700' : result === 'LOSE' ? '#666' : '#aaa';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100%', padding: '24px 16px', gap: 20, overflowY: 'auto',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      {/* 勝敗 */}
      <div style={{
        fontSize: 'clamp(36px, 8vw, 56px)', fontWeight: 900,
        color: resultColor, letterSpacing: 4,
      }}>
        {result}
      </div>

      {reason === 'disconnect' && (
        <div style={{ fontSize: 14, color: '#cc8800' }}>対戦相手が切断しました</div>
      )}

      {/* スコア */}
      <div style={{ fontSize: 48, fontWeight: 'bold' }}>
        <span style={{ color: myTeam === 'home' ? '#4488cc' : '#cc4444' }}>{scoreHome}</span>
        <span style={{ color: '#555', margin: '0 12px' }}>-</span>
        <span style={{ color: myTeam === 'away' ? '#4488cc' : '#cc4444' }}>{scoreAway}</span>
      </div>

      {/* MVP */}
      {mvp && (
        <div style={{
          background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.3)',
          borderRadius: 12, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', maxWidth: 360,
        }}>
          <PieceIcon
            cost={mvp.cost}
            position={mvp.position}
            side={mvp.team === myTeam ? 'ally' : 'enemy'}
          />
          <div>
            <div style={{ fontSize: 12, color: '#ffd700', fontWeight: 'bold' }}>MVP</div>
            <div style={{ fontSize: 14, color: '#fff' }}>{mvp.position} (Cost {mvp.cost})</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>
              {mvp.goals > 0 && `${mvp.goals}G `}
              {mvp.assists > 0 && `${mvp.assists}A `}
              {mvp.tackles > 0 && `${mvp.tackles}T`}
            </div>
          </div>
        </div>
      )}

      {/* スタッツ */}
      <div style={{ width: '100%', maxWidth: 360 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: '#4488cc', padding: '6px 0', fontWeight: 600 }}>HOME</th>
              <th style={{ textAlign: 'center', color: '#888', padding: '6px 0' }}></th>
              <th style={{ textAlign: 'right', color: '#cc4444', padding: '6px 0', fontWeight: 600 }}>AWAY</th>
            </tr>
          </thead>
          <tbody>
            {STAT_ROWS.map(({ label, key }) => (
              <tr key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '6px 0', color: '#ddd', textAlign: 'left' }}>
                  {formatStat(stats, key, 'home')}
                </td>
                <td style={{ padding: '6px 4px', color: '#777', textAlign: 'center', fontSize: 11 }}>
                  {label}
                </td>
                <td style={{ padding: '6px 0', color: '#ddd', textAlign: 'right' }}>
                  {formatStat(stats, key, 'away')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ボタン */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <ResultButton label="リプレイを見る" onClick={() => onNavigate('replayViewer')} />
        {gameMode === 'com' && (
          <ResultButton label="もう一度" primary onClick={() => onNavigate('formation')} />
        )}
        {gameMode === 'comVsCom' && (
          <ResultButton label="もう一度" primary onClick={() => onNavigate('matching')} />
        )}
        <ResultButton label="ホームに戻る" onClick={() => onNavigate('title')} />
      </div>
    </div>
  );
}

function ResultButton({ label, onClick, primary = false }: {
  label: string; onClick: () => void; primary?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      padding: '12px 24px', borderRadius: 8,
      border: primary ? 'none' : '1px solid rgba(255,255,255,0.15)',
      background: primary ? '#44aa44' : 'transparent',
      color: primary ? '#fff' : '#888',
      fontSize: 14, fontWeight: primary ? 'bold' : 'normal', cursor: 'pointer',
    }}>
      {label}
    </button>
  );
}
