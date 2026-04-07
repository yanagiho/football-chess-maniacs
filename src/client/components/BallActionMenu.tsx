// ============================================================
// BallActionMenu.tsx — ボール保持者のアクション選択UI
// コマタップ時に「パス」「ドリブル」を選ばせる
// ============================================================

import React from 'react';

interface BallActionMenuProps {
  x: number;
  y: number;
  onPass: () => void;
  onDribble: () => void;
  onCancel: () => void;
}

export default function BallActionMenu({ x, y, onPass, onDribble, onCancel }: BallActionMenuProps) {
  // 画面上部に出す。はみ出す場合は下に表示
  const menuY = y > 80 ? y - 70 : y + 50;

  return (
    <>
      {/* 背景タップで閉じる */}
      <div
        onClick={onCancel}
        style={{ position: 'absolute', inset: 0, zIndex: 149 }}
      />
      <div style={{
        position: 'absolute',
        left: x,
        top: menuY,
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        zIndex: 150,
        pointerEvents: 'auto',
      }}>
        <button onClick={onPass} style={{
          minWidth: 72, minHeight: 48,
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: '#fff', color: '#1a1a3e',
          fontSize: 15, fontWeight: 'bold', cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 18 }}>{'\u26BD'}</span> パス
        </button>
        <button onClick={onDribble} style={{
          minWidth: 72, minHeight: 48,
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: '#fff', color: '#1a1a3e',
          fontSize: 15, fontWeight: 'bold', cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 18 }}>{'\uD83C\uDFC3'}</span> ドリブル
        </button>
      </div>
    </>
  );
}
