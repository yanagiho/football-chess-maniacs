// ============================================================
// ActionBar.tsx — スマホ用アクションバー（§2-4）
// 下部固定。コマ選択中のみアクティブ。
// 交代モード時はベンチ一覧がスライドアップ。
// ============================================================

import React, { useState } from 'react';
import type { PieceData, ActionMode } from '../../types';
import { POSITION_COLORS } from '../../types';

interface ActionBarProps {
  selectedPiece: PieceData | null;
  actionMode: ActionMode;
  hasOrders: boolean;
  remainingSubs: number;
  benchPieces: PieceData[];
  onUndo: () => void;
  onSetMode: (mode: ActionMode) => void;
  onConfirm: () => void;
  onSubstitute: (fieldPieceId: string, benchPieceId: string) => void;
}

export default function ActionBar({
  selectedPiece,
  actionMode,
  hasOrders,
  remainingSubs,
  benchPieces,
  onUndo,
  onSetMode,
  onConfirm,
  onSubstitute,
}: ActionBarProps) {
  const hasBall = selectedPiece?.hasBall ?? false;
  const hasSelection = selectedPiece !== null;
  const showBench = actionMode === 'substitute' && hasSelection;

  return (
    <div style={{ position: 'relative' }}>
      {/* §2-4 ベンチ一覧スライドアップ */}
      {showBench && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            background: 'rgba(20, 20, 40, 0.98)',
            borderTop: '1px solid rgba(255,255,255,0.15)',
            padding: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'center',
            animation: 'slideUp 0.2s ease-out',
          }}
        >
          <div style={{ width: '100%', fontSize: 12, color: '#888', textAlign: 'center', marginBottom: 4 }}>
            交代先を選択（残り{remainingSubs}回）
          </div>
          {benchPieces.map((bp) => (
            <button
              key={bp.id}
              onClick={() => {
                if (selectedPiece) onSubstitute(selectedPiece.id, bp.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: POSITION_COLORS[bp.position],
                  display: 'inline-block',
                }}
              />
              {bp.position} ★{bp.cost}
            </button>
          ))}
          {benchPieces.length === 0 && (
            <span style={{ fontSize: 13, color: '#666' }}>ベンチにコマがありません</span>
          )}
        </div>
      )}

      {/* メインバー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          height: 60,
          background: 'rgba(20, 20, 40, 0.95)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '0 8px',
          gap: 4,
        }}
      >
        {/* §2-4 戻るボタン */}
        <ActionButton label="←" onClick={onUndo} disabled={!hasOrders} />

        {/* ドリブルモード（ボール保持時のみ） */}
        <ActionButton
          label="ドリブル"
          onClick={() => onSetMode(actionMode === 'dribble' ? null : 'dribble')}
          disabled={!hasBall}
          active={actionMode === 'dribble'}
        />

        {/* パスモード（ボール保持時のみ） */}
        <ActionButton
          label="パス"
          onClick={() => onSetMode(actionMode === 'pass' ? null : 'pass')}
          disabled={!hasBall}
          active={actionMode === 'pass'}
        />

        {/* シュートモード（ボール保持時のみ） */}
        <ActionButton
          label="シュート"
          onClick={() => onSetMode(actionMode === 'shoot' ? null : 'shoot')}
          disabled={!hasBall}
          active={actionMode === 'shoot'}
        />

        {/* 交代（§2-4: ベンチ一覧がスライドアップ） */}
        <ActionButton
          label="交代"
          onClick={() => onSetMode(actionMode === 'substitute' ? null : 'substitute')}
          disabled={!hasSelection || remainingSubs <= 0}
          active={actionMode === 'substitute'}
        />

        {/* ターン確定（常時。1枚も指示なしでもOK） */}
        <ActionButton label="✓ 確定" onClick={onConfirm} disabled={false} primary />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  active = false,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 44,
        maxWidth: 80,
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 'bold',
        cursor: disabled ? 'default' : 'pointer',
        background: primary
          ? '#44aa44'
          : active
          ? '#4488cc'
          : disabled
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(255,255,255,0.12)',
        color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
}
