// ============================================================
// Formation.tsx — フォーメーション設定
// ============================================================

import React, { useState } from 'react';
import type { Page, PieceData } from '../types';
import { POSITION_COLORS } from '../types';

interface FormationProps {
  onNavigate: (page: Page) => void;
}

/** デフォルトフォーメーション（4-4-2） */
const DEFAULT_FORMATION: Pick<PieceData, 'id' | 'position' | 'cost' | 'coord'>[] = [
  { id: 'p01', position: 'GK', cost: 1,   coord: { col: 10, row: 32 } },
  { id: 'p02', position: 'DF', cost: 1,   coord: { col: 7,  row: 28 } },
  { id: 'p03', position: 'DF', cost: 1.5, coord: { col: 10, row: 28 } },
  { id: 'p04', position: 'SB', cost: 1,   coord: { col: 4,  row: 27 } },
  { id: 'p05', position: 'SB', cost: 2,   coord: { col: 16, row: 27 } },
  { id: 'p06', position: 'VO', cost: 2,   coord: { col: 10, row: 24 } },
  { id: 'p07', position: 'MF', cost: 1,   coord: { col: 7,  row: 21 } },
  { id: 'p08', position: 'MF', cost: 1.5, coord: { col: 13, row: 21 } },
  { id: 'p09', position: 'OM', cost: 3,   coord: { col: 10, row: 18 } },
  { id: 'p10', position: 'WG', cost: 1.5, coord: { col: 4,  row: 16 } },
  { id: 'p11', position: 'FW', cost: 2.5, coord: { col: 10, row: 14 } },
];

export default function Formation({ onNavigate }: FormationProps) {
  const [formation] = useState(DEFAULT_FORMATION);
  const totalCost = formation.reduce((s, p) => s + p.cost, 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        gap: 16,
        padding: 20,
        overflow: 'auto',
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>フォーメーション</h2>

      <div style={{ fontSize: 14, color: '#aaa' }}>
        総コスト: <span style={{ color: totalCost > 16 ? '#ff4444' : '#6c6', fontWeight: 'bold' }}>{totalCost}</span> / 16
      </div>

      {/* コマ一覧 */}
      <div style={{ width: '100%', maxWidth: 400 }}>
        {formation.map((piece, i) => (
          <div
            key={piece.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ width: 24, fontSize: 13, color: '#888' }}>{i + 1}.</span>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: POSITION_COLORS[piece.position],
              }}
            />
            <span style={{ flex: 1, fontSize: 14 }}>{piece.position}</span>
            <span style={{ fontSize: 13, color: '#ffd700' }}>★{piece.cost}</span>
            <span style={{ fontSize: 12, color: '#888' }}>
              ({piece.coord.col}, {piece.coord.row})
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          onClick={() => onNavigate('teamSelect')}
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
          onClick={() => onNavigate('matching')}
          disabled={totalCost > 16}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: totalCost <= 16 ? '#44aa44' : '#333',
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: totalCost <= 16 ? 'pointer' : 'default',
          }}
        >
          マッチング開始
        </button>
      </div>
    </div>
  );
}
