// ============================================================
// Timer.tsx — ターンタイマー（§2-2）
// 残り MM:SS + プログレスバー。30秒以下で赤点滅。
// ============================================================

import React, { useState, useEffect } from 'react';

interface TimerProps {
  turnStartedAt: number | null;
  durationMs?: number;
  onTimeout: () => void;
  isMobile: boolean;
  /** 現在のターン情報表示（例: "45+2"） */
  turnLabel?: string;
  /** アディショナルタイム中か */
  isAdditionalTime?: boolean;
}

const DEFAULT_DURATION = 60_000; // 1分

export default function Timer({
  turnStartedAt,
  durationMs = DEFAULT_DURATION,
  onTimeout,
  isMobile,
  turnLabel,
  isAdditionalTime = false,
}: TimerProps) {
  const [remaining, setRemaining] = useState(durationMs);

  useEffect(() => {
    if (!turnStartedAt) {
      setRemaining(durationMs);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - turnStartedAt;
      const left = Math.max(0, durationMs - elapsed);
      setRemaining(left);

      if (left <= 0) {
        onTimeout();
      }
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [turnStartedAt, durationMs, onTimeout]);

  // §2-6 振動フィードバック（残り10秒）
  useEffect(() => {
    if (remaining <= 10_000 && remaining > 9_800 && isMobile && navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }, [remaining, isMobile]);

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const progress = remaining / durationMs;
  const isWarning = remaining <= 15_000;
  const isUrgent = remaining <= 10_000;

  const timerColor = isAdditionalTime ? '#ff4444' : isWarning ? '#ff4444' : '#fff';
  const barColor = isAdditionalTime ? '#ff4444' : isWarning ? '#ff4444' : '#44cc44';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <style>{`
        @keyframes fcms-timer-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>
      <div
        style={{
          width: isMobile ? 48 : 64,
          height: 6,
          background: 'rgba(255,255,255,0.15)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: barColor,
            borderRadius: 3,
            transition: 'width 0.2s linear',
          }}
        />
      </div>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: timerColor,
          fontSize: isMobile ? 18 : 20,
          fontWeight: 'bold',
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 4,
          padding: '2px 6px',
          animation: isUrgent ? 'fcms-timer-pulse 0.8s ease-in-out infinite' : undefined,
        }}
      >
        {minutes}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
