// ============================================================
// FKGame.tsx — FKミニゲーム（§4-1）
// 攻撃: ゴール6ゾーン選択 + 直接/ロブ切替
// 守備: 壁の高さ + GKダイブ方向
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';

interface FKGameProps {
  isAttacker: boolean;
  onSubmit: (data: FKInput) => void;
  isMobile: boolean;
  countdown: number;
  kickerInfo: { position: string; cost: number };
  gkInfo: { position: string; cost: number };
}

export interface FKInput {
  zone: number;          // 0-5 (左上/中央上/右上/左下/中央下/右下)
  kickType?: 'direct' | 'lob';
  wallHeight?: 'low' | 'high';
}

const ZONES = [
  { label: '左上', key: 7 },
  { label: '中上', key: 8 },
  { label: '右上', key: 9 },
  { label: '左下', key: 4 },
  { label: '中下', key: 5 },
  { label: '右下', key: 6 },
];

export default function FKGame({ isAttacker, onSubmit, isMobile, countdown, kickerInfo, gkInfo }: FKGameProps) {
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [kickType, setKickType] = useState<'direct' | 'lob'>('direct');
  const [wallHeight, setWallHeight] = useState<'low' | 'high'>('high');
  const [submitted, setSubmitted] = useState(false);

  // PCキーボード操作（§4-1: テンキー）
  useEffect(() => {
    if (isMobile || submitted) return;
    const handleKey = (e: KeyboardEvent) => {
      const zone = ZONES.findIndex((z) => z.key === parseInt(e.key));
      if (zone !== -1) setSelectedZone(zone);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMobile, submitted]);

  const handleSubmit = useCallback(() => {
    if (selectedZone === null || submitted) return;
    setSubmitted(true);
    onSubmit({
      zone: selectedZone,
      ...(isAttacker ? { kickType } : { wallHeight }),
    });
  }, [selectedZone, submitted, isAttacker, kickType, wallHeight, onSubmit]);

  // カウントダウン0で自動送信
  useEffect(() => {
    if (countdown <= 0 && !submitted) {
      handleSubmit();
    }
  }, [countdown, submitted, handleSubmit]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      padding: 20,
    }}>
      {/* カウントダウン */}
      <div style={{ fontSize: 24, fontWeight: 'bold', color: countdown <= 2 ? '#ff4444' : '#fff' }}>
        {isAttacker ? 'フリーキック！' : 'GKセーブ！'} - {countdown}秒
      </div>

      {/* 操作説明 */}
      <div style={{ fontSize: 15, color: '#ffd700', textAlign: 'center', lineHeight: 1.6 }}>
        {isAttacker
          ? 'ゴールの狙う方向を選んでください\n直接 or ロブも選択できます'
          : 'GKが飛ぶ方向を選んでください'}
      </div>

      {/* キッカー/GK情報 */}
      <div style={{ fontSize: 14, color: '#aaa' }}>
        {isAttacker
          ? `キッカー: ${kickerInfo.position} ★${kickerInfo.cost}`
          : `GK: ${gkInfo.position} ★${gkInfo.cost}`}
      </div>

      {/* ゴール6ゾーン */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
          width: isMobile ? 280 : 320,
          aspectRatio: '3/2',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 8,
          padding: 4,
        }}
      >
        {ZONES.map((zone, i) => (
          <button
            key={i}
            onClick={() => !submitted && setSelectedZone(i)}
            style={{
              border: selectedZone === i ? '3px solid #ffd700' : '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              background: selectedZone === i ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: isMobile ? 16 : 14,
              fontWeight: selectedZone === i ? 'bold' : 'normal',
              cursor: submitted ? 'default' : 'pointer',
            }}
          >
            {zone.label}
          </button>
        ))}
      </div>

      {/* 攻撃: 直接/ロブ切替 / 守備: 壁の高さ */}
      {isAttacker ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['direct', 'lob'] as const).map((type) => (
            <button
              key={type}
              onClick={() => !submitted && setKickType(type)}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: kickType === type ? '2px solid #4488cc' : '1px solid rgba(255,255,255,0.2)',
                background: kickType === type ? 'rgba(68,136,204,0.2)' : 'transparent',
                color: '#fff',
                fontSize: 14,
                cursor: submitted ? 'default' : 'pointer',
              }}
            >
              {type === 'direct' ? '直接' : 'ロブ'}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          {(['low', 'high'] as const).map((h) => (
            <button
              key={h}
              onClick={() => !submitted && setWallHeight(h)}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: wallHeight === h ? '2px solid #4488cc' : '1px solid rgba(255,255,255,0.2)',
                background: wallHeight === h ? 'rgba(68,136,204,0.2)' : 'transparent',
                color: '#fff',
                fontSize: 14,
                cursor: submitted ? 'default' : 'pointer',
              }}
            >
              壁{h === 'low' ? '低い' : '高い'}
            </button>
          ))}
        </div>
      )}

      {/* 確定ボタン */}
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
