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

const DEFAULT_DURATION = 180_000; // 3分

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
  const isUrgent = remaining <= 30_000;

  const timerColor = isAdditionalTime ? '#ff4444' : isUrgent ? '#ff4444' : '#eee';
  const barColor = isAdditionalTime ? '#ff4444' : isUrgent ? '#ff4444' : '#44cc44';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* ターン表示 */}
      {turnLabel && (
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: isAdditionalTime ? '#ff4444' : '#94a3b8',
          marginRight: 2,
        }}>
          {turnLabel}
        </span>
      )}

      <span style={{ fontSize: '1.1em' }}>⏱</span>
      <div
        style={{
          width: isMobile ? 50 : 70,
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
            background: barColor,
            borderRadius: 3,
            transition: 'width 0.2s linear',
            animation: isUrgent ? 'urgentBlink 0.5s infinite' : undefined,
          }}
        />
      </div>
      <span
        style={{
          fontWeight: 'bold',
          fontVariantNumeric: 'tabular-nums',
          color: timerColor,
          animation: isUrgent ? 'urgentBlink 0.5s infinite' : undefined,
          minWidth: '3.5em',
          textAlign: 'right',
          fontSize: isMobile ? 14 : 15,
        }}
      >
        {minutes}:{String(seconds).padStart(2, '0')}
      </span>
    </div>
  );
}
