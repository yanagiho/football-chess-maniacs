// ============================================================
// CKGame.tsx — CKミニゲーム（§4-2）
// 攻撃/守備: PA内3ゾーン（ニア/中央/ファー）にコマ配置
// 各ゾーンで攻守コマのコスト対決 → 勝ったゾーンが多い方がボール獲得
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

const ZONE_DESCRIPTIONS: Record<string, string> = {
  near: 'ゴール手前',
  center: 'ゴール正面',
  far: 'ゴール奥側',
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
      // 同一ゾーンに既に別のコマがいたら除去（1ゾーン1枚制約）
      for (const [existingId, existingZone] of next) {
        if (existingZone === zone && existingId !== pieceId) {
          next.delete(existingId);
        }
      }
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

  // カウントダウン0で自動送信（未完了ならランダムで補完）
  useEffect(() => {
    if (countdown <= 0 && !submitted) {
      // コマ未選択ならランダムに選択
      let finalPieces = [...selectedPieces];
      if (finalPieces.length < MAX_PIECES) {
        const remaining = availablePieces.filter(p => !finalPieces.includes(p.id));
        while (finalPieces.length < MAX_PIECES && remaining.length > 0) {
          const idx = Math.floor(Math.random() * remaining.length);
          finalPieces.push(remaining.splice(idx, 1)[0].id);
        }
      }
      // ゾーン未配置ならランダム配置
      const finalPlacements = new Map(placements);
      const zones: Array<'near' | 'center' | 'far'> = ['near', 'center', 'far'];
      const usedZones = new Set(finalPlacements.values());
      const availZones = zones.filter(z => !usedZones.has(z));
      for (const pieceId of finalPieces) {
        if (!finalPlacements.has(pieceId) && availZones.length > 0) {
          finalPlacements.set(pieceId, availZones.shift()!);
        }
      }
      setSubmitted(true);
      onSubmit({
        placements: [...finalPlacements.entries()].map(([pieceId, zone]) => ({ pieceId, zone })),
      });
    }
  }, [countdown, submitted, selectedPieces, placements, availablePieces, onSubmit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 20 }}>
      <div style={{ fontSize: 24, fontWeight: 'bold', color: countdown <= 3 ? '#ff4444' : '#fff' }}>
        {isAttacker ? '⚽ コーナーキック（攻撃）' : '🧤 コーナーキック（守備）'} - {countdown}秒
      </div>

      {/* ルール説明 */}
      <div style={{
        background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 16px',
        maxWidth: 400, width: '100%',
      }}>
        <div style={{ fontSize: 14, color: '#ffd700', fontWeight: 'bold', marginBottom: 6 }}>
          📋 ルール
        </div>
        <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
          {isAttacker ? (
            <>
              ① 攻撃に送り込むコマを<strong style={{ color: '#fff' }}>3枚</strong>選ぶ<br />
              ② 3つのゾーン（ニア・中央・ファー）に1枚ずつ配置<br />
              ③ 各ゾーンで相手の守備コマと<strong style={{ color: '#fff' }}>コスト対決</strong><br />
              ④ <strong style={{ color: '#4ade80' }}>2ゾーン以上勝てばヘディングチャンス！</strong>
            </>
          ) : (
            <>
              ① 守備に出すコマを<strong style={{ color: '#fff' }}>3枚</strong>選ぶ<br />
              ② 3つのゾーン（ニア・中央・ファー）に1枚ずつ配置<br />
              ③ 各ゾーンで相手の攻撃コマと<strong style={{ color: '#fff' }}>コスト対決</strong><br />
              ④ <strong style={{ color: '#4ade80' }}>2ゾーン以上守ればクリア成功！</strong>
            </>
          )}
        </div>
      </div>

      {/* フェーズ1: コマ選択 */}
      {phase === 'select' && (
        <>
          <div style={{ fontSize: 14, color: '#aaa' }}>
            {isAttacker ? '攻撃' : '守備'}コマを{MAX_PIECES}枚選択（{selectedPieces.length}/{MAX_PIECES}）
          </div>
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
          <div style={{ fontSize: 12, color: '#888' }}>
            💡 コストの高いコマほどゾーン対決で有利
          </div>
        </>
      )}

      {/* フェーズ2: ゾーン配置 */}
      {phase === 'place' && (
        <>
          <div style={{ fontSize: 14, color: '#aaa' }}>
            各コマをゾーンに1枚ずつ配置（タップで配置先を選択）
          </div>
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
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4, color: '#ffd700' }}>{ZONE_LABELS[zone]}</div>
                <div style={{ fontSize: 10, color: '#888', marginBottom: 8 }}>{ZONE_DESCRIPTIONS[zone]}</div>
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
            {submitted ? '判定中...' : '✓ 確定'}
          </button>
        </>
      )}
    </div>
  );
}
