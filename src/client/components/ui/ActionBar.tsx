// ============================================================
// ActionBar.tsx — スマホ用アクションバー（§2-4）
// 下部固定。コマ選択中のみアクティブ。
// 交代モード時はベンチ一覧がスライドアップ。
// ============================================================

import React, { useState } from 'react';
import type { PieceData, ActionMode } from '../../types';
import { POSITION_COLORS } from '../../types';
import { t, tn } from '../../i18n';

interface ActionBarProps {
  selectedPiece: PieceData | null;
  actionMode: ActionMode;
  hasOrders: boolean;
  selectedHasOrder: boolean;
  orderCount: number;
  remainingSubs: number;
  benchPieces: PieceData[];
  onCancelSelection: () => void;
  onRemoveSelectedOrder: () => void;
  onUndo: () => void;
  onClearAll: () => void;
  onSetMode: (mode: ActionMode) => void;
  onConfirm: () => void;
  onSubstitute: (fieldPieceId: string, benchPieceId: string) => void;
}

export default function ActionBar({
  selectedPiece,
  actionMode,
  hasOrders,
  selectedHasOrder,
  orderCount,
  remainingSubs,
  benchPieces,
  onCancelSelection,
  onRemoveSelectedOrder,
  onUndo,
  onClearAll,
  onSetMode,
  onConfirm,
  onSubstitute,
}: ActionBarProps) {
  const hasBall = selectedPiece?.hasBall ?? false;
  const hasSelection = selectedPiece !== null;
  const showBench = actionMode === 'substitute' && hasSelection;
  const moveActive = hasSelection && !hasBall && (actionMode === null || actionMode === 'move');

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
            {tn('actionbar.sub_target_select', remainingSubs, { count: remainingSubs })}
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
            <span style={{ fontSize: 13, color: '#666' }}>{t('actionbar.bench_empty')}</span>
          )}
        </div>
      )}

      {/* メインバー */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 106,
          background: 'rgba(20, 20, 40, 0.95)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '7px 8px',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          <ActionButton label={t('common.cancel')} onClick={onCancelSelection} disabled={!hasSelection && actionMode === null} />
          <ActionButton label={t('actionbar.remove_order')} onClick={onRemoveSelectedOrder} disabled={!selectedHasOrder} />
          <ActionButton label={t('actionbar.undo')} onClick={onUndo} disabled={!hasOrders} />
          <ActionButton label={t('actionbar.clear_all')} onClick={onClearAll} disabled={!hasOrders} danger />
        </div>

        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          <ActionButton
            label={t('action.move')}
            onClick={() => onSetMode(actionMode === 'move' ? null : 'move')}
            disabled={!hasSelection || hasBall}
            active={moveActive}
            accent="#64748B"
          />
          <ActionButton
            label={t('action.dribble')}
            onClick={() => onSetMode(actionMode === 'dribble' ? null : 'dribble')}
            disabled={!hasBall}
            active={actionMode === 'dribble'}
            accent="#16A34A"
          />
          <ActionButton
            label={t('action.pass')}
            onClick={() => onSetMode(actionMode === 'pass' ? null : 'pass')}
            disabled={!hasBall}
            active={actionMode === 'pass'}
            accent="#2563EB"
          />
          <ActionButton
            label={t('action.through_pass')}
            onClick={() => onSetMode(actionMode === 'throughPass' ? null : 'throughPass')}
            disabled={!hasBall}
            active={actionMode === 'throughPass'}
            accent="#0891B2"
          />
          <ActionButton
            label={t('action.shoot')}
            onClick={() => onSetMode(actionMode === 'shoot' ? null : 'shoot')}
            disabled={!hasBall}
            active={actionMode === 'shoot'}
            accent="#DC2626"
          />
          <ActionButton
            label={t('action.sub')}
            onClick={() => onSetMode(actionMode === 'substitute' ? null : 'substitute')}
            disabled={!hasSelection || remainingSubs <= 0}
            active={actionMode === 'substitute'}
          />
          <ActionButton label={t('actionbar.confirm')} onClick={onConfirm} disabled={false} primary />
        </div>
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
  danger = false,
  accent,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  primary?: boolean;
  danger?: boolean;
  accent?: string;
}) {
  const accentBg = accent && !disabled ? `${accent}${active ? '' : '30'}` : undefined;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 42,
        minWidth: 0,
        border: accent && !disabled ? `1px solid ${accent}${active ? '' : '99'}` : '1px solid transparent',
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 'bold',
        cursor: disabled ? 'default' : 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        background: primary
          ? '#44aa44'
          : danger && !disabled
          ? 'rgba(220,60,60,0.25)'
          : accentBg
          ? accentBg
          : active
          ? '#4488cc'
          : disabled
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(255,255,255,0.12)',
        color: disabled ? 'rgba(255,255,255,0.3)' : danger ? '#f88' : '#fff',
        boxShadow: active && accent ? `0 0 0 2px ${accent}55, 0 0 14px ${accent}66` : undefined,
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
}
