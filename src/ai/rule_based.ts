// ============================================================
// rule_based.ts — フォーメーション維持型 ルールベースAI
//
// 核心: 3ラインを維持する。GK / DF線 / MF線 / FW線が崩れない。
// 攻撃時: ボール保持コマがシュート→前方パス→中継パス→ドリブルの優先順。
// 守備時: ライン行動範囲内で自陣方向へ下がり、フォーメーション形状を保つ。
// ============================================================

import type { Piece, Team, HexCoord, Order, OrderType } from '../engine/types';
import { hexKey, hexDistance, getNeighbors, hexLinePath, buildZocMap } from '../engine/movement';
import { evaluateBoard, recommendStrategy, type Strategy, type EvaluationResult } from './evaluator';
import {
  generateAllLegalMoves,
  type LegalMovesContext,
  type PieceLegalMoves,
  type LegalAction,
} from './legal_moves';

// ================================================================
// 定数
// ================================================================

/** away は row 0 方向に攻撃、home は row 33 方向に攻撃 */
const GOAL_ROW = { home: 33, away: 0 } as const;
const MAX_ROW = 33;
const CENTER_ROW = 16;

// ================================================================
// 公開API
// ================================================================

export interface RuleBasedInput {
  pieces: Piece[];
  myTeam: Team;
  scoreHome: number;
  scoreAway: number;
  turn: number;
  maxTurn?: number;
  remainingSubs: number;
  benchPieces: Piece[];
  maxFieldCost?: number;
}

export interface RuleBasedOutput {
  orders: Order[];
  evaluation: EvaluationResult;
  strategy: Strategy;
}

export function generateRuleBasedOrders(input: RuleBasedInput): RuleBasedOutput {
  const {
    pieces, myTeam, scoreHome, scoreAway, turn,
    maxTurn = 90, remainingSubs, benchPieces, maxFieldCost = 16,
  } = input;

  const goalDiff = myTeam === 'home' ? scoreHome - scoreAway : scoreAway - scoreHome;
  const evaluation = evaluateBoard(pieces, myTeam, scoreHome, scoreAway, turn, maxTurn);
  const strategy = recommendStrategy(goalDiff, turn, maxTurn);

  // 合法手生成
  const ctx: LegalMovesContext = { pieces, myTeam, remainingSubs, maxFieldCost, benchPieces };
  const allLegalMoves = generateAllLegalMoves(ctx);

  const myPieces = pieces.filter(p => p.team === myTeam);
  const opponents = pieces.filter(p => p.team !== myTeam);
  const myBallHolder = myPieces.find(p => p.hasBall);
  const enemyBallHolder = opponents.find(p => p.hasBall);
  const isAttacking = !!myBallHolder;

  const goalRow = GOAL_ROW[myTeam];
  const ownGoalRow = myTeam === 'home' ? 0 : MAX_ROW;
  // 「前方」の方向: home=+1(row増加), away=-1(row減少)
  const fwd = myTeam === 'home' ? 1 : -1;

  // ZOCマップ
  const enemyTeam: Team = myTeam === 'home' ? 'away' : 'home';
  const enemyZoc = buildZocMap(pieces, enemyTeam);

  // 占有チェック用
  const occupiedByTeammate = new Set(myPieces.map(p => hexKey(p.coord)));
  const occupiedByEnemy = new Set(opponents.map(p => hexKey(p.coord)));
  const usedTargets = new Set<string>(); // 移動先重複防止

  const orders: Order[] = [];
  const legalMap = new Map(allLegalMoves.map(pm => [pm.pieceId, pm]));

  // ── ヘルパー関数 ──

  /** row を「自陣ゴールからの距離」に変換（0=自陣ゴール, 33=敵陣ゴール） */
  const toAttackDepth = (row: number): number =>
    myTeam === 'home' ? row : MAX_ROW - row;

  /** 「自陣ゴールからの距離」からrowに変換 */
  const fromAttackDepth = (depth: number): number =>
    myTeam === 'home' ? depth : MAX_ROW - depth;

  /** 2点間のパス経路上に敵がいるか */
  const isPassBlocked = (from: HexCoord, to: HexCoord): boolean => {
    const path = hexLinePath(from, to);
    for (const hex of path) {
      const k = hexKey(hex);
      if (hex.col === to.col && hex.row === to.row) break; // 受け手自身は除外
      if (occupiedByEnemy.has(k)) return true;
      if (enemyZoc.has(k)) return true; // 敵ZOC内もリスクとして扱う
    }
    return false;
  };

  /** パス経路上に敵コマ本体がいるか（ZOCは無視、厳密チェック） */
  const isPassStrictlyBlocked = (from: HexCoord, to: HexCoord): boolean => {
    const path = hexLinePath(from, to);
    for (const hex of path) {
      if (hex.col === to.col && hex.row === to.row) break;
      if (occupiedByEnemy.has(hexKey(hex))) return true;
    }
    return false;
  };

  // ── ライン行動範囲（attackDepth: 0=自陣ゴール, 33=敵陣ゴール） ──
  const getLineRange = (position: string, attacking: boolean): { min: number; max: number } => {
    if (position === 'GK') return { min: 0, max: 3 };
    if (position === 'DF' || position === 'SB') {
      return attacking ? { min: 3, max: 18 } : { min: 3, max: 13 };
    }
    if (position === 'VO' || position === 'MF') {
      return attacking ? { min: 12, max: 24 } : { min: 8, max: 18 };
    }
    if (position === 'OM') {
      return attacking ? { min: 14, max: 28 } : { min: 10, max: 20 };
    }
    // FW, WG
    return attacking ? { min: 16, max: 32 } : { min: 14, max: 22 };
  };

  /** 指定コマの合法移動先をライン範囲でフィルタ */
  const getFilteredMoves = (pm: PieceLegalMoves, attacking: boolean): LegalAction[] => {
    const range = getLineRange(pm.position, attacking);
    return pm.legalActions
      .filter(a => a.action === 'move' && a.targetHex)
      .filter(a => {
        const depth = toAttackDepth(a.targetHex!.row);
        return depth >= range.min && depth <= range.max;
      })
      .filter(a => !usedTargets.has(hexKey(a.targetHex!)));
  };

  /** 指定コマのドリブル先をライン範囲でフィルタ */
  const getFilteredDribbles = (pm: PieceLegalMoves, attacking: boolean): LegalAction[] => {
    const range = getLineRange(pm.position, attacking);
    return pm.legalActions
      .filter(a => a.action === 'dribble' && a.targetHex)
      .filter(a => {
        const depth = toAttackDepth(a.targetHex!.row);
        return depth >= range.min && depth <= range.max;
      })
      .filter(a => !usedTargets.has(hexKey(a.targetHex!)));
  };

  /** 移動先候補の中で目標rowに最も近いものを選ぶ */
  const pickClosestTo = (moves: LegalAction[], targetRow: number): LegalAction | null => {
    if (moves.length === 0) return null;
    return moves.reduce((best, m) => {
      const dBest = Math.abs(best.targetHex!.row - targetRow);
      const dCurr = Math.abs(m.targetHex!.row - targetRow);
      if (dCurr < dBest) return m;
      if (dCurr === dBest) {
        // 同距離なら横に広がる（col 10 から離れる）
        const cBest = Math.abs(best.targetHex!.col - 10);
        const cCurr = Math.abs(m.targetHex!.col - 10);
        return cCurr > cBest ? m : best;
      }
      return best;
    });
  };

  /** コマにorderを追加（移動先予約も行う） */
  const addOrder = (order: Order) => {
    orders.push(order);
    if (order.target) usedTargets.add(hexKey(order.target));
  };

  // ================================================================
  // ボール保持コマの行動（攻撃時）
  // ================================================================

  if (myBallHolder) {
    const pm = legalMap.get(myBallHolder.id);
    if (pm) {
      const order = selectBallHolderOrder(pm, myPieces, opponents, goalRow, fwd, enemyZoc);
      addOrder(order);
      console.log(`[COM AI] ATTACK mode | Ball: ${pm.position}★${pm.cost} → ${order.type}${order.target ? ` (${order.target.col},${order.target.row})` : ''}`);
    }
  }

  // ================================================================
  // 非ボール保持コマの行動
  // ================================================================

  // プレス役の選定（守備時のみ、FW/WG/OMから最大2体）
  const pressIds = new Set<string>();
  if (!isAttacking && enemyBallHolder) {
    const pressTargets = myPieces
      .filter(p => ['FW', 'WG', 'OM'].includes(p.position) && !p.hasBall)
      .map(p => ({ piece: p, dist: hexDistance(p.coord, enemyBallHolder.coord) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2);
    for (const t of pressTargets) pressIds.add(t.piece.id);
  }

  // ポジション順で処理（GK→DF/SB→VO/MF→OM→FW/WG）
  const posOrder = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];
  const sortedPieces = [...myPieces]
    .filter(p => !p.hasBall)
    .sort((a, b) => posOrder.indexOf(a.position) - posOrder.indexOf(b.position));

  for (const piece of sortedPieces) {
    const pm = legalMap.get(piece.id);
    if (!pm) continue;

    // GK: 常にゴール中央付近に留まる
    if (piece.position === 'GK') {
      const gkTargetRow = fromAttackDepth(1);
      const moves = getFilteredMoves(pm, isAttacking);
      const best = pickClosestTo(moves, gkTargetRow);
      if (best) {
        addOrder({ pieceId: piece.id, type: 'move', target: best.targetHex });
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
      }
      continue;
    }

    // プレス役（守備時）: 敵ボール保持者に向かう
    if (pressIds.has(piece.id) && enemyBallHolder) {
      const moves = pm.legalActions
        .filter(a => a.action === 'move' && a.targetHex)
        .filter(a => !usedTargets.has(hexKey(a.targetHex!)));
      const toward = moves
        .map(m => ({ action: m, dist: hexDistance(m.targetHex!, enemyBallHolder.coord) }))
        .sort((a, b) => a.dist - b.dist);
      if (toward.length > 0) {
        addOrder({ pieceId: piece.id, type: 'move', target: toward[0].action.targetHex });
        console.log(`[COM AI] PRESS: ${piece.position}★${piece.cost} → enemy ball`);
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
      }
      continue;
    }

    // ── 攻撃時: ライン範囲内で前方に移動 ──
    if (isAttacking) {
      const range = getLineRange(piece.position, true);
      const targetDepth = Math.min(toAttackDepth(piece.coord.row) + getAdvanceStep(piece.position), range.max);
      const targetRow = fromAttackDepth(targetDepth);

      const moves = getFilteredMoves(pm, true);
      // 前方かつ横に広がる方向を優先
      const scored = moves.map(m => {
        const depthGain = (toAttackDepth(m.targetHex!.row) - toAttackDepth(piece.coord.row)) * fwd * fwd; // 常に正
        const spread = Math.abs(m.targetHex!.col - 10); // 中央から離れるほど良い
        const notClumped = myPieces.every(p => p.id === piece.id || hexDistance(m.targetHex!, p.coord) > 1) ? 3 : 0;
        return { action: m, score: depthGain * 2 + spread * 0.5 + notClumped };
      }).sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        addOrder({ pieceId: piece.id, type: 'move', target: scored[0].action.targetHex });
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
      }
      continue;
    }

    // ── 守備時: ライン範囲内で自陣方向へ下がる ──
    const range = getLineRange(piece.position, false);
    const currentDepth = toAttackDepth(piece.coord.row);

    // DFライン: 自陣で横一列に広がる
    if (piece.position === 'DF' || piece.position === 'SB') {
      const defDepth = Math.max(range.min, Math.min(currentDepth - 1, range.max));
      const defRow = fromAttackDepth(defDepth);
      const moves = getFilteredMoves(pm, false);
      // 横に広がるスコア（同ポジションの味方から離れる）
      const sameLine = myPieces.filter(p => (p.position === 'DF' || p.position === 'SB') && p.id !== piece.id);
      const scored = moves.map(m => {
        const rowDist = -Math.abs(m.targetHex!.row - defRow); // 目標rowに近いほど良い
        const minAllyDist = sameLine.length > 0
          ? Math.min(...sameLine.map(s => Math.abs(m.targetHex!.col - s.coord.col)))
          : 10;
        return { action: m, score: rowDist * 2 + minAllyDist * 1.5 };
      }).sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        addOrder({ pieceId: piece.id, type: 'move', target: scored[0].action.targetHex });
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
      }
      continue;
    }

    // MF/VO/OM: 自陣方向に1-2HEX下がる
    if (piece.position === 'MF' || piece.position === 'VO' || piece.position === 'OM') {
      const retreatDepth = Math.max(range.min, currentDepth - 2);
      const targetRow = fromAttackDepth(retreatDepth);
      const moves = getFilteredMoves(pm, false);
      const best = pickClosestTo(moves, targetRow);
      if (best) {
        addOrder({ pieceId: piece.id, type: 'move', target: best.targetHex });
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
      }
      continue;
    }

    // FW/WG: センターライン付近まで下がる（それ以上は下がらない）
    {
      const retreatDepth = Math.max(range.min, Math.min(currentDepth, toAttackDepth(CENTER_ROW)));
      const targetRow = fromAttackDepth(retreatDepth);
      const moves = getFilteredMoves(pm, false);
      const best = pickClosestTo(moves, targetRow);
      if (best) {
        addOrder({ pieceId: piece.id, type: 'move', target: best.targetHex });
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
      }
    }
  }

  // ログ出力
  console.log(`[COM AI] ${isAttacking ? 'ATTACK' : 'DEFENSE'} | strategy=${strategy} | orders=${orders.length}:`,
    orders.map(o => {
      const p = pieces.find(pp => pp.id === o.pieceId);
      return `${p?.position ?? '?'}:${o.type}${o.target ? `(${o.target.col},${o.target.row})` : ''}`;
    }).join(', '));

  return { orders, evaluation, strategy };
}

// ================================================================
// ボール保持コマの行動選択
// ================================================================

function selectBallHolderOrder(
  pm: PieceLegalMoves,
  myPieces: Piece[],
  opponents: Piece[],
  goalRow: number,
  fwd: number,
  enemyZoc: Map<string, string>,
): Order {
  const { pieceId, legalActions, currentHex } = pm;
  const shoots = legalActions.filter(a => a.action === 'shoot');
  const passes = legalActions.filter(a => a.action === 'pass' && a.targetPieceId);
  const teammates = myPieces.filter(p => p.id !== pieceId);
  const distToGoal = hexDistance(currentHex, { col: 10, row: goalRow });

  const occupiedByEnemy = new Set(opponents.map(p => hexKey(p.coord)));

  /** パス経路上に敵コマがいるか */
  const passBlocked = (from: HexCoord, to: HexCoord): boolean => {
    const path = hexLinePath(from, to);
    for (const hex of path) {
      if (hex.col === to.col && hex.row === to.row) break;
      if (occupiedByEnemy.has(hexKey(hex))) return true;
    }
    return false;
  };

  /** 「前方」の度合い: 受け手がゴールに近いほど高い */
  const forwardness = (coord: HexCoord): number => {
    return (coord.row - currentHex.row) * fwd;
  };

  // ── 1. シュート可能ならシュート ──
  if (shoots.length > 0 && distToGoal <= 7) {
    console.log(`[COM AI] Ball holder: SHOOT (dist=${distToGoal})`);
    return { pieceId, type: 'shoot', target: { col: 10, row: goalRow } };
  }

  // ── 2. 前方の味方に直接パスが通るならパス ──
  const forwardPasses = passes
    .map(p => {
      const receiver = myPieces.find(pc => pc.id === p.targetPieceId);
      if (!receiver) return null;
      const fwdScore = forwardness(receiver.coord);
      if (fwdScore <= 0) return null; // 前方でない
      const blocked = passBlocked(currentHex, receiver.coord);
      const dist = hexDistance(currentHex, receiver.coord);
      return { action: p, receiver, fwdScore, blocked, dist };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && !x.blocked)
    .sort((a, b) => b.fwdScore - a.fwdScore || a.dist - b.dist);

  if (forwardPasses.length > 0) {
    const best = forwardPasses[0];
    console.log(`[COM AI] Ball holder: FORWARD PASS → ${best.receiver.position}★${best.receiver.cost} (fwd=${best.fwdScore})`);
    return {
      pieceId, type: 'pass',
      target: best.receiver.coord,
      targetPieceId: best.receiver.id,
    };
  }

  // ── 3. 中継パスルート（2手パス: A→B→C） ──
  // 前方のターゲットC
  const forwardTargets = teammates
    .filter(c => forwardness(c.coord) > 2)
    .sort((a, b) => forwardness(b.coord) - forwardness(a.coord));

  for (const targetC of forwardTargets) {
    // 中継役B: 横方向 or やや後方の味方
    const relays = passes
      .map(p => {
        const relayB = myPieces.find(pc => pc.id === p.targetPieceId);
        if (!relayB || relayB.id === targetC.id) return null;
        // A→Bが通るか
        if (passBlocked(currentHex, relayB.coord)) return null;
        // B→Cが通るか
        if (passBlocked(relayB.coord, targetC.coord)) return null;
        // B→Cの距離が遠すぎないか（8HEX以内）
        if (hexDistance(relayB.coord, targetC.coord) > 8) return null;
        return { action: p, relayB, targetC };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (relays.length > 0) {
      const best = relays[0];
      console.log(`[COM AI] Ball holder: RELAY PASS → ${best.relayB.position}★${best.relayB.cost} (relay) → ${best.targetC.position}★${best.targetC.cost}`);
      return {
        pieceId, type: 'pass',
        target: best.relayB.coord,
        targetPieceId: best.relayB.id,
      };
    }
  }

  // ── 4. 前方にドリブル ──
  const dribbles = legalActions
    .filter(a => a.action === 'dribble' && a.targetHex)
    .filter(a => !a.note.includes('ZOC内'))
    .map(a => ({ action: a, fwdScore: (a.targetHex!.row - currentHex.row) * fwd }))
    .filter(d => d.fwdScore > 0)
    .sort((a, b) => b.fwdScore - a.fwdScore);

  if (dribbles.length > 0) {
    console.log(`[COM AI] Ball holder: DRIBBLE forward`);
    return { pieceId, type: 'dribble', target: dribbles[0].action.targetHex };
  }

  // ── 5. 横パス ──
  const lateralPasses = passes
    .map(p => {
      const receiver = myPieces.find(pc => pc.id === p.targetPieceId);
      if (!receiver) return null;
      if (passBlocked(currentHex, receiver.coord)) return null;
      const dist = hexDistance(currentHex, receiver.coord);
      return { action: p, receiver, dist };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.dist - b.dist);

  if (lateralPasses.length > 0) {
    const best = lateralPasses[0];
    console.log(`[COM AI] Ball holder: LATERAL PASS → ${best.receiver.position}★${best.receiver.cost}`);
    return {
      pieceId, type: 'pass',
      target: best.receiver.coord,
      targetPieceId: best.receiver.id,
    };
  }

  // ── 6. ZOC内ドリブル（最終手段） ──
  const zocDribbles = legalActions
    .filter(a => a.action === 'dribble' && a.targetHex)
    .map(a => ({ action: a, fwdScore: (a.targetHex!.row - currentHex.row) * fwd }))
    .sort((a, b) => b.fwdScore - a.fwdScore);

  if (zocDribbles.length > 0) {
    console.log(`[COM AI] Ball holder: DRIBBLE (ZOC)`);
    return { pieceId, type: 'dribble', target: zocDribbles[0].action.targetHex };
  }

  console.log(`[COM AI] Ball holder: STAY (no options)`);
  return { pieceId, type: 'stay' };
}

// ================================================================
// ヘルパー
// ================================================================

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

// ================================================================
// §9-3 Gemma出力の検証・フォールバック置換（変更なし）
// ================================================================

export interface GemmaOrder {
  piece_id: string;
  action: string;
  target_hex?: [number, number];
  target_piece?: string;
  zone?: string;
  bench_piece?: string;
}

export function validateAndFillGemmaOutput(
  rawOrders: GemmaOrder[],
  allLegalMoves: PieceLegalMoves[],
  ruleBasedOrders: Order[],
): Order[] {
  const legalMap = new Map(allLegalMoves.map((pm) => [pm.pieceId, pm]));
  const ruleMap = new Map(ruleBasedOrders.map((o) => [o.pieceId, o]));
  const result: Order[] = [];
  const usedIds = new Set<string>();

  for (const gemmaOrder of rawOrders) {
    if (usedIds.has(gemmaOrder.piece_id)) continue;
    const pieceMoves = legalMap.get(gemmaOrder.piece_id);
    if (!pieceMoves) continue;

    const isLegal = pieceMoves.legalActions.some((la) => {
      if (la.action !== gemmaOrder.action) return false;
      if (gemmaOrder.target_hex && la.targetHex) {
        return la.targetHex.col === gemmaOrder.target_hex[0] &&
               la.targetHex.row === gemmaOrder.target_hex[1];
      }
      if (gemmaOrder.target_piece && la.targetPieceId) {
        return la.targetPieceId === gemmaOrder.target_piece;
      }
      if (gemmaOrder.zone && la.shootZone) {
        return la.shootZone === gemmaOrder.zone;
      }
      if (gemmaOrder.bench_piece && la.benchPieceId) {
        return la.benchPieceId === gemmaOrder.bench_piece;
      }
      if (la.action === 'stay') return gemmaOrder.action === 'stay';
      return false;
    });

    if (isLegal) {
      result.push({
        pieceId: gemmaOrder.piece_id,
        type: gemmaOrder.action as OrderType,
        target: gemmaOrder.target_hex
          ? { col: gemmaOrder.target_hex[0], row: gemmaOrder.target_hex[1] }
          : undefined,
      });
      usedIds.add(gemmaOrder.piece_id);
    }
  }

  for (const [pieceId] of legalMap) {
    if (usedIds.has(pieceId)) continue;
    const fallback = ruleMap.get(pieceId);
    if (fallback) {
      result.push(fallback);
      usedIds.add(pieceId);
    }
  }

  return result;
}
