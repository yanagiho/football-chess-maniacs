// ============================================================
// ImpactBurst.tsx — 盤面ローカルの着弾エフェクト（中イベント層）
// タックル成功(impact) / 競合(dust) のHEX位置で一度だけ再生する
// 衝撃波リング + 放射スパーク + 中心フラッシュ。約600msで終了。
// メリハリ設計: GOAL演出(全画面)より一段抑え、盤面の1点だけを爆ぜさせる。
// transform レイヤー内に絶対配置される前提（コマと同じ座標系）。
// ============================================================

import React, { useMemo } from 'react';

export type BurstKind = 'impact' | 'dust' | 'spark';

interface ImpactBurstProps {
  /** hex_map.json セル中心のpx座標（コマと同じ座標系） */
  x: number;
  y: number;
  kind: BurstKind;
}

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** kind別の見た目定義 */
const STYLES: Record<BurstKind, {
  ring: string; ringSize: number; sparkColor: string; sparkCount: number;
  sparkLen: number; flash: string; duration: number;
}> = {
  // タックル成功: 白リング + 金の火花。ボール奪取の「ガツン」
  impact: {
    ring: 'rgba(255,255,255,.95)', ringSize: 92, sparkColor: '#ffd24a',
    sparkCount: 8, sparkLen: 26, flash: 'rgba(255,240,200,.9)', duration: 600,
  },
  // 競合: 灰色の土煙。小さめ・地味め
  dust: {
    ring: 'rgba(200,200,200,.55)', ringSize: 64, sparkColor: 'rgba(180,180,180,.8)',
    sparkCount: 5, sparkLen: 14, flash: 'rgba(220,220,220,.45)', duration: 500,
  },
  // C5a パスカット: オレンジの火花（BALL CUT!の#ff8800に合わせる）
  spark: {
    ring: 'rgba(255,170,60,.9)', ringSize: 76, sparkColor: '#ff8800',
    sparkCount: 7, sparkLen: 22, flash: 'rgba(255,200,120,.85)', duration: 550,
  },
};

export default function ImpactBurst({ x, y, kind }: ImpactBurstProps) {
  const s = STYLES[kind];

  // スパークの角度・距離を初回マウント時に固定（再renderでブレないように）
  const sparks = useMemo(() =>
    Array.from({ length: s.sparkCount }, (_, i) => ({
      angle: (360 / s.sparkCount) * i + (Math.random() * 24 - 12),
      dist: s.ringSize * 0.55 + Math.random() * s.ringSize * 0.25,
      len: s.sparkLen * (0.7 + Math.random() * 0.6),
      delay: Math.random() * 40,
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  if (reducedMotion) return null;

  const dur = `${s.duration}ms`;

  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      width: 0, height: 0,
      pointerEvents: 'none', zIndex: 150,
    }}>
      <style>{`
        @keyframes ib-ring {
          0%   { transform: translate(-50%,-50%) scale(.25); opacity: .95; border-width: 4px; }
          70%  { opacity: .5; }
          100% { transform: translate(-50%,-50%) scale(1); opacity: 0; border-width: 1px; }
        }
        @keyframes ib-flash {
          0%   { transform: translate(-50%,-50%) scale(.4); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1.3); opacity: 0; }
        }
        @keyframes ib-spark {
          0%   { transform: rotate(var(--a)) translateX(6px) scaleX(.4); opacity: 1; }
          100% { transform: rotate(var(--a)) translateX(var(--d)) scaleX(1); opacity: 0; }
        }
      `}</style>

      {/* 中心フラッシュ */}
      <div style={{
        position: 'absolute', left: 0, top: 0,
        width: s.ringSize * 0.5, height: s.ringSize * 0.5,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${s.flash} 0%, transparent 70%)`,
        animation: `ib-flash ${Math.round(s.duration * 0.5)}ms ease-out both`,
      }} />

      {/* 衝撃波リング */}
      <div style={{
        position: 'absolute', left: 0, top: 0,
        width: s.ringSize, height: s.ringSize,
        borderRadius: '50%',
        border: `4px solid ${s.ring}`,
        boxSizing: 'border-box',
        animation: `ib-ring ${dur} cubic-bezier(.2,.8,.3,1) both`,
      }} />

      {/* 放射スパーク */}
      {sparks.map((sp, i) => (
        <div key={i} style={{
          position: 'absolute', left: 0, top: 0,
          width: sp.len, height: kind === 'impact' ? 3 : 2,
          marginTop: kind === 'impact' ? -1.5 : -1,
          borderRadius: 2,
          background: s.sparkColor,
          transformOrigin: '0 50%',
          ['--a' as string]: `${sp.angle}deg`,
          ['--d' as string]: `${sp.dist}px`,
          animation: `ib-spark ${Math.round(s.duration * 0.75)}ms cubic-bezier(.15,.7,.3,1) ${sp.delay}ms both`,
        }} />
      ))}
    </div>
  );
}
