// ============================================================
// HalftimeSubPanel.tsx — ハーフタイム交代パネル
// ハーフタイム中にフィールド↔ベンチの選手交代を行うUI。
// ============================================================

import React, { useState, useMemo } from 'react';
import type { PieceData, Cost } from '../../types';
import { POSITION_COLORS } from '../../types';

/** フィールドコスト上限 */
const MAX_FIELD_COST = 16;

interface HalftimeSubPanelProps {
  pieces: PieceData[];
  myTeam: 'home' | 'away';
  maxSubs: number;
  subsUsed: number;
  onSubstitute: (fieldPieceId: string, benchPieceId: string) => void;
  onReady: () => void;
  countdown: number;
  scoreHome: number;
  scoreAway: number;
}

export default function HalftimeSubPanel({
  pieces,
  myTeam,
  maxSubs,
  subsUsed,
  onSubstitute,
  onReady,
  countdown,
  scoreHome,
  scoreAway,
}: HalftimeSubPanelProps) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const myFieldPieces = useMemo(
    () => pieces.filter(p => p.team === myTeam && !p.isBench),
    [pieces, myTeam],
  );
  const myBenchPieces = useMemo(
    () => pieces.filter(p => p.team === myTeam && p.isBench),
    [pieces, myTeam],
  );

  const currentFieldCost = useMemo(
    () => myFieldPieces.reduce((sum, p) => sum + p.cost, 0),
    [myFieldPieces],
  );

  const remainingSubs = maxSubs - subsUsed;
  const selectedField = selectedFieldId ? myFieldPieces.find(p => p.id === selectedFieldId) : null;

  /** 交代後のコストが制限内か判定 */
  function canSwap(fieldPiece: PieceData, benchPiece: PieceData): boolean {
    const newCost = currentFieldCost - fieldPiece.cost + benchPiece.cost;
    return newCost <= MAX_FIELD_COST;
  }

  function handleBenchClick(benchId: string) {
    if (!selectedFieldId || remainingSubs <= 0) return;
    const fp = myFieldPieces.find(p => p.id === selectedFieldId);
    const bp = myBenchPieces.find(p => p.id === benchId);
    if (!fp || !bp || !canSwap(fp, bp)) return;
    onSubstitute(selectedFieldId, benchId);
    setSelectedFieldId(null);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: 16, padding: 24, maxWidth: 480, width: '90%',
        maxHeight: '90vh', overflowY: 'auto',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }}>
        {/* ヘッダー */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#FFD700', letterSpacing: 2 }}>
            HALF TIME
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8, letterSpacing: 4 }}>
            <span style={{ color: '#4488cc' }}>{scoreHome}</span>
            <span style={{ color: '#555', margin: '0 8px' }}>-</span>
            <span style={{ color: '#cc4444' }}>{scoreAway}</span>
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
            交代残り: {remainingSubs}回 / コスト: {currentFieldCost}/{MAX_FIELD_COST}
          </div>
        </div>

        {/* フィールドコマ一覧 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 6, fontWeight: 600 }}>
            フィールド（タップで交代元を選択）
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {myFieldPieces.map(p => {
              const isSelected = p.id === selectedFieldId;
              const isGK = p.position === 'GK';
              return (
                <button
                  key={p.id}
                  onClick={() => !isGK && setSelectedFieldId(isSelected ? null : p.id)}
                  disabled={isGK}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px', borderRadius: 6,
                    border: isSelected ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.15)',
                    background: isSelected ? 'rgba(255,215,0,0.15)' : isGK ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                    color: isGK ? '#555' : '#fff',
                    fontSize: 13, cursor: isGK ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: POSITION_COLORS[p.position],
                    display: 'inline-block',
                  }} />
                  {p.position} {rankLabel(p.cost)}
                  {p.hasBall && <span style={{ fontSize: 10 }}>&#9917;</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ベンチコマ一覧 */}
        {myBenchPieces.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 6, fontWeight: 600 }}>
              ベンチ{selectedField ? '（タップで交代先を選択）' : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {myBenchPieces.map(bp => {
                const swapOk = selectedField ? canSwap(selectedField, bp) : false;
                const disabled = !selectedField || remainingSubs <= 0 || !swapOk;
                return (
                  <button
                    key={bp.id}
                    onClick={() => handleBenchClick(bp.id)}
                    disabled={disabled}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '6px 10px', borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(80,180,80,0.15)',
                      color: disabled ? '#555' : '#fff',
                      fontSize: 13,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: POSITION_COLORS[bp.position],
                      display: 'inline-block',
                    }} />
                    {bp.position} {rankLabel(bp.cost)}
                    {!swapOk && selectedField && (
                      <span style={{ fontSize: 10, color: '#f44' }}>COST</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {myBenchPieces.length === 0 && (
          <div style={{ fontSize: 13, color: '#555', marginBottom: 16, textAlign: 'center' }}>
            ベンチにコマがありません
          </div>
        )}

        {/* 準備完了ボタン */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={onReady}
            style={{
              padding: '12px 40px', borderRadius: 10, border: 'none',
              background: '#16a34a', color: '#fff',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}
          >
            後半開始
          </button>
          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            自動開始まで {countdown}秒
          </div>
        </div>
      </div>
    </div>
  );
}

function rankLabel(cost: Cost): string {
  switch (cost) {
    case 1: return '★1';
    case 1.5: return '★1+';
    case 2: return '★2';
    case 2.5: return '★2+';
    case 3: return '★SS';
  }
}
