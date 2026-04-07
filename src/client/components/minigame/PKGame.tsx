// ============================================================
// PKGame.tsx — PKミニゲーム（§4-3）
// ゴール6ゾーン選択。PK戦時はキッカー選択 + 蹴り順UI。
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import type { PieceData } from '../../types';
import { POSITION_COLORS } from '../../types';

interface PKGameProps {
  isKicker: boolean;
  isMobile: boolean;
  onSubmit: (zone: number) => void;
  countdown: number;
  kickerInfo: { position: string; cost: number };
  gkInfo: { position: string; cost: number };
  /** PK戦モード */
  isPKShootout?: boolean;
  /** PK戦のスコア */
  shootoutScore?: { home: number; away: number };
  /** 現在の蹴り番号（1-5+） */
  shootoutRound?: number;
}

const ZONES = [
  { label: '左上', row: 0, col: 0 },
  { label: '中上', row: 0, col: 1 },
  { label: '右上', row: 0, col: 2 },
  { label: '左下', row: 1, col: 0 },
  { label: '中下', row: 1, col: 1 },
  { label: '右下', row: 1, col: 2 },
];

export default function PKGame({
  isKicker,
  isMobile,
  onSubmit,
  countdown,
  kickerInfo,
  gkInfo,
  isPKShootout = false,
  shootoutScore,
  shootoutRound,
}: PKGameProps) {
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // PCキーボード操作（§4-3: テンキー）
  useEffect(() => {
    if (isMobile || submitted) return;
    const numMap: Record<string, number> = { '7': 0, '8': 1, '9': 2, '4': 3, '5': 4, '6': 5 };
    const handleKey = (e: KeyboardEvent) => {
      const zone = numMap[e.key];
      if (zone !== undefined) setSelectedZone(zone);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMobile, submitted]);

  const handleSubmit = useCallback(() => {
    if (selectedZone === null || submitted) return;
    setSubmitted(true);
    onSubmit(selectedZone);
  }, [selectedZone, submitted, onSubmit]);

  // カウントダウン0で自動送信（未選択ならランダム）
  useEffect(() => {
    if (countdown <= 0 && !submitted) {
      const zone = selectedZone ?? Math.floor(Math.random() * 6);
      setSubmitted(true);
      onSubmit(zone);
    }
  }, [countdown, submitted, selectedZone, onSubmit]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      padding: 20,
    }}>
      {/* PK戦スコア */}
      {isPKShootout && shootoutScore && (
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>
          PK戦 第{shootoutRound}本目 — {shootoutScore.home} - {shootoutScore.away}
        </div>
      )}

      <div style={{ fontSize: 24, fontWeight: 'bold', color: countdown <= 2 ? '#ff4444' : '#fff' }}>
        {isKicker ? 'PK キック！' : 'PK セーブ！'} - {countdown}秒
      </div>

      {/* 操作説明 */}
      <div style={{ fontSize: 15, color: '#ffd700', textAlign: 'center' }}>
        {isKicker
          ? 'ゴールの蹴る方向を選んでください（6ゾーン）'
          : 'GKが飛ぶ方向を選んでください（6ゾーン）'}
      </div>

      {/* キッカー/GK情報 */}
      <div style={{ display: 'flex', gap: 20, fontSize: 14 }}>
        <span>キッカー: {kickerInfo.position} ★{kickerInfo.cost}</span>
        <span>GK: {gkInfo.position} ★{gkInfo.cost}</span>
      </div>

      {/* ゴール6ゾーン */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          width: isMobile ? 300 : 360,
          aspectRatio: '3/2',
          background: 'rgba(255,255,255,0.03)',
          border: '3px solid rgba(255,255,255,0.3)',
          borderRadius: 8,
          padding: 6,
        }}
      >
        {ZONES.map((zone, i) => (
          <button
            key={i}
            onClick={() => !submitted && setSelectedZone(i)}
            style={{
              border: selectedZone === i ? '3px solid #ffd700' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              background: selectedZone === i
                ? isKicker ? 'rgba(255,60,60,0.2)' : 'rgba(60,140,255,0.2)'
                : 'rgba(255,255,255,0.03)',
              color: '#fff',
              fontSize: isMobile ? 18 : 16,
              fontWeight: selectedZone === i ? 'bold' : 'normal',
              cursor: submitted ? 'default' : 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {zone.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={selectedZone === null || submitted}
        style={{
          padding: '12px 40px',
          borderRadius: 10,
          border: 'none',
          background: submitted ? '#666' : selectedZone !== null ? '#44aa44' : '#333',
          color: '#fff',
          fontSize: 16,
          fontWeight: 'bold',
          cursor: submitted || selectedZone === null ? 'default' : 'pointer',
        }}
      >
        {submitted ? '待機中...' : '確定'}
      </button>
    </div>
  );
}

// ── PK戦キッカー選択UI（§4-3） ──

interface PKKickerSelectProps {
  pieces: PieceData[];
  onSubmit: (kickerOrder: string[]) => void;
  isMobile: boolean;
}

export function PKKickerSelect({ pieces, onSubmit, isMobile }: PKKickerSelectProps) {
  const [kickerOrder, setKickerOrder] = useState<string[]>([]);

  const handleToggle = useCallback((pieceId: string) => {
    setKickerOrder((prev) => {
      if (prev.includes(pieceId)) return prev.filter((id) => id !== pieceId);
      if (prev.length >= 5) return prev;
      return [...prev, pieceId];
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold' }}>PK戦 蹴り順を選択</div>

      {/* 蹴り順スロット */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {Array.from({ length: 5 }, (_, i) => {
          const piece = pieces.find((p) => p.id === kickerOrder[i]);
          return (
            <div
              key={i}
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                border: '2px dashed rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: piece ? 'rgba(255,215,0,0.1)' : 'transparent',
                fontSize: 12,
              }}
            >
              {piece ? (
                <span style={{ color: POSITION_COLORS[piece.position] }}>
                  {piece.position}<br />★{piece.cost}
                </span>
              ) : (
                <span style={{ color: '#555' }}>{i + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* コマ一覧 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 400 }}>
        {pieces.map((piece) => {
          const idx = kickerOrder.indexOf(piece.id);
          const isSelected = idx !== -1;
          return (
            <button
              key={piece.id}
              onClick={() => handleToggle(piece.id)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: isSelected ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.2)',
                background: isSelected ? 'rgba(255,215,0,0.1)' : 'transparent',
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {isSelected && <span style={{ marginRight: 4 }}>#{idx + 1}</span>}
              <span style={{ color: POSITION_COLORS[piece.position] }}>{piece.position}</span> ★{piece.cost}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => kickerOrder.length === 5 && onSubmit(kickerOrder)}
        disabled={kickerOrder.length < 5}
        style={{
          padding: '12px 40px',
          borderRadius: 10,
          border: 'none',
          background: kickerOrder.length === 5 ? '#44aa44' : '#333',
          color: '#fff',
          fontSize: 16,
          fontWeight: 'bold',
          cursor: kickerOrder.length === 5 ? 'pointer' : 'default',
        }}
      >
        確定 ({kickerOrder.length}/5)
      </button>
    </div>
  );
}
