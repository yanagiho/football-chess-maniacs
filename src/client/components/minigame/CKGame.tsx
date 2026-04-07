// ============================================================
// CKGame.tsx — CKミニゲーム（§4-2）
// 攻撃/守備: PA内3ゾーン（ニア/中央/ファー）にコマ配置
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import type { PieceData } from '../../types';
import { POSITION_COLORS } from '../../types';

interface CKGameProps {
  isAttacker: boolean;
  availablePieces: PieceData[];
  onSubmit: (data: CKInput) => void;
  isMobile: boolean;
  countdown: number;
}

export interface CKInput {
  placements: Array<{ pieceId: string; zone: 'near' | 'center' | 'far' }>;
}

const ZONE_LABELS: Record<string, string> = {
  near: 'ニア',
  center: '中央',
  far: 'ファー',
};

const ZONES = ['near', 'center', 'far'] as const;
const MAX_PIECES = 3;

export default function CKGame({ isAttacker, availablePieces, onSubmit, isMobile, countdown }: CKGameProps) {
  const [selectedPieces, setSelectedPieces] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Map<string, 'near' | 'center' | 'far'>>(new Map());
  const [submitted, setSubmitted] = useState(false);

  const phase = selectedPieces.length < MAX_PIECES ? 'select' : 'place';

  const handleSelectPiece = useCallback((pieceId: string) => {
    if (submitted) return;
    setSelectedPieces((prev) => {
      if (prev.includes(pieceId)) return prev.filter((id) => id !== pieceId);
      if (prev.length >= MAX_PIECES) return prev;
      return [...prev, pieceId];
    });
  }, [submitted]);

  const handlePlaceInZone = useCallback((pieceId: string, zone: 'near' | 'center' | 'far') => {
    if (submitted) return;
    setPlacements((prev) => {
      const next = new Map(prev);
      next.set(pieceId, zone);
      return next;
    });
  }, [submitted]);

  const handleSubmit = useCallback(() => {
    if (submitted || placements.size < selectedPieces.length) return;
    setSubmitted(true);
    onSubmit({
      placements: [...placements.entries()].map(([pieceId, zone]) => ({ pieceId, zone })),
    });
  }, [submitted, placements, selectedPieces, onSubmit]);

  useEffect(() => {
    if (countdown <= 0 && !submitted) handleSubmit();
  }, [countdown, submitted, handleSubmit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      <div style={{ fontSize: 24, fontWeight: 'bold', color: countdown <= 3 ? '#ff4444' : '#fff' }}>
        {isAttacker ? 'コーナーキック（攻撃）' : 'コーナーキック（守備）'} - {countdown}秒
      </div>

      {/* 操作説明 */}
      <div style={{ fontSize: 15, color: '#ffd700', textAlign: 'center' }}>
        {isAttacker
          ? 'まず投入する3枚のコマを選び、次にゾーンに配置してください'
          : '守備コマ3枚を選び、ゾーンに配置して守ってください'}
      </div>

      {/* フェーズ1: コマ選択 */}
      {phase === 'select' && (
        <>
          <div style={{ fontSize: 14, color: '#aaa' }}>投入コマを{MAX_PIECES}枚選択</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 360 }}>
            {availablePieces.map((piece) => {
              const isSelected = selectedPieces.includes(piece.id);
              return (
                <button
                  key={piece.id}
                  onClick={() => handleSelectPiece(piece.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: isSelected ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.2)',
                    background: isSelected ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: POSITION_COLORS[piece.position] }}>{piece.position}</span> ★{piece.cost}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* フェーズ2: ゾーン配置 */}
      {phase === 'place' && (
        <>
          <div style={{ fontSize: 14, color: '#aaa' }}>各コマをゾーンに配置</div>
          <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 400, justifyContent: 'center' }}>
            {ZONES.map((zone) => (
              <div
                key={zone}
                style={{
                  flex: 1,
                  minHeight: 120,
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 10,
                  padding: 8,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>{ZONE_LABELS[zone]}</div>
                {selectedPieces.map((pieceId) => {
                  const piece = availablePieces.find((p) => p.id === pieceId);
                  if (!piece) return null;
                  const isPlacedHere = placements.get(pieceId) === zone;
                  return (
                    <button
                      key={pieceId}
                      onClick={() => handlePlaceInZone(pieceId, zone)}
                      style={{
                        display: isPlacedHere || !placements.has(pieceId) ? 'block' : 'none',
                        width: '100%',
                        padding: '6px',
                        margin: '4px 0',
                        borderRadius: 6,
                        border: isPlacedHere ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.2)',
                        background: isPlacedHere ? 'rgba(255,215,0,0.15)' : 'transparent',
                        color: '#fff',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {piece.position} ★{piece.cost}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitted || placements.size < selectedPieces.length}
            style={{
              padding: '12px 40px',
              borderRadius: 10,
              border: 'none',
              background: submitted ? '#666' : '#44aa44',
              color: '#fff',
              fontSize: 16,
              fontWeight: 'bold',
              cursor: submitted ? 'default' : 'pointer',
            }}
          >
            {submitted ? '待機中...' : '確定'}
          </button>
        </>
      )}
    </div>
  );
}
