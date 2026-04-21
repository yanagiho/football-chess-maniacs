// ============================================================
// formation_ai.ts — 非ボール保持コマの行動選択
//
// 3ライン制御: GK / DF線 / MF線 / FW線 の行動範囲を維持。
// 攻撃時: ポジション別ステップ数で前進 + 横に広がる。
// 守備時: プレス役が敵ボールに向かう。残りはライン維持。
// ============================================================

import type { Piece, HexCoord, Order } from '../engine/types';
import { hexKey, hexDistance } from '../engine/movement';
import type { LegalAction, PieceLegalMoves } from './legal_moves';
import type { AiContext } from './ai_context';

/** ポジション別の攻撃時前進ステップ数 */
function getAdvanceStep(position: string): number {
  switch (position) {
    case 'FW': case 'WG': return 3;
    case 'OM': return 2;
    case 'MF': case 'VO': return 1;
    case 'DF': case 'SB': return 1;
    default: return 0;
  }
}

/** 移動先候補の中で目標rowに最も近いものを選ぶ */
function pickClosestToRow(moves: LegalAction[], targetRow: number): LegalAction | null {
  if (moves.length === 0) return null;
  return moves.reduce((best, m) => {
    const dBest = Math.abs(best.targetHex!.row - targetRow);
    const dCurr = Math.abs(m.targetHex!.row - targetRow);
    if (dCurr < dBest) return m;
    if (dCurr === dBest) {
      const cBest = Math.abs(best.targetHex!.col - 10);
      const cCurr = Math.abs(m.targetHex!.col - 10);
      return cCurr > cBest ? m : best;
    }
    return best;
  });
}

/** 難易度に応じて最善手 or 上位3つからランダム選択 */
function pickByDifficulty<T extends { score: number }>(sorted: T[], pickBest: boolean): T | undefined {
  if (sorted.length === 0) return undefined;
  if (pickBest) return sorted[0];
  const topN = sorted.slice(0, Math.min(3, sorted.length));
  return topN[Math.floor(Math.random() * topN.length)];
}

const CENTER_ROW = 16;

/**
 * 非ボール保持コマの行動を選択する。
 * GK / プレス / 攻撃前進 / 守備ライン維持
 */
export function selectFormationOrders(
  sortedPieces: Piece[],
  pressIds: Set<string>,
  enemyBallHolder: Piece | undefined,
  isAttacking: boolean,
  ctx: AiContext,
): void {
  for (const piece of sortedPieces) {
    const pm = ctx.legalMap.get(piece.id);
    if (!pm) continue;

    // ── beginner: 一部のコマに命令を出さない(stay) ──
    if (ctx.diffConfig.skipRate > 0 && piece.position !== 'GK' && Math.random() < ctx.diffConfig.skipRate) {
      ctx.addOrder({ pieceId: piece.id, type: 'stay' });
      console.log(`[COM AI]   ${piece.position}★${piece.cost} → SKIP (beginner random)`);
      continue;
    }

    // ── GK: ゴール中央（col 10, depth 1）付近に留まる ──
    if (piece.position === 'GK') {
      selectGkOrder(piece, pm, isAttacking, ctx);
      continue;
    }

    // ── プレス役（守備時）: 敵ボール保持者に向かう ──
    if (pressIds.has(piece.id) && enemyBallHolder) {
      selectPressOrder(piece, pm, enemyBallHolder, ctx);
      continue;
    }

    // ── 攻撃時: ライン範囲内で前方に移動 + 横に広がる ──
    if (isAttacking) {
      selectAttackOrder(piece, pm, ctx);
      continue;
    }

    // ── 守備時 ──
    selectDefenseOrder(piece, pm, ctx);
  }
}

function selectGkOrder(piece: Piece, pm: PieceLegalMoves, isAttacking: boolean, ctx: AiContext): void {
  const gkTargetRow = ctx.fromAttackDepth(1);
  const gkTargetCol = 10;
  const moves = ctx.getFilteredMoves(pm, isAttacking);
  const scored = moves.map(m => {
    const rowDist = -Math.abs(m.targetHex!.row - gkTargetRow);
    const colDist = -Math.abs(m.targetHex!.col - gkTargetCol);
    return { action: m, score: rowDist * 3 + colDist * 2 };
  }).sort((a, b) => b.score - a.score);

  const currentRowDist = Math.abs(piece.coord.row - gkTargetRow);
  const currentColDist = Math.abs(piece.coord.col - gkTargetCol);
  const alreadyGood = currentRowDist <= 1 && currentColDist <= 1;

  if (scored.length > 0 && !alreadyGood) {
    const best = scored[0];
    ctx.addOrder({ pieceId: piece.id, type: 'move', target: best.action.targetHex });
    console.log(`[COM AI]   GK → move(${best.action.targetHex!.col},${best.action.targetHex!.row})`);
  } else {
    ctx.addOrder({ pieceId: piece.id, type: 'stay' });
    console.log(`[COM AI]   GK → stay (already at goal center)`);
  }
}

function selectPressOrder(piece: Piece, pm: PieceLegalMoves, enemyBallHolder: Piece, ctx: AiContext): void {
  const moves = pm.legalActions
    .filter(a => a.action === 'move' && a.targetHex)
    .filter(a => !ctx.usedTargets.has(hexKey(a.targetHex!)));
  const toward = moves
    .map(m => ({ action: m, dist: hexDistance(m.targetHex!, enemyBallHolder.coord) }))
    .sort((a, b) => a.dist - b.dist);
  if (toward.length > 0) {
    ctx.addOrder({ pieceId: piece.id, type: 'move', target: toward[0].action.targetHex });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → PRESS enemy ball (dist=${toward[0].dist})`);
  } else {
    ctx.addOrder({ pieceId: piece.id, type: 'stay' });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → PRESS stay (no moves)`);
  }
}

function selectAttackOrder(piece: Piece, pm: PieceLegalMoves, ctx: AiContext): void {
  const range = ctx.getLineRange(piece.position, true);
  const currentDepth = ctx.toAttackDepth(piece.coord.row);
  const step = getAdvanceStep(piece.position);
  const targetDepth = Math.min(currentDepth + step, range.max);
  const targetRow = ctx.fromAttackDepth(targetDepth);

  const moves = ctx.getFilteredMoves(pm, true);
  const scored = moves.map(m => {
    const targetDepthActual = ctx.toAttackDepth(m.targetHex!.row);
    const rowCloseness = -Math.abs(m.targetHex!.row - targetRow);
    const colDist = Math.abs(m.targetHex!.col - 10);
    const spreadScore = colDist <= 5 ? colDist * 0.5 : -(colDist - 5) * 2;
    const minAllyDist = ctx.myPieces
      .filter(p => p.id !== piece.id)
      .reduce((min, p) => Math.min(min, hexDistance(m.targetHex!, p.coord)), 99);
    const notClumped = minAllyDist >= 2 ? 2 : minAllyDist >= 1 ? 0 : -3;
    const rangeMid = (range.min + range.max) / 2;
    const rangeCenter = -Math.abs(targetDepthActual - rangeMid) * 0.3;
    return { action: m, score: rowCloseness * 4 + spreadScore + notClumped + rangeCenter };
  }).sort((a, b) => b.score - a.score);

  const picked = pickByDifficulty(scored, ctx.diffConfig.pickBest);
  if (picked) {
    ctx.addOrder({ pieceId: piece.id, type: 'move', target: picked.action.targetHex });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → ATK move(${picked.action.targetHex!.col},${picked.action.targetHex!.row})`);
  } else {
    ctx.addOrder({ pieceId: piece.id, type: 'stay' });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → ATK stay (no valid moves in range)`);
  }
}

function selectDefenseOrder(piece: Piece, pm: PieceLegalMoves, ctx: AiContext): void {
  // DF/SB: 自陣ゴール前で横一列のラインを形成
  if (piece.position === 'DF' || piece.position === 'SB') {
    selectDefLineOrder(piece, pm, ctx);
    return;
  }

  // MF/VO/OM: 自陣方向に1-2HEX下がる
  if (piece.position === 'MF' || piece.position === 'VO' || piece.position === 'OM') {
    selectMidRetreatOrder(piece, pm, ctx);
    return;
  }

  // FW/WG: センターライン付近まで下がる
  selectFwHoldOrder(piece, pm, ctx);
}

function selectDefLineOrder(piece: Piece, pm: PieceLegalMoves, ctx: AiContext): void {
  const range = ctx.getLineRange(piece.position, false);
  const defDepth = range.min + 2;
  const defRow = ctx.fromAttackDepth(defDepth);

  const moves = ctx.getFilteredMoves(pm, false);
  const sameLine = ctx.myPieces.filter(p =>
    (p.position === 'DF' || p.position === 'SB') && p.id !== piece.id,
  );
  const scored = moves.map(m => {
    const rowDist = -Math.abs(m.targetHex!.row - defRow);
    const minAllyDist = sameLine.length > 0
      ? Math.min(...sameLine.map(s => Math.abs(m.targetHex!.col - s.coord.col)))
      : 10;
    const colDist = Math.abs(m.targetHex!.col - 10);
    const edgePenalty = colDist > 8 ? -(colDist - 8) * 3 : 0;
    return { action: m, score: rowDist * 3 + minAllyDist * 2 + edgePenalty };
  }).sort((a, b) => b.score - a.score);

  const picked = pickByDifficulty(scored, ctx.diffConfig.pickBest);
  if (picked) {
    ctx.addOrder({ pieceId: piece.id, type: 'move', target: picked.action.targetHex });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF line(${picked.action.targetHex!.col},${picked.action.targetHex!.row})`);
  } else {
    ctx.addOrder({ pieceId: piece.id, type: 'stay' });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF stay`);
  }
}

function selectMidRetreatOrder(piece: Piece, pm: PieceLegalMoves, ctx: AiContext): void {
  const range = ctx.getLineRange(piece.position, false);
  const currentDepth = ctx.toAttackDepth(piece.coord.row);
  const retreatDepth = Math.max(range.min, currentDepth - 2);
  const targetRow = ctx.fromAttackDepth(retreatDepth);

  const moves = ctx.getFilteredMoves(pm, false);
  const scored = moves.map(m => {
    const rowCloseness = -Math.abs(m.targetHex!.row - targetRow);
    const colDist = Math.abs(m.targetHex!.col - 10);
    const spreadScore = colDist <= 5 ? colDist * 0.5 : -(colDist - 5) * 2;
    const minAllyDist = ctx.myPieces
      .filter(p => p.id !== piece.id)
      .reduce((min, p) => Math.min(min, hexDistance(m.targetHex!, p.coord)), 99);
    const notClumped = minAllyDist >= 2 ? 2 : minAllyDist >= 1 ? 0 : -3;
    return { action: m, score: rowCloseness * 4 + spreadScore + notClumped };
  }).sort((a, b) => b.score - a.score);

  const picked = pickByDifficulty(scored, ctx.diffConfig.pickBest);
  if (picked) {
    ctx.addOrder({ pieceId: piece.id, type: 'move', target: picked.action.targetHex });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF retreat(${picked.action.targetHex!.col},${picked.action.targetHex!.row})`);
  } else {
    ctx.addOrder({ pieceId: piece.id, type: 'stay' });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF stay`);
  }
}

function selectFwHoldOrder(piece: Piece, pm: PieceLegalMoves, ctx: AiContext): void {
  const range = ctx.getLineRange(piece.position, false);
  const centerDepth = ctx.toAttackDepth(CENTER_ROW);
  const currentDepth = ctx.toAttackDepth(piece.coord.row);
  const retreatDepth = Math.max(range.min, Math.min(currentDepth, centerDepth));
  const targetRow = ctx.fromAttackDepth(retreatDepth);

  const moves = ctx.getFilteredMoves(pm, false);
  const best = pickClosestToRow(moves, targetRow);
  if (best) {
    ctx.addOrder({ pieceId: piece.id, type: 'move', target: best.targetHex });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF hold center(${best.targetHex!.col},${best.targetHex!.row})`);
  } else {
    ctx.addOrder({ pieceId: piece.id, type: 'stay' });
    console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF stay`);
  }
}
