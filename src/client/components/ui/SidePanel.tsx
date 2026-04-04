// ============================================================
// SidePanel.tsx — PC用サイドパネル（§3-4, §3-5）
// 左: 自チーム一覧（§3-4）キーボード番号・ホバー・選択ハイライト
// 右: 指示一覧（クリックで取消）＋ターンログ（§3-5）
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import type { PieceData, OrderData, GameEvent } from '../../types';
import { POSITION_COLORS } from '../../types';

// ================================================================
// §3-4 左パネル: 自チーム一覧
// ================================================================

const SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

interface LeftPanelProps {
  pieces: PieceData[];
  benchPieces: PieceData[];
  orders: Map<string, OrderData>;
  selectedPieceId: string | null;
  onSelectPiece: (id: string) => void;
}

export function LeftPanel({ pieces, benchPieces, orders, selectedPieceId, onSelectPiece }: LeftPanelProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [benchExpanded, setBenchExpanded] = useState(false);
  const selectedRef = useRef<HTMLDivElement>(null);

  // §3-4 クリックでそのコマを選択→ボードがそのコマにフォーカス → 選択行を見える位置にスクロール
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedPieceId]);

  return (
    <div
      style={{
        width: 200,
        background: 'rgba(20, 20, 40, 0.95)',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ヘッダー */}
      <div style={{
        padding: '8px 12px',
        fontWeight: 'bold',
        fontSize: 13,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}>
        自チーム
      </div>

      {/* コマ一覧 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {pieces.map((piece, i) => {
          const order = orders.get(piece.id);
          const isSelected = piece.id === selectedPieceId;
          const isHovered = piece.id === hoveredId;

          return (
            <div
              key={piece.id}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onSelectPiece(piece.id)}
              onMouseEnter={() => setHoveredId(piece.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                background: isSelected
                  ? 'rgba(255,215,0,0.15)'
                  : isHovered
                  ? 'rgba(255,255,255,0.05)'
                  : 'transparent',
                borderLeft: isSelected ? '3px solid #ffd700' : '3px solid transparent',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                transition: 'background 0.1s',
              }}
            >
              {/* §3-3 キーボードショートカット番号 */}
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#666',
                  flexShrink: 0,
                }}
              >
                {SHORTCUT_KEYS[i]}
              </span>

              {/* ポジション色ドット */}
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: POSITION_COLORS[piece.position],
                  flexShrink: 0,
                }}
              />

              {/* ポジション + コスト */}
              <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap' }}>
                {piece.position}
                <span style={{ color: '#ffd700', marginLeft: 3 }}>★{piece.cost}</span>
              </span>

              {/* 状態バッジ */}
              {order ? (
                <span style={{
                  fontSize: 11,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'rgba(80,180,80,0.15)',
                  color: '#6c6',
                  whiteSpace: 'nowrap',
                }}>
                  {formatActionLabel(order.action)}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: '#555' }}>未指示</span>
              )}

              {/* ボール保持マーク */}
              {piece.hasBall && (
                <span style={{ fontSize: 10, flexShrink: 0 }} title="ボール保持">
                  ⚽
                </span>
              )}
            </div>
          );
        })}

        {/* ベンチ（展開可 §3-4） */}
        {benchPieces.length > 0 && (
          <>
            <div
              onClick={() => setBenchExpanded(!benchExpanded)}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                color: '#777',
                cursor: 'pointer',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>ベンチ ({benchPieces.length})</span>
              <span style={{ fontSize: 10 }}>{benchExpanded ? '▲' : '▼'}</span>
            </div>
            {benchExpanded && benchPieces.map((piece, i) => (
              <div key={piece.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 12px 4px 30px',
                fontSize: 12,
                color: '#888',
              }}>
                <span style={{ color: '#555' }}>B{i + 1}.</span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: POSITION_COLORS[piece.position] }} />
                <span>{piece.position} ★{piece.cost}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ================================================================
// §3-5 右パネル: 指示一覧 + ターンログ
// ================================================================

interface RightPanelProps {
  orders: Map<string, OrderData>;
  pieces: PieceData[];
  events: GameEvent[];
  turn: number;
  onRemoveOrder: (pieceId: string) => void;
}

export function RightPanel({ orders, pieces, events, turn, onRemoveOrder }: RightPanelProps) {
  const [hoveredOrderId, setHoveredOrderId] = useState<string | null>(null);
  const orderEntries = [...orders.entries()];
  const myFieldPieces = pieces.filter((p) => !p.isBench);
  const totalField = myFieldPieces.length;

  return (
    <div
      style={{
        width: 220,
        background: 'rgba(20, 20, 40, 0.95)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── 上半分: 今ターンの指示一覧 ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{
          padding: '8px 12px',
          fontWeight: 'bold',
          fontSize: 13,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}>
          今ターンの指示
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {orderEntries.length === 0 ? (
            <div style={{ padding: 12, color: '#555', fontSize: 13 }}>指示なし</div>
          ) : (
            orderEntries.map(([pieceId, order]) => {
              const piece = pieces.find((p) => p.id === pieceId);
              if (!piece) return null;
              const isHovered = hoveredOrderId === pieceId;

              return (
                <div
                  key={pieceId}
                  onClick={() => onRemoveOrder(pieceId)}
                  onMouseEnter={() => setHoveredOrderId(pieceId)}
                  onMouseLeave={() => setHoveredOrderId(null)}
                  title="クリックで取消"
                  style={{
                    padding: '5px 12px',
                    fontSize: 13,
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: isHovered ? 'rgba(255,60,60,0.08)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'background 0.1s',
                  }}
                >
                  {/* 取消アイコン（ホバー時のみ） */}
                  <span style={{
                    fontSize: 11,
                    color: isHovered ? '#f66' : 'transparent',
                    flexShrink: 0,
                    width: 14,
                    transition: 'color 0.1s',
                  }}>
                    ✕
                  </span>

                  <span style={{ color: POSITION_COLORS[piece.position], fontWeight: 'bold' }}>
                    {piece.position}★{piece.cost}
                  </span>

                  <span style={{ color: '#666', margin: '0 2px' }}>→</span>

                  <span style={{ color: '#aaa', flex: 1 }}>
                    {order.targetHex
                      ? `(${order.targetHex.col},${order.targetHex.row})`
                      : order.targetPieceId
                      ? (() => { const t = pieces.find((p) => p.id === order.targetPieceId); return t ? `${t.position}★${t.cost}` : '?'; })()
                      : ''}
                  </span>

                  <span style={{
                    fontSize: 11,
                    padding: '1px 5px',
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#999',
                  }}>
                    {formatActionLabel(order.action)}
                  </span>
                </div>
              );
            })
          )}
        </div>
        <div style={{
          padding: '6px 12px',
          fontSize: 12,
          color: '#777',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          指示済み: {orderEntries.length}/{totalField}
        </div>
      </div>

      {/* ── 下半分: 直近ターンログ ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '8px 12px',
          fontWeight: 'bold',
          fontSize: 13,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
        }}>
          前ターンの結果
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {events.length === 0 ? (
            <div style={{ padding: 12, color: '#555', fontSize: 13 }}>ログなし</div>
          ) : (
            events.slice(0, 20).map((event, i) => (
              <div
                key={i}
                style={{
                  padding: '3px 12px',
                  fontSize: 12,
                  color: '#aaa',
                  borderBottom: '1px solid rgba(255,255,255,0.02)',
                }}
              >
                <span style={{ color: '#666', marginRight: 4 }}>T{turn - 1}</span>
                <span style={{ color: eventColor(event.type) }}>{formatEvent(event)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// ヘルパー
// ================================================================

function formatActionLabel(action: string | null): string {
  switch (action) {
    case 'move': return '移動';
    case 'pass': return 'パス';
    case 'shoot': return 'シュート';
    case 'dribble': return 'ドリブル';
    case 'substitute': return '交代';
    case 'skill': return 'スキル';
    default: return String(action ?? '');
  }
}

function formatEvent(event: GameEvent): string {
  switch (event.type) {
    case 'PIECE_MOVED': return '移動';
    case 'ZOC_STOP': return 'ZOC停止';
    case 'TACKLE': return 'タックル';
    case 'FOUL': return 'ファウル → FK/PK';
    case 'SHOOT': return `シュート → ${(event as any).result?.outcome ?? ''}`;
    case 'PASS_DELIVERED': return 'パス成功';
    case 'PASS_CUT': return 'パスカット';
    case 'OFFSIDE': return 'オフサイド';
    case 'COLLISION': return '競合';
    case 'BALL_ACQUIRED': return 'ボール獲得';
    default: return event.type;
  }
}

function eventColor(type: string): string {
  switch (type) {
    case 'SHOOT': return '#f88';
    case 'FOUL': return '#fa0';
    case 'PASS_DELIVERED': return '#8cf';
    case 'PASS_CUT': return '#f80';
    case 'OFFSIDE': return '#ff0';
    case 'TACKLE': return '#fc8';
    case 'COLLISION': return '#c8f';
    default: return '#aaa';
  }
}
