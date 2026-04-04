// ============================================================
// TeamSelect.tsx — チーム選択
// ============================================================

import React, { useState, useEffect } from 'react';
import type { Page } from '../types';

interface TeamSelectProps {
  onNavigate: (page: Page) => void;
}

interface TeamSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export default function TeamSelect({ onNavigate }: TeamSelectProps) {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: API呼び出し GET /api/teams
    setLoading(false);
    setTeams([
      { id: 'team_1', name: 'メインチーム', updatedAt: '2026-04-01' },
      { id: 'team_2', name: 'サブチーム', updatedAt: '2026-03-28' },
    ]);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 20,
        padding: 20,
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>チーム選択</h2>

      {loading ? (
        <div style={{ color: '#888' }}>読み込み中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(team.id)}
              style={{
                padding: '14px 20px',
                borderRadius: 12,
                border: selectedTeamId === team.id
                  ? '2px solid #ffd700'
                  : '1px solid rgba(255,255,255,0.1)',
                background: selectedTeamId === team.id
                  ? 'rgba(255,215,0,0.1)'
                  : 'rgba(255,255,255,0.05)',
                color: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 'bold' }}>{team.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                更新: {team.updatedAt}
              </div>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <button
          onClick={() => onNavigate('modeSelect')}
          style={{
            padding: '10px 24px',
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
        <button
          onClick={() => selectedTeamId && onNavigate('formation')}
          disabled={!selectedTeamId}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: selectedTeamId ? '#44aa44' : '#333',
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: selectedTeamId ? 'pointer' : 'default',
          }}
        >
          フォーメーション設定
        </button>
      </div>
    </div>
  );
}
