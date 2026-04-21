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

import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import type { PieceData, HexCoord, HexCell, OrderData, ActionMode } from '../../types';
import { MAX_ROW } from '../../types';
import hexMapData from '../../data/hex_map.json';
import Piece from './Piece';
import type { BallTrail } from './Overlay';
import Overlay from './Overlay';
import FlyingBall, { type FlyingBallData } from '../FlyingBall';
import { useControls, fitToContainer, type Transform } from './Controls';

const hexMap = hexMapData as HexCell[];

// ── ボード論理サイズ（hex_map.json 座標範囲 + マージン） ──
// x: 30 – 975,  y: 25.98 – 1766.69
const BOARD_PADDING = 30;
const BOARD_WIDTH = 975 + BOARD_PADDING * 2;   // ≈ 1035
const BOARD_HEIGHT = 1767 + BOARD_PADDING * 2;  // ≈ 1827

/** クリック判定の距離閾値²（HEX_R=26 + 余裕2px = 28² = 784） */
const HEX_CLICK_RADIUS_SQ = 784;
/** スマホ: コマ選択時の自動ズームスケール */
const AUTO_FOCUS_ZOOM_SCALE = 2.5;

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
  return bestDist <= HEX_CLICK_RADIUS_SQ ? best : null;
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
  /** ボールアイコンクリック（コマ本体とは別のタッチ対象） */
  onBallClick?: (pieceId: string) => void;
  /** チェーンパスのボールタッチ待ちコマID（ボールが光る） */
  chainBallPulseId?: string | null;
  isMobile: boolean;
  showZoneBorders?: boolean;
  myTeam?: 'home' | 'away';
  /** Y座標を反転して表示（homeプレイヤーが常に画面下側に来るようにする） */
  flipY?: boolean;
  /** シュート可能範囲のHEX */
  shootRangeHexes?: HexCoord[];
  /** ロングパス警告 */
  longPassWarnings?: Map<string, number>;
  /** フェーズ演出エフェクト（§5-1b） */
  phaseEffects?: Array<{ coord: HexCoord; icon: string; color: string; text?: string }>;
  /** ボール軌跡（EXECUTIONフェーズ中に描画） */
  ballTrails?: BallTrail[];
  /** フリーボール位置（誰も持っていない場合に表示） */
  freeBallHex?: import('../../types').HexCoord | null;
  /** ボールアクションメニュー表示中のpieceId（null=非表示） */
  ballActionMenu?: string | null;
  /** パスボタン押下 */
  onActionPass?: () => void;
  /** ドリブルボタン押下 */
  onActionDribble?: () => void;
  /** キャンセル */
  onActionCancel?: () => void;
  /** ボール飛行アニメーションデータ */
  flyingBall?: FlyingBallData | null;
  /** ボール飛行完了コールバック */
  onFlyingBallComplete?: () => void;
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
  onBallClick,
  chainBallPulseId,
  isMobile,
  showZoneBorders = true,
  myTeam = 'home',
  flipY = false,
  shootRangeHexes = [],
  longPassWarnings,
  phaseEffects = [],
  ballTrails = [],
  freeBallHex,
  ballActionMenu,
  onActionPass,
  onActionDribble,
  onActionCancel,
  flyingBall,
  onFlyingBallComplete,
}: HexBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [hoverCoord, setHoverCoord] = useState<HexCoord | null>(null);

  // ── flipY: 表示用にコマ座標を反転 ──
  // ゲーム座標(col, row) → 表示座標(col, MAX_ROW - row) でhomeが画面下に来る
  const flipRow = useCallback((row: number) => flipY ? MAX_ROW - row : row, [flipY]);

  /** 表示用コマ（座標反転済み） */
  const displayPieces = useMemo(() => {
    if (!flipY) return pieces;
    return pieces.map(p => ({
      ...p,
      coord: { col: p.coord.col, row: MAX_ROW - p.coord.row },
    }));
  }, [pieces, flipY]);

  /** 表示用指示（targetHex座標反転済み） */
  const displayOrders = useMemo(() => {
    if (!flipY) return orders;
    const flipped = new Map<string, OrderData>();
    for (const [id, order] of orders) {
      flipped.set(id, {
        ...order,
        targetHex: order.targetHex
          ? { col: order.targetHex.col, row: MAX_ROW - order.targetHex.row }
          : undefined,
      });
    }
    return flipped;
  }, [orders, flipY]);

  /** 表示用ハイライトHEX（flipY反転済み） */
  const displayHighlightHexes = useMemo(() => {
    if (!flipY) return highlightHexes;
    return highlightHexes.map(h => ({ col: h.col, row: MAX_ROW - h.row }));
  }, [highlightHexes, flipY]);

  /** 表示用ZOC（flipY反転済み） */
  const displayZocHexes = useMemo(() => {
    if (!flipY) return zocHexes;
    return {
      own: zocHexes.own.map(h => ({ col: h.col, row: MAX_ROW - h.row })),
      opponent: zocHexes.opponent.map(h => ({ col: h.col, row: MAX_ROW - h.row })),
    };
  }, [zocHexes, flipY]);

  /** 表示用オフサイドライン（flipY反転済み） */
  const displayOffsideLine = useMemo(() => {
    if (offsideLine === null || !flipY) return offsideLine;
    return MAX_ROW - offsideLine;
  }, [offsideLine, flipY]);

  /** 表示用シュート範囲（flipY反転済み） */
  const displayShootRangeHexes = useMemo(() => {
    if (!flipY) return shootRangeHexes;
    return shootRangeHexes.map(h => ({ col: h.col, row: MAX_ROW - h.row }));
  }, [shootRangeHexes, flipY]);

  /** 表示用フェーズエフェクト（flipY反転済み） */
  const displayPhaseEffects = useMemo(() => {
    if (!flipY) return phaseEffects;
    return phaseEffects.map(e => ({ ...e, coord: { col: e.coord.col, row: MAX_ROW - e.coord.row } }));
  }, [phaseEffects, flipY]);

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
    const displayRow = flipRow(piece.coord.row);
    const cell = cellLookup.get(`${piece.coord.col},${displayRow}`);
    if (!cell) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scale = AUTO_FOCUS_ZOOM_SCALE;
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

      // 表示座標 → ゲーム座標に変換
      const gameRow = flipRow(cell.row);
      const gameCoord: HexCoord = { col: cell.col, row: gameRow };

      // そのHEXにコマがあるか（ゲーム座標で比較）
      const pieceOnHex = pieces.find(
        (p) => p.coord.col === gameCoord.col && p.coord.row === gameCoord.row,
      );

      // ── コマが既に選択されている場合 ──
      if (selectedPieceId) {
        const selectedPc = pieces.find(p => p.id === selectedPieceId);

        // 同じコマをタップ → 選択解除
        if (pieceOnHex && pieceOnHex.id === selectedPieceId) {
          onSelectPiece(null);
          return;
        }

        // ボール保持者が選択中 → 全クリックをアクション処理に転送
        // （handleHexClick側でドリブル/パス/シュートを自動判定）
        if (selectedPc?.hasBall) {
          onHexClick(gameCoord);
          return;
        }

        // ボール非保持者: 別のコマをタップ → そのコマを選択
        if (pieceOnHex) {
          onSelectPiece(pieceOnHex.id);
          return;
        }

        // ボール非保持者: 空きHEXをタップ → 移動命令
        onHexClick(gameCoord);
        return;
      }

      // ── コマ未選択 ──
      if (pieceOnHex) {
        onSelectPiece(pieceOnHex.id);
      } else {
        onSelectPiece(null);
      }
    },
    [pieces, selectedPieceId, onSelectPiece, onHexClick, screenToBoard, wasDragging, flipRow],
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
            ※ displayPieces/displayOrders で表示座標系を使用
            ════════════════════════════════════════ */}
        <Overlay
          width={BOARD_WIDTH}
          height={BOARD_HEIGHT}
          highlightHexes={displayHighlightHexes}
          zocHexes={displayZocHexes}
          offsideLine={displayOffsideLine}
          selectedPieceId={selectedPieceId}
          actionMode={actionMode}
          orders={displayOrders}
          pieces={displayPieces}
          hexMap={hexMap}
          showZoneBorders={showZoneBorders}
          hoverCoord={hoverCoord}
          shootRangeHexes={displayShootRangeHexes}
          longPassWarnings={longPassWarnings}
          phaseEffects={displayPhaseEffects}
          ballTrails={flipY ? ballTrails.map(t => ({
            ...t,
            from: { col: t.from.col, row: MAX_ROW - t.from.row },
            to: { col: t.to.col, row: MAX_ROW - t.to.row },
          })) : ballTrails}
        />

        {/* ════════════════════════════════════════
            レイヤー 3: コマレイヤー（§6-1）
            スプライト画像を座標マップに従って絶対配置
            ※ displayPieces で表示座標系を使用
            ════════════════════════════════════════ */}
        {(() => {
          // 同一HEXに複数コマがいる場合のオフセット計算
          const hexPieceCount = new Map<string, number>();
          const hexPieceIndex = new Map<string, number>();
          for (const p of displayPieces) {
            const k = `${p.coord.col},${p.coord.row}`;
            hexPieceCount.set(k, (hexPieceCount.get(k) ?? 0) + 1);
          }
          for (const p of displayPieces) {
            const k = `${p.coord.col},${p.coord.row}`;
            hexPieceIndex.set(p.id, (hexPieceIndex.get(k) ?? 0));
            hexPieceIndex.set(k, (hexPieceIndex.get(k) ?? 0) + 1);
          }
          // Re-index properly
          const idxTracker = new Map<string, number>();
          return displayPieces.map((piece) => {
            const cell = cellLookup.get(`${piece.coord.col},${piece.coord.row}`);
            if (!cell) return null;
            const k = `${piece.coord.col},${piece.coord.row}`;
            const count = hexPieceCount.get(k) ?? 1;
            const idx = idxTracker.get(k) ?? 0;
            idxTracker.set(k, idx + 1);
            // オフセット: 2個なら左右16px、3個以上なら円形配置
            let ox = 0, oy = 0;
            if (count === 2) {
              ox = idx === 0 ? -12 : 12;
            } else if (count >= 3) {
              const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
              ox = Math.round(Math.cos(angle) * 14);
              oy = Math.round(Math.sin(angle) * 14);
            }
            return (
              <Piece
                key={piece.id}
                piece={piece}
                x={cell.x + ox}
                y={cell.y + oy}
                isSelected={piece.id === selectedPieceId}
                hasOrder={displayOrders.has(piece.id)}
                order={displayOrders.get(piece.id)}
                myTeam={myTeam}
                onBallClick={onBallClick}
                ballPulse={piece.id === chainBallPulseId}
              />
            );
          });
        })()}

        {/* ボールアクションメニュー（選択コマの近くに表示） */}
        {ballActionMenu && (() => {
          const piece = displayPieces.find(p => p.id === ballActionMenu);
          if (!piece) return null;
          const cell = cellLookup.get(`${piece.coord.col},${piece.coord.row}`);
          if (!cell) return null;
          const aboveY = cell.y - 70;
          const menuY = aboveY < 10 ? cell.y + 50 : aboveY; // 上端はみ出し→下に
          const menuX = Math.max(120, Math.min(cell.x, BOARD_WIDTH - 120)); // 左右はみ出し防止
          return (
            <div
              style={{
                position: 'absolute', left: menuX, top: menuY,
                transform: 'translateX(-50%)',
                display: 'flex', gap: 6, zIndex: 200, pointerEvents: 'auto',
              }}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <button
                onPointerDown={(e) => { e.stopPropagation(); onActionPass?.(); }}
                style={{
                  minWidth: 90, minHeight: 44, padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff',
                  fontSize: 15, fontWeight: 'bold', cursor: 'pointer',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.5)',
                }}
              >⚽ パス</button>
              <button
                onPointerDown={(e) => { e.stopPropagation(); onActionDribble?.(); }}
                style={{
                  minWidth: 90, minHeight: 44, padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #16A34A, #22C55E)', color: '#fff',
                  fontSize: 15, fontWeight: 'bold', cursor: 'pointer',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.5)',
                }}
              >🏃 ドリブル</button>
            </div>
          );
        })()}

        {/* ボール飛行アニメーション（transformコンテナ内） */}
        {flyingBall && onFlyingBallComplete && (
          <FlyingBall data={flyingBall} onComplete={onFlyingBallComplete} />
        )}

        {/* フリーボール表示 */}
        {freeBallHex && (() => {
          const fbCoord = flipY ? { col: freeBallHex.col, row: MAX_ROW - freeBallHex.row } : freeBallHex;
          const cell = cellLookup.get(`${fbCoord.col},${fbCoord.row}`);
          if (!cell) return null;
          const sz = 40;
          return (
            <div style={{
              position: 'absolute', left: cell.x - sz / 2, top: cell.y - sz / 2,
              width: sz, height: sz, zIndex: 15, pointerEvents: 'none',
              animation: 'fcms-free-ball-bounce 1.5s ease-in-out infinite',
              filter: 'drop-shadow(0 0 8px rgba(255,255,0,0.6))',
            }}>
              <style>{`@keyframes fcms-free-ball-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`}</style>
              <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
                <circle cx={sz / 2} cy={sz / 2} r={sz / 2 - 2} fill="white" stroke="#333" strokeWidth={1.5} />
                {Array.from({ length: 5 }, (_, i) => {
                  const a = ((i * 72 - 90) * Math.PI) / 180;
                  return <circle key={i} cx={sz / 2 + (sz * 0.3) * Math.cos(a)} cy={sz / 2 + (sz * 0.3) * Math.sin(a)} r={3} fill="#333" />;
                })}
              </svg>
              <div style={{
                position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)',
                fontSize: 8, color: '#ffcc00', fontWeight: 'bold', textShadow: '0 0 3px #000',
              }}>FREE</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
