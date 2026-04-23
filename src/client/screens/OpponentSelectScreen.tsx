// ============================================================
// OpponentSelectScreen.tsx — COM対戦相手選択画面
// プリセットチーム v2.0（階段型4チーム）から対戦相手を選ぶ
// ============================================================

import React, { useState } from 'react';
import type { Page } from '../types';
import PieceIcon from '../components/board/PieceIcon';
import type { Cost, Position } from '../types';
import { PRESET_TEAMS } from '../../data/preset_teams';
import type { PresetTeam } from '../../types/piece';

interface OpponentSelectScreenProps {
  onNavigate: (page: Page) => void;
  onSelectOpponent: (team: PresetTeam) => void;
}

const TIER_COLORS: Record<number, string> = {
  1: '#44aa44',
  2: '#cc8800',
  3: '#cc4444',
  4: '#9944cc',
};

const TIER_LABELS: Record<number, string> = {
  1: 'EASY',
  2: 'NORMAL',
  3: 'HARD',
  4: 'EXPERT',
};

export default function OpponentSelectScreen({ onNavigate, onSelectOpponent }: OpponentSelectScreenProps) {
  const [selected, setSelected] = useState<PresetTeam | null>(null);

  const handleConfirm = () => {
    if (selected) {
      onSelectOpponent(selected);
      onNavigate('teamSelect');
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      height: '100%', padding: '16px 12px', gap: 16, overflowY: 'auto',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', margin: 0 }}>
        対戦相手を選択
      </h2>
      <p style={{ fontSize: 13, color: '#888', margin: 0, textAlign: 'center' }}>
        挑戦するチームを選んでください
      </p>

      {/* チーム一覧 */}
      {!selected && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          width: '100%', maxWidth: 400,
        }}>
          {PRESET_TEAMS.map((team) => {
            const color = TIER_COLORS[team.difficulty_tier] ?? '#888';
            return (
              <button
                key={team.team_id}
                onClick={() => setSelected(team)}
                style={{
                  padding: '16px 20px', borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${color}44`,
                  background: `linear-gradient(135deg, ${color}11, ${color}08)`,
                  color: '#fff', transition: 'transform 0.1s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 'bold' }}>
                      {team.name_ja}
                    </div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
                      {team.name_en}
                    </div>
                  </div>
                  <div style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 'bold',
                    background: `${color}33`, color,
                  }}>
                    {TIER_LABELS[team.difficulty_tier]}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 8, display: 'flex', gap: 12 }}>
                  <span>{team.formation_preset}</span>
                  <span>Cost {team.total_cost}</span>
                  {team.ss_count > 0 && <span>SS x{team.ss_count}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* チーム詳細 */}
      {selected && (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16,
            border: `1px solid ${TIER_COLORS[selected.difficulty_tier]}33`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>
                  {selected.name_ja}
                </div>
                <div style={{ fontSize: 13, color: '#aaa' }}>
                  {selected.name_en}
                </div>
              </div>
              <div style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 'bold',
                background: `${TIER_COLORS[selected.difficulty_tier]}33`,
                color: TIER_COLORS[selected.difficulty_tier],
              }}>
                {TIER_LABELS[selected.difficulty_tier]}
              </div>
            </div>

            {/* ナラティブ */}
            <p style={{
              fontSize: 13, color: '#ccc', lineHeight: 1.6,
              margin: '0 0 12px', padding: '8px 12px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 8,
              fontStyle: 'italic',
            }}>
              {selected.narrative_intro_ja}
            </p>

            <div style={{ fontSize: 12, color: '#888', marginBottom: 12, display: 'flex', gap: 12 }}>
              <span>{selected.formation_preset}</span>
              <span>Cost {selected.total_cost}</span>
              {selected.ss_count > 0 && <span>SS x{selected.ss_count}</span>}
            </div>

            {/* スタメン一覧 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {selected.starters.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 8px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  <div style={{
                    transform: 'scale(0.44)', transformOrigin: 'center',
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <PieceIcon
                      cost={s.cost as Cost}
                      position={s.position as Position}
                      side="enemy"
                    />
                  </div>
                  <span style={{ color: '#aaa', fontSize: 11, minWidth: 28 }}>{s.position}</span>
                  <span style={{ color: '#666', fontSize: 11 }}>
                    No.{String(s.piece_id).padStart(3, '0')}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setSelected(null)} style={{
                flex: 1, padding: '10px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                color: '#888', fontSize: 14, cursor: 'pointer',
              }}>
                戻る
              </button>
              <button onClick={handleConfirm} style={{
                flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                background: TIER_COLORS[selected.difficulty_tier],
                color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
              }}>
                この相手に挑む
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 戻るボタン（一覧表示時のみ） */}
      {!selected && (
        <button onClick={() => onNavigate('difficultySelect')} style={{
          marginTop: 8, padding: '8px 24px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          color: '#888', fontSize: 14, cursor: 'pointer',
        }}>
          戻る
        </button>
      )}
    </div>
  );
}
