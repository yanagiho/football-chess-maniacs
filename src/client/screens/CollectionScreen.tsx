// ============================================================
// CollectionScreen.tsx — コマ一覧・図鑑画面（B4）
// T13: マイページ(Title.tsx)の視覚言語（紺〜黒グラデーション+金のグロー+緑アクセント）に統一し、
// Era別セクションで「時代を巡る図鑑」として構造化する
// ============================================================

import React, { useState, useMemo, useEffect } from 'react';
import { apiUrl, type Page, type Position, type Cost } from '../types';
import PieceIcon from '../components/board/PieceIcon';
import BackButton from '../components/ui/BackButton';
import { NPC_TEAMS } from '../../data/npc_teams';
import { t, tn } from '../i18n';

interface CollectionScreenProps {
  onNavigate: (page: Page) => void;
  authToken?: string;
}

type TabMode = 'owned' | 'catalog';
type SortMode = 'cost' | 'position' | 'acquired';

const ALL_POSITIONS: Position[] = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];
const ALL_COSTS: Cost[] = [1, 1.5, 2, 2.5, 3];
const ALL_ERAS = [1, 2, 3, 4, 5, 6, 7];

/** Era(shelf)ごとの表示名。NPC_TEAMSの「〜オールスター」名から時代名部分だけを取り出す */
const ERA_LABELS: Record<number, string> = Object.fromEntries(
  NPC_TEAMS.map((team) => [team.shelf, team.name_ja.replace(/オールスター$/, '')]),
);

interface PieceEntry {
  id: string;
  position: Position;
  cost: Cost;
  era: number; // era_shelf (1-7)
  owned: boolean;
  count: number;
}

/** /api/shop/catalog の1件（piece_master 由来） */
interface RawCatalogItem {
  piece_id: number;
  position: string;
  cost: number;
  era_shelf?: number;
  is_owned?: boolean;
}

/** API失敗時のフォールバック（8×5×7グリッド・全て未所持） */
function buildFallbackCollection(): PieceEntry[] {
  const entries: PieceEntry[] = [];
  let id = 0;
  for (const pos of ALL_POSITIONS) {
    for (const cost of ALL_COSTS) {
      for (const era of ALL_ERAS) {
        entries.push({ id: `piece_${id++}`, position: pos, cost, era, owned: false, count: 0 });
      }
    }
  }
  return entries;
}

export default function CollectionScreen({ onNavigate, authToken }: CollectionScreenProps) {
  const [tab, setTab] = useState<TabMode>('owned');
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [costFilter, setCostFilter] = useState<Cost | 'ALL'>('ALL');
  const [sort, setSort] = useState<SortMode>('cost');
  const [selectedPiece, setSelectedPiece] = useState<PieceEntry | null>(null);
  const [collection, setCollection] = useState<PieceEntry[]>([]);

  // piece_master カタログ（所持フラグ付き）を取得。失敗時はフォールバックグリッド。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (authToken) headers.Authorization = `Bearer ${authToken}`;
        const res = await fetch(apiUrl('/api/shop/catalog?limit=200'), { headers });
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        const data = (await res.json()) as { items: RawCatalogItem[] };
        if (cancelled) return;
        const entries: PieceEntry[] = data.items.map((it) => ({
          id: String(it.piece_id),
          position: it.position.toUpperCase() as Position,
          cost: it.cost as Cost,
          era: it.era_shelf ?? 1,
          owned: Boolean(it.is_owned),
          count: it.is_owned ? 1 : 0,
        }));
        setCollection(entries);
      } catch {
        if (!cancelled) setCollection(buildFallbackCollection());
      }
    })();
    return () => { cancelled = true; };
  }, [authToken]);

  const filtered = useMemo(() => {
    let list = collection;
    if (tab === 'owned') list = list.filter(p => p.owned);
    if (posFilter !== 'ALL') list = list.filter(p => p.position === posFilter);
    if (costFilter !== 'ALL') list = list.filter(p => p.cost === costFilter);
    if (sort === 'cost') list = [...list].sort((a, b) => b.cost - a.cost || a.position.localeCompare(b.position));
    else if (sort === 'position') list = [...list].sort((a, b) => ALL_POSITIONS.indexOf(a.position) - ALL_POSITIONS.indexOf(b.position) || b.cost - a.cost);
    return list;
  }, [collection, tab, posFilter, costFilter, sort]);

  /** Era別セクション構成（棚）。1-7の順に並べ、該当ゼロの時代は非表示 */
  const eraSections = useMemo(() => {
    const byEra = new Map<number, PieceEntry[]>();
    for (const entry of filtered) {
      const list = byEra.get(entry.era) ?? [];
      list.push(entry);
      byEra.set(entry.era, list);
    }
    return ALL_ERAS
      .map(era => ({ era, entries: byEra.get(era) ?? [] }))
      .filter(section => section.entries.length > 0);
  }, [filtered]);

  const ownedCount = collection.filter(p => p.owned).length;
  const progressPct = collection.length > 0 ? Math.round((ownedCount / collection.length) * 100) : 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, #000000 0%, #14142c 55%, #000000 100%)',
    }}>
      {/* ヒーローヘッダー: 所持数を主役として大きく表示 */}
      <div style={{ padding: '20px 16px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#9cd89c', fontWeight: 900, letterSpacing: 2 }}>
          {t('collection.title')}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 36, fontWeight: 900, color: '#ffd700', lineHeight: 1 }}>{ownedCount}</span>
          <span style={{ fontSize: 16, color: '#888', fontWeight: 700 }}>/ {collection.length}</span>
        </div>
        <div style={{
          width: '100%', maxWidth: 280, height: 6, borderRadius: 3, margin: '10px auto 0',
          background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${progressPct}%`, height: '100%',
            background: 'linear-gradient(90deg, #ffd700, #ffb300)',
            boxShadow: '0 0 8px rgba(255,214,0,0.5)',
          }} />
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 8px', justifyContent: 'center' }}>
        {(['owned', 'catalog'] as TabMode[]).map(tabId => (
          <button key={tabId} onClick={() => setTab(tabId)} style={{
            padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: tab === tabId ? '1px solid rgba(255,214,0,0.6)' : '1px solid rgba(255,255,255,0.1)',
            background: tab === tabId ? 'rgba(255,214,0,0.15)' : 'transparent',
            color: tab === tabId ? '#ffd700' : '#888',
          }}>
            {tabId === 'owned' ? t('collection.tab_owned') : t('collection.tab_catalog')}
          </button>
        ))}
      </div>

      {/* フィルター（マイページのボタン言語に合わせタップしやすいサイズに） */}
      <div style={{ padding: '0 16px 6px', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {(['ALL', ...ALL_POSITIONS] as (Position | 'ALL')[]).map(p => (
          <button key={p} onClick={() => setPosFilter(p)} style={{
            padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: posFilter === p ? '1px solid #44aa44' : '1px solid rgba(255,255,255,0.1)',
            background: posFilter === p ? 'rgba(68,170,68,0.18)' : 'rgba(255,255,255,0.04)',
            color: posFilter === p ? '#6fd66f' : '#888',
          }}>
            {p}
          </button>
        ))}
      </div>
      <div style={{ padding: '0 16px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        {(['ALL', ...ALL_COSTS] as (Cost | 'ALL')[]).map(c => (
          <button key={String(c)} onClick={() => setCostFilter(c as Cost | 'ALL')} style={{
            padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: costFilter === c ? '1px solid #cc8800' : '1px solid rgba(255,255,255,0.1)',
            background: costFilter === c ? 'rgba(204,136,0,0.18)' : 'rgba(255,255,255,0.04)',
            color: costFilter === c ? '#e8a838' : '#888',
          }}>
            {c === 'ALL' ? 'ALL' : `Cost ${c}`}
          </button>
        ))}
        <select value={sort} onChange={e => setSort(e.target.value as SortMode)} style={{
          padding: '5px 10px', borderRadius: 6, fontSize: 12,
          background: 'rgba(255,255,255,0.04)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <option value="cost">{t('collection.sort_cost')}</option>
          <option value="position">{t('collection.sort_position')}</option>
          <option value="acquired">{t('collection.sort_acquired')}</option>
        </select>
      </div>

      {/* Era別セクション（棚） */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {eraSections.length === 0 && (
          <div style={{ color: '#666', fontSize: 13, textAlign: 'center', padding: 32 }}>
            {t('collection.not_owned')}
          </div>
        )}
        {eraSections.map(({ era, entries }) => (
          <div key={era} style={{ marginTop: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 4px 8px',
              borderBottom: '1px solid rgba(255,214,0,0.15)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#ffd700' }}>
                {t('collection.era_label', { era: String(era) })}
              </span>
              <span style={{ fontSize: 12, color: '#9cd89c', fontWeight: 700 }}>{ERA_LABELS[era]}</span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
              gap: 8, alignContent: 'start', marginTop: 8,
            }}>
              {entries.map(entry => (
                <div key={entry.id} onClick={() => setSelectedPiece(entry)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  padding: 6, borderRadius: 10, cursor: 'pointer',
                  background: entry.owned ? 'rgba(255,214,0,0.06)' : 'rgba(255,255,255,0.03)',
                  border: entry.owned ? '1px solid rgba(255,214,0,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: entry.owned ? '0 0 10px rgba(255,214,0,0.12)' : undefined,
                }}>
                  {tab === 'catalog' && !entry.owned ? (
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)',
                      fontSize: 18, color: '#444',
                    }}>
                      {'\u{1F512}'}
                    </div>
                  ) : (
                    <PieceIcon cost={entry.cost} position={entry.position} side="ally" style={{ width: 48, height: 48 }} />
                  )}
                  <div style={{ fontSize: 9, color: '#888' }}>{entry.position}</div>
                </div>
              ))}
            </div>
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
            background: 'linear-gradient(160deg, rgba(42,106,42,0.25), rgba(10,10,26,0.95))',
            border: '2px solid rgba(255,214,0,0.45)', boxShadow: '0 0 24px rgba(255,214,0,0.15)',
            borderRadius: 16, padding: 24,
            width: '90%', maxWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <PieceIcon cost={selectedPiece.cost} position={selectedPiece.position} side="ally" />
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
              {selectedPiece.position} (Cost {selectedPiece.cost})
            </div>
            <div style={{ color: '#9cd89c', fontSize: 13, fontWeight: 700 }}>
              {t('collection.era_label', { era: String(selectedPiece.era) })} {ERA_LABELS[selectedPiece.era]}
            </div>
            <div style={{ color: '#aaa', fontSize: 13 }}>
              {selectedPiece.owned ? tn('collection.count', selectedPiece.count, { count: selectedPiece.count }) : t('collection.not_owned')}
            </div>
            <button onClick={() => setSelectedPiece(null)} style={{
              padding: '8px 24px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #ffd700, #ffb300)', color: '#000', fontWeight: 900, fontSize: 14, cursor: 'pointer',
            }}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <BackButton onClick={() => onNavigate('title')} />
    </div>
  );
}
