// ============================================================
// BallActionMenu.tsx — ボール保持者のアクション選択UI
// 画面下部の固定バーに「パス」「ドリブル」ボタンを表示
// ============================================================

import React from 'react';

interface BallActionMenuProps {
  onPass: () => void;
  onDribble: () => void;
  onCancel: () => void;
}

export default function BallActionMenu({ onPass, onDribble, onCancel }: BallActionMenuProps) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', gap: 12,
      padding: '12px 16px', zIndex: 180,
      background: 'rgba(0,0,0,0.85)',
      borderTop: '1px solid rgba(255,255,255,0.1)',
    }}>
      <button onClick={(e) => { e.stopPropagation(); onPass(); }} style={{
        minWidth: 120, minHeight: 52,
        padding: '10px 24px', borderRadius: 10, border: 'none',
        background: 'linear-gradient(135deg, #2563EB, #3B82F6)',
        color: '#fff', fontSize: 17, fontWeight: 'bold', cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 20 }}>{'\u26BD'}</span> パス
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDribble(); }} style={{
        minWidth: 120, minHeight: 52,
        padding: '10px 24px', borderRadius: 10, border: 'none',
        background: 'linear-gradient(135deg, #16A34A, #22C55E)',
        color: '#fff', fontSize: 17, fontWeight: 'bold', cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(22,163,74,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 20 }}>{'\uD83C\uDFC3'}</span> ドリブル
      </button>
      <button onClick={(e) => { e.stopPropagation(); onCancel(); }} style={{
        minWidth: 60, minHeight: 52,
        padding: '10px 16px', borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'transparent',
        color: '#888', fontSize: 14, cursor: 'pointer',
      }}>
        戻る
      </button>
    </div>
  );
}
