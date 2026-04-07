// ============================================================
// CollectionScreen.tsx — コマ一覧・図鑑画面（B4）
// ============================================================

import React, { useState, useMemo } from 'react';
import type { Page, Position, Cost } from '../types';
import PieceIcon from '../components/board/PieceIcon';

interface CollectionScreenProps {
  onNavigate: (page: Page) => void;
}

type TabMode = 'owned' | 'catalog';
type SortMode = 'cost' | 'position' | 'acquired';

const ALL_POSITIONS: Position[] = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];
const ALL_COSTS: Cost[] = [1, 1.5, 2, 2.5, 3];

interface PieceEntry {
  id: string;
  position: Position;
  cost: Cost;
  era: number;
  owned: boolean;
  count: number;
}

function generateMockCollection(): PieceEntry[] {
  const entries: PieceEntry[] = [];
  let id = 0;
  for (const pos of ALL_POSITIONS) {
    for (const cost of ALL_COSTS) {
      for (let era = 1; era <= 7; era++) {
        const owned = (cost <= 1.5 && era <= 2) || Math.random() < 0.15;
        entries.push({
          id: `piece_${id++}`,
          position: pos,
          cost,
          era,
          owned,
          count: owned ? Math.floor(Math.random() * 3) + 1 : 0,
        });
      }
    }
  }
  return entries;
}

const MOCK_COLLECTION = generateMockCollection();

export default function CollectionScreen({ onNavigate }: CollectionScreenProps) {
  const [tab, setTab] = useState<TabMode>('owned');
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [costFilter, setCostFilter] = useState<Cost | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortMode>('cost');
  const [selectedPiece, setSelectedPiece] = useState<PieceEntry | null>(null);

  const filtered = useMemo(() => {
    let list = MOCK_COLLECTION;
    if (tab === 'owned') list = list.filter(p => p.owned);
    if (posFilter !== 'ALL') list = list.filter(p => p.position === posFilter);
    if (costFilter !== 'ALL') list = list.filter(p => p.cost === costFilter);
    if (sort === 'cost') list = [...list].sort((a, b) => b.cost - a.cost || a.position.localeCompare(b.position));
    else if (sort === 'position') list = [...list].sort((a, b) => ALL_POSITIONS.indexOf(a.position) - ALL_POSITIONS.indexOf(b.position) || b.cost - a.cost);
    return list;
  }, [tab, posFilter, costFilter, sort]);

  const ownedCount = MOCK_COLLECTION.filter(p => p.owned).length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', margin: 0 }}>COLLECTION</h2>
        <span style={{ fontSize: 13, color: '#888' }}>{ownedCount} / 280</span>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 8px' }}>
        {(['owned', 'catalog'] as TabMode[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            border: tab === t ? '1px solid #4488cc' : '1px solid rgba(255,255,255,0.1)',
            background: tab === t ? 'rgba(68,136,204,0.2)' : 'transparent',
            color: tab === t ? '#4488cc' : '#888',
          }}>
            {t === 'owned' ? '所持コマ' : '図鑑'}
          </button>
        ))}
      </div>

      {/* フィルター */}
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['ALL', ...ALL_POSITIONS] as (Position | 'ALL')[]).map(p => (
          <button key={p} onClick={() => setPosFilter(p)} style={{
            padding: '2px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
            border: posFilter === p ? '1px solid #44aa44' : '1px solid rgba(255,255,255,0.08)',
            background: posFilter === p ? 'rgba(68,170,68,0.15)' : 'transparent',
            color: posFilter === p ? '#44aa44' : '#666',
          }}>
            {p}
          </button>
        ))}
      </div>
      <div style={{ padding: '0 16px 8px', display: 'flex', gap: 4 }}>
        {(['ALL', ...ALL_COSTS] as (Cost | 'ALL')[]).map(c => (
          <button key={String(c)} onClick={() => setCostFilter(c as Cost | 'ALL')} style={{
            padding: '2px 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
            border: costFilter === c ? '1px solid #cc8800' : '1px solid rgba(255,255,255,0.08)',
            background: costFilter === c ? 'rgba(204,136,0,0.15)' : 'transparent',
            color: costFilter === c ? '#cc8800' : '#666',
          }}>
            {c === 'ALL' ? 'ALL' : `Cost ${c}`}
          </button>
        ))}
        <select value={sort} onChange={e => setSort(e.target.value as SortMode)} style={{
          marginLeft: 'auto', padding: '2px 6px', borderRadius: 4, fontSize: 10,
          background: '#1a1a3e', color: '#888', border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <option value="cost">コスト順</option>
          <option value="position">ポジション順</option>
          <option value="acquired">取得順</option>
        </select>
      </div>

      {/* グリッド */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 12px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
        gap: 8, alignContent: 'start',
      }}>
        {filtered.map(entry => (
          <div key={entry.id} onClick={() => setSelectedPiece(entry)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: 6, borderRadius: 8, cursor: 'pointer',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
            opacity: (tab === 'catalog' && !entry.owned) ? 0.3 : 1,
          }}>
            {tab === 'catalog' && !entry.owned ? (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#222' }} />
            ) : (
              <PieceIcon cost={entry.cost} position={entry.position} side="ally" style={{ width: 48, height: 48 }} />
            )}
            <div style={{ fontSize: 9, color: '#888' }}>{entry.position}</div>
            <div style={{ fontSize: 9, color: '#666' }}>#{entry.era}</div>
          </div>
        ))}
      </div>

      {/* 詳細モーダル */}
      {selectedPiece && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setSelectedPiece(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#1a1a3e', borderRadius: 16, padding: 24,
            width: '90%', maxWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <PieceIcon cost={selectedPiece.cost} position={selectedPiece.position} side="ally" />
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
              {selectedPiece.position} (Cost {selectedPiece.cost})
            </div>
            <div style={{ color: '#888', fontSize: 13 }}>Era #{selectedPiece.era}</div>
            <div style={{ color: '#aaa', fontSize: 13 }}>
              {selectedPiece.owned ? `所持数: ${selectedPiece.count}` : '未所持'}
            </div>
            <button onClick={() => setSelectedPiece(null)} style={{
              padding: '8px 24px', borderRadius: 8, border: 'none',
              background: '#4488cc', color: '#fff', fontSize: 14, cursor: 'pointer',
            }}>
              閉じる
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '12px 0', textAlign: 'center' }}>
        <button onClick={() => onNavigate('title')} style={{
          padding: '8px 24px', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
          color: '#888', fontSize: 14, cursor: 'pointer',
        }}>
          戻る
        </button>
      </div>
    </div>
  );
}
