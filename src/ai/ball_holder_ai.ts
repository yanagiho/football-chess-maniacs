// ============================================================
// ball_holder_ai.ts — ボール保持コマの行動選択
//
// シュート→前方パス→中継パス(2手ルート)→ドリブル→待機
// ============================================================

import type { Piece, HexCoord, Order } from '../engine/types';
import { hexKey, hexDistance, hexLinePath } from '../engine/movement';
import type { PieceLegalMoves } from './legal_moves';
import type { AiContext } from './ai_context';

/**
 * ボール保持コマの行動を選択する。
 * 優先順: シュート → 前方パス → 中継パス(2手ルート) → ドリブル → 横パス → 待機
 */
export function selectBallHolderOrder(pm: PieceLegalMoves, ctx: AiContext): Order {
  const { pieceId, legalActions, currentHex } = pm;
  const { myPieces, goalRow, diffConfig, forwardness, usedTargets } = ctx;
  const shoots = legalActions.filter(a => a.action === 'shoot');
  const passes = legalActions.filter(a => a.action === 'pass' && a.targetPieceId);
  const distToGoal = hexDistance(currentHex, { col: 10, row: goalRow });

  // ── 1. シュート可能ならシュート ──
  if (shoots.length > 0 && distToGoal <= diffConfig.shootRange) {
    console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: SHOOT (dist=${distToGoal})`);
    return { pieceId, type: 'shoot', target: { col: 10, row: goalRow } };
  }

  // ── 2. パスが通る味方にパス（前方〜横を含む） ──
  const passBlockCheck = diffConfig.useZocPassBlock ? ctx.isPassBlockedByZoc : ctx.isPassBlockedByBody;
  const passCandidates = passes
    .map(p => {
      const receiver = myPieces.find(pc => pc.id === p.targetPieceId);
      if (!receiver) return null;
      const fwdScore = forwardness(currentHex, receiver.coord);
      const blocked = passBlockCheck(currentHex, receiver.coord);
      const dist = hexDistance(currentHex, receiver.coord);
      if (dist <= 1) return null;
      return { action: p, receiver, fwdScore, blocked, dist };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && !x.blocked)
    .sort((a, b) => {
      const fwdA = a.fwdScore > 0 ? 1 : 0;
      const fwdB = b.fwdScore > 0 ? 1 : 0;
      if (fwdA !== fwdB) return fwdB - fwdA;
      return b.fwdScore - a.fwdScore || a.dist - b.dist;
    });

  if (passCandidates.length > 0) {
    const idx = diffConfig.pickBest ? 0 : Math.floor(Math.random() * Math.min(3, passCandidates.length));
    const best = passCandidates[idx];
    const passType = best.fwdScore > 0 ? 'FORWARD' : 'LATERAL';
    console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: ${passType} PASS → ${best.receiver.position}★${best.receiver.cost} (fwd=${best.fwdScore}, dist=${best.dist})`);
    return {
      pieceId, type: 'pass',
      target: best.receiver.coord,
      targetPieceId: best.receiver.id,
    };
  }

  // ── 3. 中継パスルート（2手パス: A→B→C） ──
  const forwardTargets = myPieces
    .filter(c => c.id !== pieceId && forwardness(currentHex, c.coord) > 2)
    .sort((a, b) => forwardness(currentHex, b.coord) - forwardness(currentHex, a.coord));

  for (const targetC of forwardTargets) {
    const relays = passes
      .map(p => {
        const relayB = myPieces.find(pc => pc.id === p.targetPieceId);
        if (!relayB || relayB.id === targetC.id) return null;
        if (ctx.isPassBlockedByBody(currentHex, relayB.coord)) return null;
        if (ctx.isPassBlockedByBody(relayB.coord, targetC.coord)) return null;
        if (hexDistance(relayB.coord, targetC.coord) > diffConfig.relayMaxDist) return null;
        return { action: p, relayB, targetC };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => hexDistance(a.relayB.coord, a.targetC.coord) - hexDistance(b.relayB.coord, b.targetC.coord));

    if (relays.length > 0) {
      const best = relays[0];
      console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: RELAY PASS → ${best.relayB.position}★${best.relayB.cost} (relay) → ${best.targetC.position}★${best.targetC.cost}`);
      return {
        pieceId, type: 'pass',
        target: best.relayB.coord,
        targetPieceId: best.relayB.id,
      };
    }
  }

  // ── 4. ドリブル（パスが全て塞がれた場合のフォールバック） ──
  {
    const range = ctx.getLineRange(pm.position, true);
    const dribbles = legalActions
      .filter(a => a.action === 'dribble' && a.targetHex)
      .filter(a => {
        const depth = ctx.toAttackDepth(a.targetHex!.row);
        return depth >= range.min && depth <= range.max;
      })
      .filter(a => !usedTargets.has(hexKey(a.targetHex!)))
      .map(a => {
        const fwdScore = forwardness(currentHex, a.targetHex!);
        const inZoc = a.note.includes('ZOC内') || a.note.includes('タックル');
        return { action: a, fwdScore, inZoc };
      })
      .filter(d => d.fwdScore > 0)
      .sort((a, b) => {
        if (a.inZoc !== b.inZoc) return a.inZoc ? 1 : -1;
        return b.fwdScore - a.fwdScore;
      });

    if (dribbles.length > 0) {
      const best = dribbles[0];
      console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: DRIBBLE forward(${best.action.targetHex!.col},${best.action.targetHex!.row})${best.inZoc ? ' [ZOC]' : ''}`);
      return { pieceId, type: 'dribble', target: best.action.targetHex };
    }
  }

  // ── 5. 待機（最終手段） ──
  console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: STAY (no options)`);
  return { pieceId, type: 'stay' };
}
