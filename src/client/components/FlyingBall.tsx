// ============================================================
// FlyingBall.tsx — ボール飛行アニメーション
// パス/シュート時にピッチ上をボールが飛ぶ演出
// ============================================================

import React, { useEffect, useState } from 'react';

export interface FlyingBallData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: 'pass' | 'throughPass' | 'shoot' | 'dribble';
  durationMs: number;
}

interface FlyingBallProps {
  data: FlyingBallData | null;
  onComplete: () => void;
}

export default function FlyingBall({ data, onComplete }: FlyingBallProps) {
  const [phase, setPhase] = useState<'start' | 'flying' | 'done'>('start');

  useEffect(() => {
    if (!data) { setPhase('start'); return; }
    setPhase('start');
    // 次フレームでflying開始（CSS transitionをトリガー）
    const t1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('flying'));
    });
    const t2 = setTimeout(() => {
      setPhase('done');
      onComplete();
    }, data.durationMs + 50);
    return () => { cancelAnimationFrame(t1); clearTimeout(t2); };
  }, [data, onComplete]);

  if (!data || phase === 'done') return null;

  const sz = 24;
  const x = phase === 'start' ? data.fromX : data.toX;
  const y = phase === 'start' ? data.fromY : data.toY;
  const color = data.type === 'shoot' ? 'rgba(255,50,50,0.4)'
    : data.type === 'throughPass' ? 'rgba(0,210,210,0.4)'
    : 'rgba(60,140,255,0.4)';

  return (
    <div style={{
      position: 'absolute',
      left: x - sz / 2,
      top: y - sz / 2,
      width: sz,
      height: sz,
      zIndex: 30,
      pointerEvents: 'none',
      transition: `left ${data.durationMs}ms ease-in-out, top ${data.durationMs}ms ease-in-out, transform ${data.durationMs}ms linear`,
      transform: phase === 'flying' ? 'rotate(720deg)' : 'rotate(0deg)',
      filter: `drop-shadow(0 0 8px ${color})`,
    }}>
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
        <circle cx={sz / 2} cy={sz / 2} r={sz / 2 - 1} fill="white" stroke="#333" strokeWidth={1} />
        {Array.from({ length: 5 }, (_, i) => {
          const a = ((i * 72 - 90) * Math.PI) / 180;
          return <circle key={i} cx={sz / 2 + 6 * Math.cos(a)} cy={sz / 2 + 6 * Math.sin(a)} r={2} fill="#333" />;
        })}
      </svg>
    </div>
  );
}
