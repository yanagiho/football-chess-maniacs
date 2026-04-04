// ============================================================
// Piece.tsx — コマ表示（§6-1）
// スプライト画像を絶対配置の <img> で表示。
// フォールバック: 画像がなければポジション色の円を描画。
// ============================================================

import React, { useState } from 'react';
import type { PieceData, OrderData, HexCoord } from '../../types';
import { POSITION_COLORS } from '../../types';

interface PieceProps {
  piece: PieceData;
  x: number;
  y: number;
  isSelected: boolean;
  hasOrder: boolean;
  order?: OrderData;
  size: number;
}

/**
 * スプライト画像パスを構築。
 * assets/pieces/{team}_{position}_{cost}.png
 * 例: assets/pieces/home_OM_3.png
 */
function spriteSrc(piece: PieceData): string {
  const costStr = piece.cost % 1 === 0 ? String(piece.cost) : piece.cost.toFixed(1);
  return `/assets/pieces/${piece.team}_${piece.position}_${costStr}.png`;
}

export default function Piece({ piece, x, y, isSelected, hasOrder, order, size }: PieceProps) {
  const [imgError, setImgError] = useState(false);
  const half = size / 2;

  // §1-2 状態別スタイル
  const ringColor = isSelected ? '#ffd700' : hasOrder ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.65)';
  const ringWidth = isSelected ? 3 : 2;
  const opacity = hasOrder && !isSelected ? 0.72 : 1;

  // §6-1 GK PA外警告
  const gkOutsidePA = piece.position === 'GK' && !isInsidePA(piece.coord);
  const ringStyle = gkOutsidePA ? 'dashed' : 'solid';

  return (
    <div
      style={{
        position: 'absolute',
        left: x - half,
        top: y - half,
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${ringWidth}px ${ringStyle} ${ringColor}`,
        opacity,
        cursor: 'pointer',
        pointerEvents: 'auto',
        zIndex: isSelected ? 20 : 10,
        // §5-1 フェーズ1 コマ移動アニメーション 0.8s
        transition: 'left 0.8s ease-out, top 0.8s ease-out, opacity 0.2s',
        // §1-2 未指示コマの点滅
        animation: !hasOrder && !isSelected ? 'piecePulse 2s infinite' : undefined,
        // スプライト背景色（画像がない時に見える）
        background: imgError ? POSITION_COLORS[piece.position] : 'transparent',
        overflow: 'visible',
      }}
      data-piece-id={piece.id}
    >
      {/* ── スプライト画像 ── */}
      {!imgError ? (
        <img
          src={spriteSrc(piece)}
          alt={`${piece.team} ${piece.position}`}
          onError={() => setImgError(true)}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        /* ── フォールバック: テキストアイコン ── */
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: size * 0.36,
              fontWeight: 'bold',
              color: piece.position === 'FW' ? '#333' : '#fff',
              lineHeight: 1,
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {piece.position}
          </span>
        </div>
      )}

      {/* ── §6-1 コスト★（右下） ── */}
      <span
        style={{
          position: 'absolute',
          right: -3,
          bottom: -3,
          fontSize: size * 0.26,
          lineHeight: 1,
          color: '#ffd700',
          textShadow: '0 0 3px #000, 0 0 3px #000',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        {'★'.repeat(Math.floor(piece.cost))}
        {piece.cost % 1 !== 0 ? '½' : ''}
      </span>

      {/* ── §6-1 ボール保持アイコン ── */}
      {piece.hasBall && (
        <img
          src="/assets/pieces/ball.png"
          alt="ball"
          onError={(e) => {
            // ボール画像が無い場合は白丸で代替
            (e.target as HTMLImageElement).style.display = 'none';
          }}
          draggable={false}
          style={{
            position: 'absolute',
            bottom: -size * 0.28,
            left: '50%',
            transform: 'translateX(-50%)',
            width: size * 0.36,
            height: size * 0.36,
            borderRadius: '50%',
            background: '#fff',
            border: '1px solid #555',
            zIndex: 5,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ── §6-1 GK PA外警告「!」 ── */}
      {gkOutsidePA && (
        <span
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            fontSize: size * 0.42,
            fontWeight: 900,
            color: '#ff2222',
            textShadow: '0 0 4px #000',
            pointerEvents: 'none',
          }}
        >
          !
        </span>
      )}

      {/* ── §1-2 交代予定マーク ── */}
      {order?.action === 'substitute' && (
        <div
          style={{
            position: 'absolute',
            inset: -2,
            borderRadius: '50%',
            border: '2px dashed rgba(255,255,255,0.5)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

// ================================================================
// PA（ペナルティエリア）判定
// ================================================================
function isInsidePA(coord: HexCoord): boolean {
  // Home側PA: row 0–4, col 7–14 / Away側PA: row 29–33, col 7–14
  const { col, row } = coord;
  return (
    (col >= 7 && col <= 14 && (row <= 4 || row >= 29))
  );
}
