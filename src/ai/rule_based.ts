// ============================================================
// rule_based.ts — フォーメーション維持型 ルールベースAI
//
// 核心: 3ラインを維持する。GK / DF線 / MF線 / FW線が崩れない。
// 攻撃時: ボール保持コマがシュート→前方パス→中継パス→ドリブルの優先順。
//         非保持コマはライン行動範囲内で前方に移動し、横に広がる。
// 守備時: ライン行動範囲内で自陣方向へ下がり、フォーメーション形状を保つ。
//         プレス役(FW/WG/OMから最大2体)のみ敵ボールに向かう。
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
const CENTER_ROW = 16; // ハーフライン

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
    maxTurn = 36, remainingSubs, benchPieces, maxFieldCost = 16,
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

  // ZOCマップ（敵チーム）
  const enemyTeam: Team = myTeam === 'home' ? 'away' : 'home';
  const enemyZoc = buildZocMap(pieces, enemyTeam);

  // 占有チェック用
  const occupiedByEnemy = new Set(opponents.map(p => hexKey(p.coord)));
  const usedTargets = new Set<string>(); // 移動先重複防止

  const orders: Order[] = [];
  const legalMap = new Map(allLegalMoves.map(pm => [pm.pieceId, pm]));

  console.log(`[COM AI] === Turn ${turn} | ${isAttacking ? 'ATTACK' : 'DEFENSE'} mode | team=${myTeam} ===`);

  // ================================================================
  // ヘルパー関数
  // ================================================================

  /** row を「自陣ゴールからの距離」に変換（0=自陣ゴール, 33=敵陣ゴール） */
  const toAttackDepth = (row: number): number =>
    myTeam === 'home' ? row : MAX_ROW - row;

  /** 「自陣ゴールからの距離」からrowに変換 */
  const fromAttackDepth = (depth: number): number =>
    myTeam === 'home' ? depth : MAX_ROW - depth;

  /** パス経路上に敵コマ本体がいるか（受け手自身は除外） */
  const isPassBlockedByBody = (from: HexCoord, to: HexCoord): boolean => {
    const path = hexLinePath(from, to);
    for (const hex of path) {
      if (hex.col === to.col && hex.row === to.row) break; // 受け手自身は除外
      if (occupiedByEnemy.has(hexKey(hex))) return true;
    }
    return false;
  };

  /** パス経路上に敵コマ本体 or 敵ZOCがあるか（よりリスク重視） */
  const isPassBlockedByZoc = (from: HexCoord, to: HexCoord): boolean => {
    const path = hexLinePath(from, to);
    for (const hex of path) {
      if (hex.col === to.col && hex.row === to.row) break;
      const k = hexKey(hex);
      if (occupiedByEnemy.has(k)) return true;
      if (enemyZoc.has(k)) return true;
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

  /** コマにorderを追加（移動先予約も行う） */
  const addOrder = (order: Order) => {
    orders.push(order);
    if (order.target) usedTargets.add(hexKey(order.target));
  };

  /** ポジション別の攻撃時前進ステップ数 */
  const getAdvanceStep = (position: string): number => {
    switch (position) {
      case 'FW': case 'WG': return 3;
      case 'OM': return 2;
      case 'MF': case 'VO': return 1;
      case 'DF': case 'SB': return 1;
      default: return 0;
    }
  };

  /** 「前方」の度合い（正=前方、負=後方） */
  const forwardness = (from: HexCoord, to: HexCoord): number =>
    (to.row - from.row) * fwd;

  // ================================================================
  // ボール保持コマの行動（攻撃時）
  // ================================================================

  if (myBallHolder) {
    const pm = legalMap.get(myBallHolder.id);
    if (pm) {
      const order = selectBallHolderOrder(pm);
      addOrder(order);
    }
  }

  // ================================================================
  // プレス役の選定（守備時のみ、FW/WG/OMから最大2体）
  // ================================================================

  const pressIds = new Set<string>();
  if (!isAttacking && enemyBallHolder) {
    const pressCandidates = myPieces
      .filter(p => ['FW', 'WG', 'OM'].includes(p.position) && !p.hasBall)
      .map(p => ({ piece: p, dist: hexDistance(p.coord, enemyBallHolder.coord) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2);
    for (const t of pressCandidates) pressIds.add(t.piece.id);
  }

  // ================================================================
  // 非ボール保持コマの行動
  // ================================================================

  // ポジション順で処理（GK→DF/SB→VO/MF→OM→FW/WG）
  const posOrder = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];
  const sortedPieces = [...myPieces]
    .filter(p => !p.hasBall)
    .sort((a, b) => posOrder.indexOf(a.position) - posOrder.indexOf(b.position));

  for (const piece of sortedPieces) {
    const pm = legalMap.get(piece.id);
    if (!pm) continue;

    // ── GK: 常にゴール中央付近に留まる ──
    if (piece.position === 'GK') {
      const gkTargetRow = fromAttackDepth(1);
      const moves = getFilteredMoves(pm, isAttacking);
      const best = pickClosestToRow(moves, gkTargetRow);
      if (best) {
        addOrder({ pieceId: piece.id, type: 'move', target: best.targetHex });
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
      }
      console.log(`[COM AI]   GK → ${best ? `move(${best.targetHex!.col},${best.targetHex!.row})` : 'stay'}`);
      continue;
    }

    // ── プレス役（守備時）: 敵ボール保持者に向かう ──
    if (pressIds.has(piece.id) && enemyBallHolder) {
      const moves = pm.legalActions
        .filter(a => a.action === 'move' && a.targetHex)
        .filter(a => !usedTargets.has(hexKey(a.targetHex!)));
      const toward = moves
        .map(m => ({ action: m, dist: hexDistance(m.targetHex!, enemyBallHolder.coord) }))
        .sort((a, b) => a.dist - b.dist);
      if (toward.length > 0) {
        addOrder({ pieceId: piece.id, type: 'move', target: toward[0].action.targetHex });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → PRESS enemy ball (dist=${toward[0].dist})`);
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → PRESS stay (no moves)`);
      }
      continue;
    }

    // ── 攻撃時: ライン範囲内で前方に移動 + 横に広がる ──
    if (isAttacking) {
      const range = getLineRange(piece.position, true);
      const currentDepth = toAttackDepth(piece.coord.row);
      const step = getAdvanceStep(piece.position);
      const targetDepth = Math.min(currentDepth + step, range.max);
      const targetRow = fromAttackDepth(targetDepth);

      const moves = getFilteredMoves(pm, true);

      // スコアリング: 前方移動 + 横に広がる + 味方から離れる
      const scored = moves.map(m => {
        const depthGain = toAttackDepth(m.targetHex!.row) - currentDepth;
        const rowCloseness = -Math.abs(m.targetHex!.row - targetRow); // 目標rowに近いほど良い
        const spread = Math.abs(m.targetHex!.col - 10); // 中央から離れるほど良い（横に広がる）
        // 味方から離れているか（固まらない）
        const minAllyDist = myPieces
          .filter(p => p.id !== piece.id)
          .reduce((min, p) => Math.min(min, hexDistance(m.targetHex!, p.coord)), 99);
        const notClumped = minAllyDist > 1 ? 3 : 0;

        return {
          action: m,
          score: depthGain * 2 + rowCloseness * 3 + spread * 0.5 + notClumped,
        };
      }).sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        addOrder({ pieceId: piece.id, type: 'move', target: scored[0].action.targetHex });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → ATK move(${scored[0].action.targetHex!.col},${scored[0].action.targetHex!.row})`);
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → ATK stay (no valid moves in range)`);
      }
      continue;
    }

    // ── 守備時 ──

    // DF/SB: 自陣ゴール前で横一列のラインを形成
    if (piece.position === 'DF' || piece.position === 'SB') {
      const range = getLineRange(piece.position, false);
      const defDepth = range.min + 2; // ゴール前少し前方（depth 5付近）
      const defRow = fromAttackDepth(defDepth);

      const moves = getFilteredMoves(pm, false);
      // 横に広がるスコアリング（同ポジション味方から離れる）
      const sameLine = myPieces.filter(p =>
        (p.position === 'DF' || p.position === 'SB') && p.id !== piece.id,
      );
      const scored = moves.map(m => {
        const rowDist = -Math.abs(m.targetHex!.row - defRow); // 目標rowに近いほど良い
        const minAllyDist = sameLine.length > 0
          ? Math.min(...sameLine.map(s => Math.abs(m.targetHex!.col - s.coord.col)))
          : 10;
        return { action: m, score: rowDist * 3 + minAllyDist * 2 };
      }).sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        addOrder({ pieceId: piece.id, type: 'move', target: scored[0].action.targetHex });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF line(${scored[0].action.targetHex!.col},${scored[0].action.targetHex!.row})`);
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF stay`);
      }
      continue;
    }

    // MF/VO/OM: 自陣方向に1-2HEX下がる
    if (piece.position === 'MF' || piece.position === 'VO' || piece.position === 'OM') {
      const range = getLineRange(piece.position, false);
      const currentDepth = toAttackDepth(piece.coord.row);
      const retreatDepth = Math.max(range.min, currentDepth - 2);
      const targetRow = fromAttackDepth(retreatDepth);

      const moves = getFilteredMoves(pm, false);
      // パスコースを塞ぐ位置を優先（敵と味方の間に入る）
      const scored = moves.map(m => {
        const rowCloseness = -Math.abs(m.targetHex!.row - targetRow);
        const spread = Math.abs(m.targetHex!.col - 10);
        const minAllyDist = myPieces
          .filter(p => p.id !== piece.id)
          .reduce((min, p) => Math.min(min, hexDistance(m.targetHex!, p.coord)), 99);
        const notClumped = minAllyDist > 1 ? 2 : 0;
        return { action: m, score: rowCloseness * 3 + spread * 0.5 + notClumped };
      }).sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        addOrder({ pieceId: piece.id, type: 'move', target: scored[0].action.targetHex });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF retreat(${scored[0].action.targetHex!.col},${scored[0].action.targetHex!.row})`);
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF stay`);
      }
      continue;
    }

    // FW/WG: センターライン付近まで下がる（それ以上は下がらない）
    {
      const range = getLineRange(piece.position, false);
      const centerDepth = toAttackDepth(CENTER_ROW);
      const currentDepth = toAttackDepth(piece.coord.row);
      const retreatDepth = Math.max(range.min, Math.min(currentDepth, centerDepth));
      const targetRow = fromAttackDepth(retreatDepth);

      const moves = getFilteredMoves(pm, false);
      const best = pickClosestToRow(moves, targetRow);
      if (best) {
        addOrder({ pieceId: piece.id, type: 'move', target: best.targetHex });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF hold center(${best.targetHex!.col},${best.targetHex!.row})`);
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF stay`);
      }
    }
  }

  // 最終ログ
  console.log(`[COM AI] === orders=${orders.length}: ${orders.map(o => {
    const p = pieces.find(pp => pp.id === o.pieceId);
    return `${p?.position ?? '?'}:${o.type}${o.target ? `(${o.target.col},${o.target.row})` : ''}`;
  }).join(', ')} ===`);

  return { orders, evaluation, strategy };

  // ================================================================
  // ボール保持コマの行動選択（クロージャ内関数）
  // ================================================================

  function selectBallHolderOrder(pm: PieceLegalMoves): Order {
    const { pieceId, legalActions, currentHex } = pm;
    const shoots = legalActions.filter(a => a.action === 'shoot');
    const passes = legalActions.filter(a => a.action === 'pass' && a.targetPieceId);
    const teammates = myPieces.filter(p => p.id !== pieceId);
    const distToGoal = hexDistance(currentHex, { col: 10, row: goalRow });

    // ── 1. シュート可能ならシュート ──
    if (shoots.length > 0 && distToGoal <= 7) {
      console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: SHOOT (dist=${distToGoal})`);
      return { pieceId, type: 'shoot', target: { col: 10, row: goalRow } };
    }

    // ── 2. 前方の味方に直接パスが通るならパス ──
    const forwardPassCandidates = passes
      .map(p => {
        const receiver = myPieces.find(pc => pc.id === p.targetPieceId);
        if (!receiver) return null;
        const fwdScore = forwardness(currentHex, receiver.coord);
        if (fwdScore <= 0) return null; // 前方でない
        const blocked = isPassBlockedByBody(currentHex, receiver.coord);
        const dist = hexDistance(currentHex, receiver.coord);
        return { action: p, receiver, fwdScore, blocked, dist };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && !x.blocked)
      .sort((a, b) => b.fwdScore - a.fwdScore || a.dist - b.dist);

    if (forwardPassCandidates.length > 0) {
      const best = forwardPassCandidates[0];
      console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: FORWARD PASS → ${best.receiver.position}★${best.receiver.cost} (fwd=${best.fwdScore}, dist=${best.dist})`);
      return {
        pieceId, type: 'pass',
        target: best.receiver.coord,
        targetPieceId: best.receiver.id,
      };
    }

    // ── 3. 中継パスルート（2手パス: A→B→C） ──
    // 前方のターゲットC
    const forwardTargets = teammates
      .filter(c => forwardness(currentHex, c.coord) > 2)
      .sort((a, b) => forwardness(currentHex, b.coord) - forwardness(currentHex, a.coord));

    for (const targetC of forwardTargets) {
      // 中継役B: パスが通る味方で、BからCにもパスが通る
      const relays = passes
        .map(p => {
          const relayB = myPieces.find(pc => pc.id === p.targetPieceId);
          if (!relayB || relayB.id === targetC.id) return null;
          // A→Bが通るか（敵本体チェック）
          if (isPassBlockedByBody(currentHex, relayB.coord)) return null;
          // B→Cが通るか（敵本体チェック）
          if (isPassBlockedByBody(relayB.coord, targetC.coord)) return null;
          // B→Cの距離が遠すぎないか（8HEX以内）
          if (hexDistance(relayB.coord, targetC.coord) > 8) return null;
          return { action: p, relayB, targetC };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

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

    // ── 4. 前方にドリブル（ライン範囲内、敵ZOC外を優先） ──
    {
      const range = getLineRange(pm.position, true);
      const dribbles = legalActions
        .filter(a => a.action === 'dribble' && a.targetHex)
        .filter(a => {
          const depth = toAttackDepth(a.targetHex!.row);
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
          // ZOC外を優先、同じなら前方優先
          if (a.inZoc !== b.inZoc) return a.inZoc ? 1 : -1;
          return b.fwdScore - a.fwdScore;
        });

      if (dribbles.length > 0) {
        const best = dribbles[0];
        console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: DRIBBLE forward(${best.action.targetHex!.col},${best.action.targetHex!.row})${best.inZoc ? ' [ZOC]' : ''}`);
        return { pieceId, type: 'dribble', target: best.action.targetHex };
      }
    }

    // ── 5. 横パス（距離が近い味方を優先） ──
    const lateralPasses = passes
      .map(p => {
        const receiver = myPieces.find(pc => pc.id === p.targetPieceId);
        if (!receiver) return null;
        if (isPassBlockedByBody(currentHex, receiver.coord)) return null;
        const dist = hexDistance(currentHex, receiver.coord);
        return { action: p, receiver, dist };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.dist - b.dist);

    if (lateralPasses.length > 0) {
      const best = lateralPasses[0];
      console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: LATERAL PASS → ${best.receiver.position}★${best.receiver.cost} (dist=${best.dist})`);
      return {
        pieceId, type: 'pass',
        target: best.receiver.coord,
        targetPieceId: best.receiver.id,
      };
    }

    // ── 6. 待機（最終手段） ──
    console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: STAY (no options)`);
    return { pieceId, type: 'stay' };
  }
}

// ================================================================
// ユーティリティ
// ================================================================

/** 移動先候補の中で目標rowに最も近いものを選ぶ */
function pickClosestToRow(moves: LegalAction[], targetRow: number): LegalAction | null {
  if (moves.length === 0) return null;
  return moves.reduce((best, m) => {
    const dBest = Math.abs(best.targetHex!.row - targetRow);
    const dCurr = Math.abs(m.targetHex!.row - targetRow);
    if (dCurr < dBest) return m;
    if (dCurr === dBest) {
      // 同距離なら横に広がる（col 10 = 中央から離れる）
      const cBest = Math.abs(best.targetHex!.col - 10);
      const cCurr = Math.abs(m.targetHex!.col - 10);
      return cCurr > cBest ? m : best;
    }
    return best;
  });
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
        targetPieceId: gemmaOrder.target_piece,
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
