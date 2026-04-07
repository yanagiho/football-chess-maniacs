// ============================================================
// Piece.tsx — コマ表示（§6-1 v1.2）
// PieceIcon SVG コンポーネントを HEXボード上に絶対配置する。
// ボール保持者はコマ横に大きいボールアイコンを別要素で表示。
// ============================================================

import React, { useCallback } from 'react';
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
  /** ボールアイコンをクリックした時のコールバック */
  onBallClick?: (pieceId: string) => void;
  /** チェーンパスのボールタッチ待ち状態（ボールが光る） */
  ballPulse?: boolean;
}

/** PA（ペナルティエリア）判定 */
function isInsidePA(coord: HexCoord): boolean {
  const { col, row } = coord;
  return col >= 7 && col <= 14 && (row <= 4 || row >= 29);
}

/** 大きいボールSVG（コマの50%サイズ） */
function BallIcon({ size, onClick }: { size: number; onClick?: (e: React.MouseEvent) => void }) {
  const r = size / 2;
  const pentagons = Array.from({ length: 5 }, (_, i) => {
    const a = ((i * 72 - 90) * Math.PI) / 180;
    return { x: r + (r * 0.45) * Math.cos(a), y: r + (r * 0.45) * Math.sin(a) };
  });
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined, filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}
    >
      <circle cx={r} cy={r} r={r - 1} fill="white" stroke="#333" strokeWidth={1} />
      {pentagons.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={size * 0.08} fill="#333" />
      ))}
    </svg>
  );
}

export default function Piece({ piece, x, y, isSelected, hasOrder, order, myTeam = 'home', onBallClick, ballPulse = false }: PieceProps) {
  const size = pieceSize(piece.cost as Cost);
  const half = size / 2;
  const side: Side = piece.team === myTeam ? 'ally' : 'enemy';
  const isAlly = piece.team === myTeam;

  // §1-2 状態別
  const opacity = hasOrder && !isSelected ? 0.55 : 1;

  // §6-1 GK PA外警告
  const gkOutsidePA = piece.position === 'GK' && !isInsidePA(piece.coord);

  // ボールサイズ: コマの50%
  const ballSize = Math.round(size * 0.5);

  const handleBallClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onBallClick?.(piece.id);
  }, [onBallClick, piece.id]);

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
        onBallClick={isAlly && piece.hasBall && onBallClick ? () => onBallClick(piece.id) : undefined}
      />

      {/* 大きいボールアイコン（コマ右上に配置、味方ボール保持者のみ） */}
      {piece.hasBall && isAlly && onBallClick && (
        <div
          style={{
            position: 'absolute',
            top: -ballSize * 0.3,
            right: -ballSize * 0.5,
            pointerEvents: 'auto',
            zIndex: 25,
            animation: ballPulse ? 'fcms-ball-pulse 1s ease-in-out infinite' : 'none',
          }}
        >
          {ballPulse && (
            <style>{`@keyframes fcms-ball-pulse{0%,100%{transform:scale(1);filter:drop-shadow(0 0 4px rgba(255,215,0,0.3))}50%{transform:scale(1.2);filter:drop-shadow(0 0 12px rgba(255,215,0,0.8))}}`}</style>
          )}
          <BallIcon size={ballSize} onClick={handleBallClick} />
        </div>
      )}

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
