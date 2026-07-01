// ============================================================
// PresetTeamsScreen.tsx — プリセットチーム画面（B10）
// ============================================================

import React, { useState } from 'react';
import type { Page } from '../types';
import PieceIcon from '../components/board/PieceIcon';
import { PRESET_TEAMS, type PresetTeam } from '../../data/presetTeams';
import type { Cost, Position } from '../components/board/PieceIcon';
import { t } from '../i18n';

interface PresetTeamsScreenProps {
  onNavigate: (page: Page) => void;
  onSelectPresetTeam: (team: PresetTeam) => void;
}

export default function PresetTeamsScreen({ onNavigate, onSelectPresetTeam }: PresetTeamsScreenProps) {
  const [selectedEra, setSelectedEra] = useState(1);
  const [selectedTeam, setSelectedTeam] = useState<PresetTeam | null>(null);

  const eraTeams = PRESET_TEAMS.filter(t => t.era === selectedEra);
  const totalCost = selectedTeam?.totalCost ?? 0;

  const handleUseTeam = () => {
    if (selectedTeam) {
      onSelectPresetTeam(selectedTeam);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', padding: '16px 16px 8px', margin: 0 }}>
        PRESET TEAMS
      </h2>

      {/* 時代タブ */}
      <div style={{
        display: 'flex', gap: 6, padding: '0 16px 12px', overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {[1, 2, 3, 4, 5, 6, 7].map(era => (
          <button key={era} onClick={() => { setSelectedEra(era); setSelectedTeam(null); }} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer',
            border: selectedEra === era ? '1px solid #cc8800' : '1px solid rgba(255,255,255,0.1)',
            background: selectedEra === era ? 'rgba(204,136,0,0.2)' : 'transparent',
            color: selectedEra === era ? '#cc8800' : '#888',
          }}>
            GR {era}
          </button>
        ))}
      </div>

      {/* チーム一覧 */}
      {!selectedTeam && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {eraTeams.map(team => (
              <div key={team.id} onClick={() => setSelectedTeam(team)} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: 16, cursor: 'pointer', textAlign: 'center',
              }}>
                <div style={{ fontSize: 20, color: '#cc8800', fontWeight: 'bold' }}>{team.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginTop: 6 }}>{team.name}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{team.nameEn}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{team.formation}</div>
                <div style={{ fontSize: 11, color: '#666' }}>
                  Cost {team.totalCost}
                </div>
              </div>
            ))}
            {eraTeams.length === 0 && (
              <div style={{ color: '#666', fontSize: 13, padding: 16 }}>{t('preset.no_teams')}</div>
            )}
          </div>
        </div>
      )}

      {/* チーム詳細 */}
      {selectedTeam && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          <div style={{
            background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 24, color: '#cc8800', fontWeight: 'bold' }}>{selectedTeam.emoji}</span>
              <div>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>{selectedTeam.name}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{selectedTeam.nameEn}</div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {selectedTeam.formation} / Cost {totalCost}
                </div>
              </div>
            </div>

            {/* コマ一覧 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedTeam.pieces.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 8px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                }}>
                  <PieceIcon
                    cost={p.cost as Cost}
                    position={p.position as Position}
                    side="ally"
                    style={{ width: 36, height: 36 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontSize: 13 }}>
                      {p.name}
                      <span style={{ color: '#777', fontSize: 11, marginLeft: 6 }}>#{String(p.pieceId).padStart(3, '0')}</span>
                    </div>
                    <div style={{
                      color: '#888', fontSize: 11, marginTop: 2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {p.summary}
                    </div>
                  </div>
                  <span style={{ color: '#888', fontSize: 11 }}>{p.position}</span>
                  <span style={{ color: '#aaa', fontSize: 11 }}>Cost {p.cost}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setSelectedTeam(null)} style={{
                flex: 1, padding: '10px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                color: '#888', fontSize: 14, cursor: 'pointer',
              }}>
                {t('common.back')}
              </button>
              <button onClick={handleUseTeam} style={{
                flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                background: '#44aa44', color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
              }}>
                {t('preset.use_team')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '12px 0', textAlign: 'center' }}>
        <button onClick={() => onNavigate('formation')} style={{
          padding: '8px 24px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          color: '#888', fontSize: 14, cursor: 'pointer',
        }}>
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
