// ============================================================
// ShopScreen.tsx — ショップ画面（B2）
// パック購入・演出・コマ獲得
// ============================================================

import React, { useState, useCallback } from 'react';
import type { Page, Position, Cost } from '../types';
import PieceIcon from '../components/board/PieceIcon';

interface ShopScreenProps {
  onNavigate: (page: Page) => void;
}

const ALL_POSITIONS: Position[] = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];

interface PackDef {
  id: string;
  name: string;
  price: number;
  count: number;
  desc: string;
  color: string;
}

const PACKS: PackDef[] = [
  { id: 'standard', name: 'スタンダードパック', price: 100, count: 3, desc: 'コスト1~2のコマ3枚', color: '#4488cc' },
  { id: 'premium', name: 'プレミアムパック', price: 300, count: 5, desc: 'コスト1~3のコマ5枚 (2.5以上確定1枚)', color: '#cc8800' },
  { id: 'position', name: 'ポジション指定パック', price: 200, count: 3, desc: '指定ポジションのコマ3枚', color: '#44aa44' },
];

const COST_RATES_STANDARD: { cost: Cost; weight: number }[] = [
  { cost: 1, weight: 40 }, { cost: 1.5, weight: 30 }, { cost: 2, weight: 30 },
];

const COST_RATES_PREMIUM: { cost: Cost; weight: number }[] = [
  { cost: 1, weight: 35 }, { cost: 1.5, weight: 25 }, { cost: 2, weight: 20 },
  { cost: 2.5, weight: 12 }, { cost: 3, weight: 8 },
];

function weightedRandom(rates: { cost: Cost; weight: number }[]): Cost {
  const total = rates.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of rates) {
    roll -= r.weight;
    if (roll <= 0) return r.cost;
  }
  return rates[rates.length - 1].cost;
}

interface PulledPiece { position: Position; cost: Cost }

function pullPack(packId: string, _posFilter?: Position): PulledPiece[] {
  const result: PulledPiece[] = [];
  if (packId === 'standard') {
    for (let i = 0; i < 3; i++) {
      result.push({ position: ALL_POSITIONS[Math.floor(Math.random() * 8)], cost: weightedRandom(COST_RATES_STANDARD) });
    }
  } else if (packId === 'premium') {
    // 1枚目は2.5以上確定
    const highCosts: Cost[] = [2.5, 3];
    result.push({
      position: ALL_POSITIONS[Math.floor(Math.random() * 8)],
      cost: highCosts[Math.floor(Math.random() * 2)],
    });
    for (let i = 1; i < 5; i++) {
      result.push({ position: ALL_POSITIONS[Math.floor(Math.random() * 8)], cost: weightedRandom(COST_RATES_PREMIUM) });
    }
  } else {
    const pos = _posFilter ?? 'FW';
    for (let i = 0; i < 3; i++) {
      result.push({ position: pos, cost: weightedRandom(COST_RATES_PREMIUM) });
    }
  }
  return result;
}

export default function ShopScreen({ onNavigate }: ShopScreenProps) {
  const [coins, setCoins] = useState(1000);
  const [pulled, setPulled] = useState<PulledPiece[] | null>(null);
  const [animIdx, setAnimIdx] = useState(-1);
  const [posFilter, setPosFilter] = useState<Position>('FW');

  const handleBuy = useCallback((pack: PackDef) => {
    if (coins < pack.price) return;
    setCoins(prev => prev - pack.price);
    const pieces = pullPack(pack.id, posFilter);
    setPulled(pieces);
    setAnimIdx(0);
    // 順番に表示
    pieces.forEach((_, i) => {
      if (i > 0) setTimeout(() => setAnimIdx(i), i * 600);
    });
  }, [coins, posFilter]);

  const handleClose = useCallback(() => {
    setPulled(null);
    setAnimIdx(-1);
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100%', padding: '24px 16px', gap: 20, overflowY: 'auto',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 400, alignItems: 'center' }}>
        <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff' }}>SHOP</h2>
        <div style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 20, padding: '6px 16px', fontSize: 14, color: '#ffd700', fontWeight: 'bold' }}>
          {coins} Coin
        </div>
      </div>

      {/* パック一覧 */}
      {!pulled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400 }}>
          {PACKS.map(pack => (
            <div key={pack.id} style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${pack.color}33`,
              borderRadius: 12, padding: 16,
            }}>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: pack.color }}>{pack.name}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{pack.desc}</div>
              {pack.id === 'position' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {ALL_POSITIONS.map(pos => (
                    <button key={pos} onClick={() => setPosFilter(pos)} style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      border: posFilter === pos ? '1px solid #44aa44' : '1px solid rgba(255,255,255,0.1)',
                      background: posFilter === pos ? 'rgba(68,170,68,0.2)' : 'transparent',
                      color: posFilter === pos ? '#44aa44' : '#888',
                    }}>
                      {pos}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => handleBuy(pack)} disabled={coins < pack.price} style={{
                marginTop: 12, padding: '10px 20px', borderRadius: 8, border: 'none',
                background: coins < pack.price ? '#333' : pack.color,
                color: coins < pack.price ? '#666' : '#fff',
                fontSize: 14, fontWeight: 'bold', cursor: coins < pack.price ? 'default' : 'pointer',
                width: '100%',
              }}>
                {pack.price} Coin で購入
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 開封演出 */}
      {pulled && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%', maxWidth: 400,
        }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#ffd700' }}>PACK OPEN!</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {pulled.map((p, i) => (
              <div key={i} style={{
                opacity: i <= animIdx ? 1 : 0,
                transform: i <= animIdx ? 'scale(1)' : 'scale(0.5)',
                transition: 'all 0.4s ease-out',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <div style={{
                  padding: 8, borderRadius: 12,
                  background: p.cost >= 2.5 ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.04)',
                  border: p.cost >= 2.5 ? '1px solid rgba(255,215,0,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  <PieceIcon cost={p.cost} position={p.position} side="ally" />
                </div>
                <div style={{ fontSize: 11, color: '#aaa' }}>{p.position}</div>
              </div>
            ))}
          </div>
          <button onClick={handleClose} style={{
            padding: '10px 32px', borderRadius: 8, border: 'none',
            background: '#44aa44', color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
          }}>
            OK
          </button>
        </div>
      )}

      <button onClick={() => onNavigate('title')} style={{
        padding: '8px 24px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        color: '#888', fontSize: 14, cursor: 'pointer',
      }}>
        戻る
      </button>
    </div>
  );
}
