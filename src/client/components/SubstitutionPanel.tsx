// ============================================================
// SubstitutionPanel.tsx — 交代UI（B9）
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import type { PieceData, Cost } from '../types';
import PieceIcon from './board/PieceIcon';

interface SubstitutionPanelProps {
  fieldPieces: PieceData[];
  benchPieces: PieceData[];
  usedSubstitutions: number;   // 交代機会使用回数（0〜3）
  totalSubstituted: number;    // 累計交代人数（0〜5）
  maxCost: number;             // コスト上限（16）
  onConfirm: (subs: { outId: string; inId: string }[]) => void;
  onCancel: () => void;
}

export default function SubstitutionPanel({
  fieldPieces, benchPieces, usedSubstitutions, totalSubstituted,
  maxCost, onConfirm, onCancel,
}: SubstitutionPanelProps) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [pendingSubs, setPendingSubs] = useState<{ outId: string; inId: string }[]>([]);

  const remainingOpportunities = 3 - usedSubstitutions;
  const remainingPlayers = 5 - totalSubstituted - pendingSubs.length;

  // 交代後のフィールドコマ（シミュレーション）
  const simFieldPieces = useMemo(() => {
    const swapMap = new Map(pendingSubs.map(s => [s.outId, s.inId]));
    return fieldPieces.map(fp => {
      const benchInId = swapMap.get(fp.id);
      if (benchInId) {
        const bp = benchPieces.find(b => b.id === benchInId);
        return bp ? { ...bp, coord: fp.coord, isBench: false } : fp;
      }
      return fp;
    });
  }, [fieldPieces, benchPieces, pendingSubs]);

  const currentCost = useMemo(() =>
    simFieldPieces.reduce((s, p) => s + p.cost, 0),
    [simFieldPieces]
  );

  const pendingOutIds = new Set(pendingSubs.map(s => s.outId));
  const pendingInIds = new Set(pendingSubs.map(s => s.inId));

  const handleFieldClick = useCallback((pieceId: string) => {
    if (pendingOutIds.has(pieceId)) {
      // 取り消し
      setPendingSubs(prev => prev.filter(s => s.outId !== pieceId));
    } else {
      setSelectedFieldId(prev => prev === pieceId ? null : pieceId);
    }
  }, [pendingOutIds]);

  const handleBenchClick = useCallback((benchId: string) => {
    if (!selectedFieldId || pendingInIds.has(benchId)) return;
    if (remainingPlayers <= 0) return;

    // コスト確認
    const outPiece = fieldPieces.find(p => p.id === selectedFieldId);
    const inPiece = benchPieces.find(p => p.id === benchId);
    if (!outPiece || !inPiece) return;

    const newCost = currentCost - outPiece.cost + inPiece.cost;
    if (newCost > maxCost) return;

    setPendingSubs(prev => [...prev, { outId: selectedFieldId, inId: benchId }]);
    setSelectedFieldId(null);
  }, [selectedFieldId, fieldPieces, benchPieces, currentCost, maxCost, remainingPlayers, pendingInIds]);

  const canConfirm = pendingSubs.length > 0 && remainingOpportunities > 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px 16px', overflowY: 'auto', zIndex: 200,
    }}>
      <h3 style={{ fontSize: 18, fontWeight: 'bold', color: '#fff', margin: '0 0 12px' }}>選手交代</h3>

      {/* 情報バー */}
      <div style={{
        display: 'flex', gap: 16, fontSize: 12, color: '#aaa', marginBottom: 16,
      }}>
        <span>残り交代回数: <b style={{ color: remainingOpportunities > 0 ? '#44aa44' : '#cc4444' }}>{remainingOpportunities}</b></span>
        <span>あと <b>{remainingPlayers}</b> 人交代可能</span>
        <span>コスト: <b style={{ color: currentCost > maxCost ? '#cc4444' : '#fff' }}>{currentCost}</b> / {maxCost}</span>
      </div>

      {/* フィールド */}
      <div style={{ width: '100%', maxWidth: 420, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>フィールド (11人)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {fieldPieces.map(p => {
            const isPendingOut = pendingOutIds.has(p.id);
            const isSelected = selectedFieldId === p.id;
            return (
              <div key={p.id} onClick={() => handleFieldClick(p.id)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: 4, borderRadius: 8, cursor: 'pointer',
                border: isSelected ? '2px solid #FACC15' : isPendingOut ? '2px solid #cc4444' : '1px solid rgba(255,255,255,0.08)',
                background: isPendingOut ? 'rgba(204,68,68,0.15)' : 'rgba(255,255,255,0.03)',
                opacity: isPendingOut ? 0.5 : 1,
              }}>
                <PieceIcon cost={p.cost} position={p.position} side="ally" selected={isSelected} style={{ width: 40, height: 40 }} />
                <span style={{ fontSize: 9, color: '#888' }}>{p.position}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ベンチ */}
      <div style={{ width: '100%', maxWidth: 420, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>ベンチ (9人)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {benchPieces.map(bp => {
            const isUsed = pendingInIds.has(bp.id);
            const costExceeds = selectedFieldId
              ? (() => {
                  const outP = fieldPieces.find(p => p.id === selectedFieldId);
                  return outP ? currentCost - outP.cost + bp.cost > maxCost : false;
                })()
              : false;
            const disabled = isUsed || costExceeds || !selectedFieldId || remainingPlayers <= 0;

            return (
              <div key={bp.id} onClick={() => !disabled && handleBenchClick(bp.id)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: 4, borderRadius: 8,
                cursor: disabled ? 'default' : 'pointer',
                border: isUsed ? '2px solid #44aa44' : '1px solid rgba(255,255,255,0.08)',
                background: isUsed ? 'rgba(68,170,68,0.15)' : 'rgba(255,255,255,0.03)',
                opacity: disabled ? 0.4 : 1,
              }}>
                <PieceIcon cost={bp.cost} position={bp.position} side="ally" style={{ width: 40, height: 40 }} />
                <span style={{ fontSize: 9, color: '#888' }}>{bp.position}</span>
              </div>
            );
          })}
          {benchPieces.length === 0 && (
            <div style={{ color: '#666', fontSize: 12, padding: 8 }}>ベンチが空です</div>
          )}
        </div>
      </div>

      {/* 交代リスト */}
      {pendingSubs.length > 0 && (
        <div style={{
          width: '100%', maxWidth: 420, marginBottom: 16,
          background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10,
        }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>交代予定</div>
          {pendingSubs.map((sub, i) => {
            const outP = fieldPieces.find(p => p.id === sub.outId);
            const inP = benchPieces.find(p => p.id === sub.inId);
            return (
              <div key={i} style={{ fontSize: 12, color: '#ddd', padding: '2px 0' }}>
                {outP?.position}(Cost{outP?.cost}) → {inP?.position}(Cost{inP?.cost})
              </div>
            );
          })}
        </div>
      )}

      {/* ボタン */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onCancel} style={{
          padding: '10px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
          background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer',
        }}>
          キャンセル
        </button>
        <button onClick={() => canConfirm && onConfirm(pendingSubs)} disabled={!canConfirm} style={{
          padding: '10px 24px', borderRadius: 8, border: 'none',
          background: canConfirm ? '#44aa44' : '#333',
          color: canConfirm ? '#fff' : '#666',
          fontSize: 14, fontWeight: 'bold', cursor: canConfirm ? 'pointer' : 'default',
        }}>
          この交代で決定
        </button>
      </div>
    </div>
  );
}
