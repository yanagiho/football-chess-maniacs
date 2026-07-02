// ============================================================
// overlay_renderers.ts — Canvas描画レイヤー関数
//
// Overlay.tsx の useEffect 内の描画セクションを関数として抽出。
// ============================================================

import type { HexCoord, HexCell } from '../../types';
import type { BallTrail } from './Overlay';

type FindCell = (coord: HexCoord) => HexCell | undefined;

// ================================================================
// ボール軌跡（EXECUTIONフェーズ）
// ================================================================

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 軌跡の飛行進捗（0〜1）。
 * flight情報なし（静的軌跡）と prefers-reduced-motion 時は常に 1（＝従来通り完成線を即描画）。
 */
export function trailProgress(trail: BallTrail, now: number): number {
  if (!trail.flight || reducedMotion) return 1;
  const { startedAt, durationMs } = trail.flight;
  if (durationMs <= 0) return 1;
  return Math.max(0, Math.min(1, (now - startedAt) / durationMs));
}

/** 飛行中（進捗<1）の軌跡が1本でもあるか。Overlay が rAF 再描画を続けるかの判定に使う */
export function hasFlyingTrail(trails: BallTrail[], now: number): boolean {
  return trails.some(t => trailProgress(t, now) < 1);
}

/** 黒縁付きラインを描画 */
function drawTrailLine(
  ctx: CanvasRenderingContext2D,
  fx: number, fy: number, tx: number, ty: number,
  color: string, width: number, dash?: number[],
): void {
  ctx.setLineDash(dash ?? []);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = width + 4;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.setLineDash([]);
}

/** 黒縁付き円を描画 */
function drawTrailCircle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number, fillColor: string,
): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = fillColor;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}

/** × マークを描画 */
function drawXMark(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
): void {
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size); ctx.stroke();
  ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(x - size, y - size); ctx.lineTo(x + size, y + size); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + size, y - size); ctx.lineTo(x - size, y + size); ctx.stroke();
}

/** 金色の星を描画（ゴール時） */
function drawGoalStar(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const drawStar = (r1: number, r2: number, fillStyle: string) => {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    for (let j = 0; j < 10; j++) {
      const a = (j * 36 - 90) * Math.PI / 180;
      const r = j % 2 === 0 ? r1 : r2;
      if (j === 0) ctx.moveTo(sx + r * Math.cos(a), sy + r * Math.sin(a));
      else ctx.lineTo(sx + r * Math.cos(a), sy + r * Math.sin(a));
    }
    ctx.closePath(); ctx.fill();
  };
  drawStar(18, 9, 'rgba(0, 0, 0, 0.4)');
  drawStar(16, 8, '#FFD700');
}

/**
 * ボール軌跡レイヤーを描画。
 * flight付き軌跡は進捗に応じて from→ボール現在位置まで線が伸び、
 * 完成（進捗1）した時点で終端マーカー（着地点・×・星）を描く。
 */
export function renderBallTrails(
  ctx: CanvasRenderingContext2D,
  trails: BallTrail[],
  findCell: FindCell,
  now: number,
): void {
  for (const trail of trails) {
    const fromCell = findCell(trail.from);
    const toCell = findCell(trail.to);
    if (!fromCell || !toCell) continue;

    const progress = trailProgress(trail, now);
    if (progress <= 0) continue;
    const done = progress >= 1;
    // 線の現在の先端（飛行中はボール位置、完了後は着地点）
    const tipX = fromCell.x + (toCell.x - fromCell.x) * progress;
    const tipY = fromCell.y + (toCell.y - fromCell.y) * progress;

    ctx.save();
    switch (trail.type) {
      case 'pass':
        drawTrailLine(ctx, fromCell.x, fromCell.y, tipX, tipY, '#3B82F6', 6, [10, 6]);
        if (done) drawTrailCircle(ctx, toCell.x, toCell.y, 8, '#3B82F6');
        break;
      case 'throughPass':
        drawTrailLine(ctx, fromCell.x, fromCell.y, tipX, tipY, '#06B6D4', 6, [10, 6]);
        if (done) drawTrailCircle(ctx, toCell.x, toCell.y, 8, '#06B6D4');
        break;
      case 'passCut':
        drawTrailLine(ctx, fromCell.x, fromCell.y, tipX, tipY, '#F59E0B', 6, [10, 6]);
        if (done) drawXMark(ctx, toCell.x, toCell.y, 10);
        break;
      case 'dribble': {
        // ドリブルはコマ移動後に静的表示（flightなし）— 従来通り
        drawTrailLine(ctx, fromCell.x, fromCell.y, tipX, tipY, '#22C55E', 7);
        if (done) {
          const bx = (fromCell.x + toCell.x) / 2;
          const by = (fromCell.y + toCell.y) / 2;
          drawTrailCircle(ctx, bx, by, 8, '#fff');
          ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'shoot': {
        drawTrailLine(ctx, fromCell.x, fromCell.y, tipX, tipY, '#EF4444', 8);
        if (done) {
          if (trail.result === 'goal') {
            drawGoalStar(ctx, toCell.x, toCell.y);
          } else if (trail.result === 'blocked' || trail.result === 'saved') {
            const mx = (fromCell.x * 0.3 + toCell.x * 0.7);
            const my = (fromCell.y * 0.3 + toCell.y * 0.7);
            drawXMark(ctx, mx, my, 12);
          } else if (trail.result === 'missed') {
            // G1: 枠外 → 着弾点（枠の外側）に×
            drawXMark(ctx, toCell.x, toCell.y, 12);
          }
        }
        break;
      }
    }
    ctx.restore();
  }
}

// ================================================================
// フェーズ演出エフェクト（§5-1b: アイコン + テキスト）
// ================================================================

const EFFECT_ICON_FONT = 'bold 40px sans-serif';
const EFFECT_TEXT_FONT = 'bold 24px sans-serif';

export function renderPhaseEffects(
  ctx: CanvasRenderingContext2D,
  effects: Array<{ coord: HexCoord; icon: string; color: string; text?: string }>,
  findCell: FindCell,
): void {
  for (const effect of effects) {
    const cell = findCell(effect.coord);
    if (!cell) continue;
    ctx.save();
    ctx.font = EFFECT_ICON_FONT;
    ctx.fillStyle = effect.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(effect.icon, cell.x, cell.y - 30);
    if (effect.text) {
      ctx.font = EFFECT_TEXT_FONT;
      ctx.fillStyle = effect.color;
      ctx.globalAlpha = 0.9;
      ctx.fillText(effect.text, cell.x, cell.y - 62);
    }
    ctx.restore();
  }
}
