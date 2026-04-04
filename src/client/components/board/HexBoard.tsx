// ============================================================
// HexBoard.tsx — HEXボード（背景画像 + Canvas + DOM）
// §6-1 レイヤー分離構成。PixiJS不使用。
//
// レイヤー構成（下から上）:
//   1. 背景レイヤー  — <img> で board_mobile.png を表示
//   2. Canvas        — ZOC・パスライン・移動範囲等（Overlay.tsx）
//   3. コマレイヤー  — <img> 絶対配置のスプライト（Piece.tsx）
//
// ズーム/パン: CSS transform(scale/translate) でレイヤー全体を変換
// ============================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import type { PieceData, HexCoord, HexCell, OrderData, ActionMode } from '../../types';
import hexMapData from '../../data/hex_map.json';
import Piece from './Piece';
import Overlay from './Overlay';
import { useControls, fitToContainer, type Transform } from './Controls';

const hexMap = hexMapData as HexCell[];

// ── ボード論理サイズ（hex_map.json 座標範囲 + マージン） ──
// x: 30 – 975,  y: 25.98 – 1766.69
const BOARD_PADDING = 30;
const BOARD_WIDTH = 975 + BOARD_PADDING * 2;   // ≈ 1035
const BOARD_HEIGHT = 1767 + BOARD_PADDING * 2;  // ≈ 1827

// ── 高速 HEX 検索用 Map ──
const cellLookup = new Map<string, HexCell>();
for (const c of hexMap) cellLookup.set(`${c.col},${c.row}`, c);

// ── 最寄りHEX検索用の空間インデックス（グリッド分割） ──
const GRID_SIZE = 60;
const spatialGrid = new Map<string, HexCell[]>();
for (const c of hexMap) {
  const gx = Math.floor(c.x / GRID_SIZE);
  const gy = Math.floor(c.y / GRID_SIZE);
  const key = `${gx},${gy}`;
  const arr = spatialGrid.get(key);
  if (arr) arr.push(c);
  else spatialGrid.set(key, [c]);
}

function findNearestHex(bx: number, by: number): HexCell | null {
  const gx = Math.floor(bx / GRID_SIZE);
  const gy = Math.floor(by / GRID_SIZE);
  let best: HexCell | null = null;
  let bestDist = Infinity;
  // 周囲9グリッドを探索
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cells = spatialGrid.get(`${gx + dx},${gy + dy}`);
      if (!cells) continue;
      for (const c of cells) {
        const dist = (c.x - bx) ** 2 + (c.y - by) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
    }
  }
  // HEX半径 26px → 閾値 26² ≈ 676 （少し余裕を持って 784 = 28²）
  return bestDist <= 784 ? best : null;
}

// ================================================================

interface HexBoardProps {
  pieces: PieceData[];
  selectedPieceId: string | null;
  actionMode: ActionMode;
  orders: Map<string, OrderData>;
  highlightHexes: HexCoord[];
  zocHexes: { own: HexCoord[]; opponent: HexCoord[] };
  offsideLine: number | null;
  onSelectPiece: (pieceId: string | null) => void;
  onHexClick: (coord: HexCoord) => void;
  isMobile: boolean;
  showZoneBorders?: boolean;
}

export default function HexBoard({
  pieces,
  selectedPieceId,
  actionMode,
  orders,
  highlightHexes,
  zocHexes,
  offsideLine,
  onSelectPiece,
  onHexClick,
  isMobile,
  showZoneBorders = true,
}: HexBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [hoverCoord, setHoverCoord] = useState<HexCoord | null>(null);

  // ── 初期表示: ボード全体をフィット ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTransform(fitToContainer(rect.width, rect.height, BOARD_WIDTH, BOARD_HEIGHT));
  }, []);

  // ── ズーム / パン ──
  const {
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    wasDragging,
  } = useControls({
    containerRef,
    transform,
    setTransform,
    boardWidth: BOARD_WIDTH,
    boardHeight: BOARD_HEIGHT,
  });

  // ── §2-6 スマホ自動ズーム: コマ選択時にフォーカス ──
  useEffect(() => {
    if (!isMobile || !selectedPieceId || !containerRef.current) return;
    const piece = pieces.find((p) => p.id === selectedPieceId);
    if (!piece) return;
    const cell = cellLookup.get(`${piece.coord.col},${piece.coord.row}`);
    if (!cell) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scale = 2.5;
    setTransform({
      scale,
      x: rect.width / 2 - cell.x * scale,
      y: rect.height / 2 - cell.y * scale,
    });
  }, [selectedPieceId, isMobile, pieces]);

  // ── スクリーン座標 → ボード座標 ──
  const screenToBoard = useCallback(
    (clientX: number, clientY: number): { bx: number; by: number } | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const bx = (clientX - rect.left - transform.x) / transform.scale;
      const by = (clientY - rect.top - transform.y) / transform.scale;
      return { bx, by };
    },
    [transform],
  );

  // ── クリック / タップ ──
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (wasDragging()) return; // ドラッグ操作だった場合は無視

      const board = screenToBoard(e.clientX, e.clientY);
      if (!board) return;
      const cell = findNearestHex(board.bx, board.by);
      if (!cell) {
        onSelectPiece(null);
        return;
      }

      // そのHEXにコマがあるか
      const pieceOnHex = pieces.find(
        (p) => p.coord.col === cell.col && p.coord.row === cell.row,
      );

      if (pieceOnHex) {
        onSelectPiece(pieceOnHex.id);
      } else {
        onHexClick({ col: cell.col, row: cell.row });
      }
    },
    [pieces, onSelectPiece, onHexClick, screenToBoard, wasDragging],
  );

  // ── PC マウスホバー（§3-6 予測線） ──
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      const board = screenToBoard(e.clientX, e.clientY);
      if (!board) return;
      const cell = findNearestHex(board.bx, board.by);
      setHoverCoord(cell ? { col: cell.col, row: cell.row } : null);
    },
    [isMobile, screenToBoard],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverCoord(null);
  }, []);

  // ================================================================
  // レンダリング
  // ================================================================
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        background: '#1a1a2e',
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── ボード全体を CSS transform で変換 ── */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {/* ════════════════════════════════════════
            レイヤー 1: 背景画像（§6-1）
            芝生 + HEXグリッド + 白線 + ゴール
            画像ソフトで事前描画した1枚絵
            ════════════════════════════════════════ */}
        <img
          src="/assets/board/board_mobile.png"
          alt="Football Chess Board"
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            zIndex: 0,
            userSelect: 'none',
            // 画像が無い場合のフォールバック背景
            background: 'linear-gradient(180deg, #2d5a27 0%, #3a7a30 50%, #2d5a27 100%)',
          }}
        />

        {/* ════════════════════════════════════════
            レイヤー 2: Canvas オーバーレイ（§6-1）
            ZOCハイライト・移動範囲・パスライン等
            ════════════════════════════════════════ */}
        <Overlay
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          highlightHexes={highlightHexes}
          zocHexes={zocHexes}
          offsideLine={offsideLine}
          selectedPieceId={selectedPieceId}
          actionMode={actionMode}
          orders={orders}
          pieces={pieces}
          hexMap={hexMap}
          showZoneBorders={showZoneBorders}
          hoverCoord={hoverCoord}
        />

        {/* ════════════════════════════════════════
            レイヤー 3: コマレイヤー（§6-1）
            スプライト画像を座標マップに従って絶対配置
            ════════════════════════════════════════ */}
        {pieces.map((piece) => {
          const cell = cellLookup.get(`${piece.coord.col},${piece.coord.row}`);
          if (!cell) return null;
          return (
            <Piece
              key={piece.id}
              piece={piece}
              x={cell.x}
              y={cell.y}
              isSelected={piece.id === selectedPieceId}
              hasOrder={orders.has(piece.id)}
              order={orders.get(piece.id)}
              size={isMobile ? 32 : 28}
            />
          );
        })}
      </div>
    </div>
  );
}
