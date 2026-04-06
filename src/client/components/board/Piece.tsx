// ============================================================
// Piece.tsx — コマ表示（§6-1 v1.2）
// PieceIcon SVG コンポーネントを HEXボード上に絶対配置する。
// ============================================================

import React from 'react';
import type { PieceData, OrderData, HexCoord } from '../../types';
import PieceIcon, { pieceSize } from './PieceIcon';
import type { Cost, Position, Side } from './PieceIcon';

interface PieceProps {
  piece: PieceData;
  x: number;
  y: number;
  isSelected: boolean;
  hasOrder: boolean;
  order?: OrderData;
  /** プレイヤーのチーム。piece.team と比較して味方/敵を判定 */
  myTeam?: 'home' | 'away';
}

/** PA（ペナルティエリア）判定 */
function isInsidePA(coord: HexCoord): boolean {
  const { col, row } = coord;
  return col >= 7 && col <= 14 && (row <= 4 || row >= 29);
}

export default function Piece({ piece, x, y, isSelected, hasOrder, order, myTeam = 'home' }: PieceProps) {
  const size = pieceSize(piece.cost as Cost);
  const half = size / 2;
  const side: Side = piece.team === myTeam ? 'ally' : 'enemy';

  // §1-2 状態別
  const opacity = hasOrder && !isSelected ? 0.55 : 1;

  // §6-1 GK PA外警告
  const gkOutsidePA = piece.position === 'GK' && !isInsidePA(piece.coord);

  return (
    <div
      style={{
        position: 'absolute',
        left: x - half,
        top: y - half,
        width: size,
        height: size,
        opacity,
        cursor: 'pointer',
        pointerEvents: 'auto',
        zIndex: isSelected ? 20 : 10,
        // §5-1 フェーズ1 コマ移動アニメーション 0.8s
        transition: 'left 0.8s ease-out, top 0.8s ease-out, opacity 0.2s',
      }}
      data-piece-id={piece.id}
    >
      <PieceIcon
        cost={piece.cost as Cost}
        position={piece.position as Position}
        side={side}
        selected={isSelected}
        hasBall={piece.hasBall}
      />

      {/* §6-1 GK PA外警告「!」 */}
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

      {/* §1-2 交代予定マーク */}
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
