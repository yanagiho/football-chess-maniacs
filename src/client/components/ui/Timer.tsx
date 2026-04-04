// ============================================================
// Timer.tsx — ターンタイマー（§2-2）
// 残り秒数 + プログレスバー。20秒以下で赤点滅。
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';

interface TimerProps {
  turnStartedAt: number | null;
  durationMs?: number;
  onTimeout: () => void;
  isMobile: boolean;
}

const DEFAULT_DURATION = 60_000;

export default function Timer({ turnStartedAt, durationMs = DEFAULT_DURATION, onTimeout, isMobile }: TimerProps) {
  const [remaining, setRemaining] = useState(durationMs);

  useEffect(() => {
    if (!turnStartedAt) return;

    const tick = () => {
      const elapsed = Date.now() - turnStartedAt;
      const left = Math.max(0, durationMs - elapsed);
      setRemaining(left);

      if (left <= 0) {
        onTimeout();
        return;
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [turnStartedAt, durationMs, onTimeout]);

  // §2-6 振動フィードバック（残り10秒）
  useEffect(() => {
    if (remaining <= 10_000 && remaining > 9_900 && isMobile && navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }, [remaining, isMobile]);

  const seconds = Math.ceil(remaining / 1000);
  const progress = remaining / durationMs;
  const isUrgent = remaining <= 20_000;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: '1.1em' }}>⏱</span>
      <div
        style={{
          width: isMobile ? 60 : 80,
          height: 6,
          background: 'rgba(255,255,255,0.2)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: isUrgent ? '#ff4444' : '#44cc44',
            borderRadius: 3,
            transition: 'width 0.1s linear',
            animation: isUrgent ? 'urgentBlink 0.5s infinite' : undefined,
          }}
        />
      </div>
      <span
        style={{
          fontWeight: 'bold',
          fontVariantNumeric: 'tabular-nums',
          color: isUrgent ? '#ff4444' : '#eee',
          animation: isUrgent ? 'urgentBlink 0.5s infinite' : undefined,
          minWidth: '2em',
          textAlign: 'right',
        }}
      >
        {seconds}
      </span>
    </div>
  );
}
