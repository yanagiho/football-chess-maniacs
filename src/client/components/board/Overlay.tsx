// ============================================================
// Overlay.tsx — Canvas オーバーレイ（§1-3, §6-2）
// ZOCハイライト・移動範囲・パスライン・シュートコース
// オフサイドライン・ゾーン境界線・移動矢印
// PC: マウスホバー予測線（§3-6）
// ============================================================

import React, { useRef, useEffect } from 'react';
import type { HexCoord, HexCell, PieceData, OrderData, ActionMode } from '../../types';
import { renderBallTrails, renderPhaseEffects } from './overlay_renderers';

/** ボール軌跡（EXECUTIONフェーズ中に表示） */
export interface BallTrail {
  from: HexCoord;
  to: HexCoord;
  type: 'pass' | 'throughPass' | 'passCut' | 'dribble' | 'shoot';
  result?: 'success' | 'blocked' | 'goal' | 'saved' | 'cut';
}

interface OverlayProps {
  width: number;
  height: number;
  highlightHexes: HexCoord[];
  zocHexes: { own: HexCoord[]; opponent: HexCoord[] };
  offsideLine: number | null;
  selectedPieceId: string | null;
  actionMode: ActionMode;
  orders: Map<string, OrderData>;
  pieces: PieceData[];
  hexMap: HexCell[];
  showZoneBorders: boolean;
  /** PC用: マウスカーソルのボード座標（null ならホバー無し） */
  hoverCoord: HexCoord | null;
  /** シュート可能範囲のHEX（シュートモード時にハイライト表示） */
  shootRangeHexes?: HexCoord[];
  /** ロングパス警告を表示するorder pieceId → パス距離 */
  longPassWarnings?: Map<string, number>;
  /** 演出フェーズ中のイベントアイコン表示（§5-1b） */
  phaseEffects?: Array<{ coord: HexCoord; icon: string; color: string; text?: string }>;
  /** ボール軌跡（EXECUTIONフェーズ中に描画） */
  ballTrails?: BallTrail[];
}

/** flat-top HEX の半径（hex_map.json の間隔から算出） */
const HEX_R = 26;
/** flat-top HEX の角度オフセット（0°が右） */
const FLAT_TOP_OFFSET = 0;

// ── 描画色定数（§6-2 HEXマス色） ──
const COLORS = {
  ownZoc: 'rgba(60, 120, 220, 0.20)',       // ZOC（自分）: 薄い青
  opponentZoc: 'rgba(220, 60, 60, 0.20)',    // ZOC（相手）: 薄い赤
  moveRange: 'rgba(80, 200, 80, 0.30)',      // 移動可能: 緑ハイライト
  moveRangeZoc: 'rgba(80, 200, 80, 0.18)',   // ZOC進入（移動可能だが停止する）
  moveRangeOutline: 'rgba(80, 200, 80, 0.5)',
  zocStripe: 'rgba(200, 60, 60, 0.30)',      // ZOC進入の赤緑縞模様
  moveArrow: 'rgba(255,255,255,0.55)',       // 移動矢印: 白
  dribbleArrow: 'rgba(80, 200, 80, 0.70)',   // ドリブル矢印: 緑
  passLine: 'rgba(60, 140, 255, 0.70)',      // パスコース: 青い線
  passLineDanger: 'rgba(255, 160, 40, 0.75)',// パスコース危険（ZOC通過）: オレンジ
  shootArrow: 'rgba(255, 50, 50, 0.80)',     // シュートコース: 赤い線
  throughPassLine: 'rgba(0, 210, 210, 0.70)', // スルーパスコース: シアン点線
  shootRange: 'rgba(255, 60, 60, 0.15)',     // シュート可能範囲
  shootRangeOutline: 'rgba(255, 60, 60, 0.35)',
  offsideLine: 'rgba(255, 220, 40, 0.55)',   // オフサイドライン: 黄色点線
  zoneBorder: 'rgba(255,255,255,0.12)',      // ゾーン境界線
  longPassWarning: '#ff8800',                // ロングパス警告
  // ホバー予測線
  hoverPassSafe: 'rgba(60,140,255,0.40)',
  hoverPassDanger: 'rgba(255,160,40,0.40)',
  hoverShoot: 'rgba(255,50,50,0.40)',
  hoverMove: 'rgba(255,255,255,0.30)',
} as const;

// ── 描画サイズ定数 ──
const ARROW_WIDTH_MOVE = 2;
const ARROW_WIDTH_ACTION = 3;
const ARROW_HEAD_LEN = 12;
const ARROW_HEAD_LEN_MOVE = 10;
const PASS_LINE_WIDTH = 2.5;
const PASS_LINE_DASH: [number, number] = [8, 5];
const PASS_DOT_RADIUS = 5;
const OFFSIDE_LINE_WIDTH = 2;
const OFFSIDE_LINE_DASH: [number, number] = [10, 7];
const HOVER_LINE_WIDTH = 1.5;
const HOVER_LINE_DASH: [number, number] = [6, 4];
const HOVER_MOVE_DASH: [number, number] = [4, 4];
const ZOC_STRIPE_STEP = 6;
const ZOC_STRIPE_WIDTH = 2;
const ZONE_BORDER_WIDTH = 1;
const MOVE_RANGE_OUTLINE_WIDTH = 1;

export default function Overlay({
  width,
  height,
  highlightHexes,
  zocHexes,
  offsideLine,
  selectedPieceId,
  actionMode,
  orders,
  pieces,
  hexMap,
  showZoneBorders,
  hoverCoord,
  shootRangeHexes = [],
  longPassWarnings,
  phaseEffects = [],
  ballTrails = [],
}: OverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // セル検索用のMap（高速化）
    const cellMap = new Map<string, HexCell>();
    for (const c of hexMap) cellMap.set(`${c.col},${c.row}`, c);
    const findCell = (coord: HexCoord) => cellMap.get(`${coord.col},${coord.row}`);

    // ================================================================
    // 1. ゾーン境界線（§1-3: 常時, ON/OFF切替可）
    // ================================================================
    if (showZoneBorders) {
      drawZoneBorders(ctx, hexMap, cellMap);
    }

    // ================================================================
    // 2. ZOC表示（§1-3: コマ選択時のみ）
    // ================================================================
    if (selectedPieceId) {
      for (const hex of zocHexes.own) {
        const cell = findCell(hex);
        if (cell) drawHex(ctx, cell.x, cell.y, HEX_R, COLORS.ownZoc);
      }
      for (const hex of zocHexes.opponent) {
        const cell = findCell(hex);
        if (cell) drawHex(ctx, cell.x, cell.y, HEX_R, COLORS.opponentZoc);
      }
    }

    // ================================================================
    // 3. 移動可能範囲（§6-2）
    // ================================================================
    const opponentZocSet = new Set(zocHexes.opponent.map((z) => `${z.col},${z.row}`));

    for (const hex of highlightHexes) {
      const cell = findCell(hex);
      if (!cell) continue;

      if (opponentZocSet.has(`${hex.col},${hex.row}`)) {
        drawHex(ctx, cell.x, cell.y, HEX_R, COLORS.moveRangeZoc);
        drawHexStripes(ctx, cell.x, cell.y, HEX_R);
      } else {
        drawHex(ctx, cell.x, cell.y, HEX_R, COLORS.moveRange);
      }
      drawHexOutline(ctx, cell.x, cell.y, HEX_R, COLORS.moveRangeOutline, MOVE_RANGE_OUTLINE_WIDTH);
    }

    // ================================================================
    // 4. 指示済みコマの移動矢印（白）+ ドリブル矢印（緑）
    // ================================================================
    for (const [, order] of orders) {
      if (!order.targetHex) continue;
      if (order.action !== 'move' && order.action !== 'dribble') continue;
      const piece = pieces.find((p) => p.id === order.pieceId);
      if (!piece) continue;
      const fromCell = findCell(piece.coord);
      const toCell = findCell(order.targetHex);
      if (!fromCell || !toCell) continue;
      if (order.action === 'dribble') {
        drawArrow(ctx, fromCell.x, fromCell.y, toCell.x, toCell.y, COLORS.dribbleArrow, ARROW_WIDTH_ACTION, ARROW_HEAD_LEN);
      } else {
        drawArrow(ctx, fromCell.x, fromCell.y, toCell.x, toCell.y, COLORS.moveArrow, ARROW_WIDTH_MOVE, ARROW_HEAD_LEN_MOVE);
      }
    }

    // ================================================================
    // 5. パスライン（§6-2: 青い線 / ZOC通過でオレンジ）
    // ================================================================
    for (const [, order] of orders) {
      if (order.action !== 'pass' || !order.targetPieceId) continue;
      const passer = pieces.find((p) => p.id === order.pieceId);
      const receiver = pieces.find((p) => p.id === order.targetPieceId);
      if (!passer || !receiver) continue;
      const fromCell = findCell(passer.coord);
      const toCell = findCell(receiver.coord);
      if (!fromCell || !toCell) continue;

      const crossesZoc = doesLineCrossZoc(
        fromCell.x, fromCell.y, toCell.x, toCell.y, zocHexes.opponent, cellMap,
      );
      const color = crossesZoc ? COLORS.passLineDanger : COLORS.passLine;
      drawDashedLine(ctx, fromCell.x, fromCell.y, toCell.x, toCell.y, color, PASS_LINE_WIDTH, PASS_LINE_DASH);
      drawDot(ctx, toCell.x, toCell.y, PASS_DOT_RADIUS, color);
    }

    // ================================================================
    // 5b. スルーパスライン（シアン点線）
    // ================================================================
    for (const [, order] of orders) {
      if (order.action !== 'throughPass' || !order.targetHex) continue;
      const passer = pieces.find((p) => p.id === order.pieceId);
      if (!passer) continue;
      const fromCell = findCell(passer.coord);
      const toCell = findCell(order.targetHex);
      if (!fromCell || !toCell) continue;
      drawDashedLine(ctx, fromCell.x, fromCell.y, toCell.x, toCell.y, COLORS.throughPassLine, PASS_LINE_WIDTH, PASS_LINE_DASH);
      drawDot(ctx, toCell.x, toCell.y, PASS_DOT_RADIUS, COLORS.throughPassLine);
    }

    // ================================================================
    // 6. シュートコース（§6-2: 赤い線）
    // ================================================================
    for (const [, order] of orders) {
      if (order.action !== 'shoot' || !order.targetHex) continue;
      const shooter = pieces.find((p) => p.id === order.pieceId);
      if (!shooter) continue;
      const fromCell = findCell(shooter.coord);
      const toCell = findCell(order.targetHex);
      if (!fromCell || !toCell) continue;
      drawArrow(ctx, fromCell.x, fromCell.y, toCell.x, toCell.y, COLORS.shootArrow, ARROW_WIDTH_ACTION, ARROW_HEAD_LEN);
    }

    // ================================================================
    // 6b. シュート可能範囲（§6-2: 赤い半透明ハイライト）
    // ================================================================
    for (const hex of shootRangeHexes) {
      const cell = findCell(hex);
      if (cell) {
        drawHex(ctx, cell.x, cell.y, HEX_R, COLORS.shootRange);
        drawHexOutline(ctx, cell.x, cell.y, HEX_R, COLORS.shootRangeOutline, MOVE_RANGE_OUTLINE_WIDTH);
      }
    }

    // ================================================================
    // 6c. ロングパス警告（パスライン上に「LONG」テキスト）
    // ================================================================
    if (longPassWarnings) {
      for (const [pieceId, dist] of longPassWarnings) {
        const order = orders.get(pieceId);
        if (!order || order.action !== 'pass' || !order.targetPieceId) continue;
        const passer = pieces.find(p => p.id === order.pieceId);
        const receiver = pieces.find(p => p.id === order.targetPieceId);
        if (!passer || !receiver) continue;
        const fromCell = findCell(passer.coord);
        const toCell = findCell(receiver.coord);
        if (!fromCell || !toCell) continue;
        const mx = (fromCell.x + toCell.x) / 2;
        const my = (fromCell.y + toCell.y) / 2;
        ctx.save();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = COLORS.longPassWarning;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`LONG (${dist}HEX)`, mx, my - 10);
        ctx.restore();
      }
    }

    // ================================================================
    // 6c. ボール軌跡（EXECUTIONフェーズ）
    // ================================================================
    renderBallTrails(ctx, ballTrails, findCell);

    // ================================================================
    // 6d. フェーズ演出エフェクト（§5-1b: アイコン + テキスト）
    // ================================================================
    renderPhaseEffects(ctx, phaseEffects, findCell);

    // ================================================================
    // 7. オフサイドライン（§6-2: 黄色の点線, §1-3: 常時ON/OFF切替可）
    // ================================================================
    if (offsideLine !== null) {
      // 同一 row の先頭セルの y を取得
      const cell = hexMap.find((h) => h.row === offsideLine);
      if (cell) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, cell.y);
        ctx.lineTo(width, cell.y);
        ctx.strokeStyle = COLORS.offsideLine;
        ctx.lineWidth = OFFSIDE_LINE_WIDTH;
        ctx.setLineDash(OFFSIDE_LINE_DASH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // ================================================================
    // 8. PC マウスホバー予測線（§3-6）
    // ================================================================
    if (hoverCoord && selectedPieceId) {
      const selPiece = pieces.find((p) => p.id === selectedPieceId);
      if (selPiece) {
        const fromCell = findCell(selPiece.coord);
        const toCell = findCell(hoverCoord);
        if (fromCell && toCell) {
          if (actionMode === 'pass') {
            const crosses = doesLineCrossZoc(
              fromCell.x, fromCell.y, toCell.x, toCell.y, zocHexes.opponent, cellMap,
            );
            const c = crosses ? COLORS.hoverPassDanger : COLORS.hoverPassSafe;
            drawDashedLine(ctx, fromCell.x, fromCell.y, toCell.x, toCell.y, c, HOVER_LINE_WIDTH, HOVER_LINE_DASH);
          } else if (actionMode === 'shoot') {
            drawDashedLine(ctx, fromCell.x, fromCell.y, toCell.x, toCell.y, COLORS.hoverShoot, HOVER_LINE_WIDTH, HOVER_LINE_DASH);
          } else {
            drawDashedLine(ctx, fromCell.x, fromCell.y, toCell.x, toCell.y, COLORS.hoverMove, HOVER_LINE_WIDTH, HOVER_MOVE_DASH);
          }
        }
      }
    }
  }, [
    width, height, highlightHexes, zocHexes, offsideLine,
    selectedPieceId, actionMode, orders, pieces, hexMap,
    showZoneBorders, hoverCoord, shootRangeHexes, longPassWarnings,
    phaseEffects, ballTrails,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 50 }}
    />
  );
}

// ================================================================
// 描画ヘルパー
// ================================================================

/** flat-top HEX を塗りつぶす */
function drawHex(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + FLAT_TOP_OFFSET;
    const hx = cx + r * Math.cos(angle);
    const hy = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** flat-top HEX のアウトライン */
function drawHexOutline(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, lineWidth: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + FLAT_TOP_OFFSET;
    const hx = cx + r * Math.cos(angle);
    const hy = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/** §6-2 ZOC進入の赤緑縞模様（HEXにクリップして斜線） */
function drawHexStripes(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  // HEXでクリップ
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + FLAT_TOP_OFFSET;
    const hx = cx + r * Math.cos(angle);
    const hy = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.clip();

  ctx.strokeStyle = COLORS.zocStripe;
  ctx.lineWidth = ZOC_STRIPE_WIDTH;
  const step = ZOC_STRIPE_STEP;
  for (let d = -r * 2; d < r * 2; d += step) {
    ctx.beginPath();
    ctx.moveTo(cx + d, cy - r);
    ctx.lineTo(cx + d + r, cy + r);
    ctx.stroke();
  }
  ctx.restore();
}

/** 破線 */
function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, lineWidth: number, dash: number[],
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** 矢印 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  color: string, lineWidth: number, headLen: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;

  // シャフト
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // ヘッド
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 小さなドット */
function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

// ================================================================
// ゾーン境界線（§1-3）
// ================================================================

/** ゾーン/レーンが切り替わるセルの境界を検出して線を引く */
function drawZoneBorders(
  ctx: CanvasRenderingContext2D,
  hexMap: HexCell[],
  cellMap: Map<string, HexCell>,
) {
  ctx.save();
  ctx.strokeStyle = COLORS.zoneBorder;
  ctx.lineWidth = ZONE_BORDER_WIDTH;

  // row 方向でゾーン境界を検出
  const zoneByRow = new Map<number, string>();
  for (const cell of hexMap) {
    if (!zoneByRow.has(cell.row)) zoneByRow.set(cell.row, cell.zone);
  }
  const rows = [...zoneByRow.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] !== rows[i - 1][1]) {
      // ゾーン変更行 → 水平線
      const prevCells = hexMap.filter((c) => c.row === rows[i - 1][0]);
      const currCells = hexMap.filter((c) => c.row === rows[i][0]);
      if (prevCells.length > 0 && currCells.length > 0) {
        const y = (prevCells[0].y + currCells[0].y) / 2;
        const minX = Math.min(...currCells.map((c) => c.x));
        const maxX = Math.max(...currCells.map((c) => c.x));
        ctx.beginPath();
        ctx.moveTo(minX - HEX_R, y);
        ctx.lineTo(maxX + HEX_R, y);
        ctx.stroke();
      }
    }
  }

  // col 方向でレーン境界を検出
  const laneByCol = new Map<number, string>();
  for (const cell of hexMap) {
    if (!laneByCol.has(cell.col)) laneByCol.set(cell.col, cell.lane);
  }
  const cols = [...laneByCol.entries()].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < cols.length; i++) {
    if (cols[i][1] !== cols[i - 1][1]) {
      const prevCells = hexMap.filter((c) => c.col === cols[i - 1][0]);
      const currCells = hexMap.filter((c) => c.col === cols[i][0]);
      if (prevCells.length > 0 && currCells.length > 0) {
        const x = (prevCells[0].x + currCells[0].x) / 2;
        const minY = Math.min(...currCells.map((c) => c.y));
        const maxY = Math.max(...currCells.map((c) => c.y));
        ctx.beginPath();
        ctx.moveTo(x, minY - HEX_R);
        ctx.lineTo(x, maxY + HEX_R);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

// ================================================================
// パスコースがZOCを横切るか判定（§6-2 パスコース危険）
// ================================================================

function doesLineCrossZoc(
  x1: number, y1: number, x2: number, y2: number,
  opponentZocHexes: HexCoord[],
  cellMap: Map<string, HexCell>,
): boolean {
  for (const hex of opponentZocHexes) {
    const cell = cellMap.get(`${hex.col},${hex.row}`);
    if (!cell) continue;
    // 線分とHEX中心との距離がHEX_R以下なら交差とみなす
    const dist = pointToSegmentDist(cell.x, cell.y, x1, y1, x2, y2);
    if (dist < HEX_R) return true;
  }
  return false;
}

/** 点から線分への最短距離 */
function pointToSegmentDist(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}
