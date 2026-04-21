// ============================================================
// CenterOverlay.tsx — ピッチ中央演出テキスト
// 全ての演出をこのコンポーネント経由で統一表示する。
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface OverlayItem {
  id: string;
  text: string;
  subText?: string;
  duration: number;
  color?: string;
  fontSize?: number;
  glow?: boolean;
}

interface CenterOverlayProps {
  queue: OverlayItem[];
  onComplete: (id: string) => void;
}

export default function CenterOverlay({ queue, onComplete }: CenterOverlayProps) {
  const [current, setCurrent] = useState<OverlayItem | null>(null);
  const [phase, setPhase] = useState<'in' | 'show' | 'out'>('in');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  const processNext = useCallback(() => {
    if (queue.length === 0 || processingRef.current) {
      if (queue.length === 0) { setCurrent(null); processingRef.current = false; }
      return;
    }
    processingRef.current = true;
    const item = queue[0];
    setCurrent(item);
    setPhase('in');

    // fade in → show → fade out → complete
    timerRef.current = setTimeout(() => {
      setPhase('show');
      timerRef.current = setTimeout(() => {
        setPhase('out');
        timerRef.current = setTimeout(() => {
          setCurrent(null);
          processingRef.current = false;
          onComplete(item.id);
        }, 300); // fade out duration
      }, item.duration);
    }, 200); // fade in duration
  }, [queue, onComplete]);

  useEffect(() => {
    if (!processingRef.current && queue.length > 0) {
      processNext();
    }
  }, [queue, processNext]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!current) return null;

  const fontSize = current.fontSize ?? 36;
  const color = current.color ?? '#fff';
  const opacity = phase === 'in' ? 0 : phase === 'out' ? 0 : 1;
  const scale = phase === 'in' ? 0.8 : phase === 'out' ? 1.1 : 1;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 270, pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.7)', borderRadius: 16,
        padding: '24px 48px', textAlign: 'center',
        opacity, transform: `scale(${scale})`,
        transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
        boxShadow: current.glow ? `0 0 40px ${color}44` : 'none',
      }}>
        <div style={{
          fontSize, fontWeight: 900, color, letterSpacing: 3,
          textShadow: current.glow ? `0 0 20px ${color}88` : '0 2px 8px rgba(0,0,0,0.5)',
        }}>
          {current.text}
        </div>
        {current.subText && (
          <div style={{
            fontSize: Math.round(fontSize * 0.6), color: '#ccc',
            marginTop: 8, fontWeight: 600, whiteSpace: 'pre-line',
          }}>
            {current.subText}
          </div>
        )}
      </div>
    </div>
  );
}
