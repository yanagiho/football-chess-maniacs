// ============================================================
// rule_based.ts — フォーメーション維持型 ルールベースAI
//
// 核心: 3ラインを維持する。GK / DF線 / MF線 / FW線が崩れない。
// 攻撃時: ボール保持コマがシュート→前方パス→中継パス→ドリブルの優先順。
//         非保持コマはライン行動範囲内で前方に移動し、横に広がる。
// 守備時: ライン行動範囲内で自陣方向へ下がり、フォーメーション形状を保つ。
//         プレス役(FW/WG/OMから最大2体)のみ敵ボールに向かう。
// ============================================================

import type { Piece, Team, HexCoord, Order } from '../engine/types';
import { hexKey, hexDistance, hexLinePath, buildZocMap } from '../engine/movement';
import { evaluateBoard, recommendStrategy, type Strategy, type EvaluationResult } from './evaluator';
import {
  generateAllLegalMoves,
  type LegalMovesContext,
  type PieceLegalMoves,
  type LegalAction,
} from './legal_moves';
import type { Difficulty } from './prompt_builder';

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
  /** COM難易度（デフォルト: regular） */
  difficulty?: Difficulty;
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
    difficulty = 'regular',
  } = input;

  const goalDiff = myTeam === 'home' ? scoreHome - scoreAway : scoreAway - scoreHome;
  const evaluation = evaluateBoard(pieces, myTeam, scoreHome, scoreAway, turn, maxTurn);
  const strategy = recommendStrategy(goalDiff, turn, maxTurn);

  // ── 難易度パラメータ ──
  // beginner: 判断にランダム性を導入、一部コマに命令を出さない、プレス弱化
  // regular:  現状の標準動作
  // maniac:   シュート条件厳密化、ZOC考慮パス、プレス強化、2手パス距離緩和
  const diffConfig = {
    /** シュート可能距離 */
    shootRange: difficulty === 'beginner' ? 5 : difficulty === 'maniac' ? 9 : 7,
    /** プレス役の最大数 */
    maxPressers: difficulty === 'beginner' ? 1 : difficulty === 'maniac' ? 3 : 2,
    /** 命令を出さない（stay扱い）コマの確率（0-1） */
    skipRate: difficulty === 'beginner' ? 0.25 : 0,
    /** パスにZOC遮断チェックを使うか */
    useZocPassBlock: difficulty === 'maniac',
    /** 2手パスルートの最大距離(B→C) */
    relayMaxDist: difficulty === 'beginner' ? 6 : difficulty === 'maniac' ? 12 : 8,
    /** 最善手を選ぶか（false: 上位3つからランダム） */
    pickBest: difficulty !== 'beginner',
  };

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

  console.log(`[COM AI] === Turn ${turn} | ${isAttacking ? 'ATTACK' : 'DEFENSE'} mode | team=${myTeam} | difficulty=${difficulty} ===`);

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
      .slice(0, diffConfig.maxPressers);
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

  /** 難易度に応じて最善手 or 上位3つからランダム選択 */
  const pickByDifficulty = <T extends { score: number }>(sorted: T[]): T | undefined => {
    if (sorted.length === 0) return undefined;
    if (diffConfig.pickBest) return sorted[0];
    // beginner: 上位3つからランダム
    const topN = sorted.slice(0, Math.min(3, sorted.length));
    return topN[Math.floor(Math.random() * topN.length)];
  };

  for (const piece of sortedPieces) {
    const pm = legalMap.get(piece.id);
    if (!pm) continue;

    // ── beginner: 一部のコマに命令を出さない(stay) ──
    if (diffConfig.skipRate > 0 && piece.position !== 'GK' && Math.random() < diffConfig.skipRate) {
      addOrder({ pieceId: piece.id, type: 'stay' });
      console.log(`[COM AI]   ${piece.position}★${piece.cost} → SKIP (beginner random)`);
      continue;
    }

    // ── GK: ゴール中央（col 10, depth 1）付近に留まる ──
    if (piece.position === 'GK') {
      const gkTargetRow = fromAttackDepth(1);
      const gkTargetCol = 10;
      const moves = getFilteredMoves(pm, isAttacking);
      // ゴール中央への距離でスコアリング（row重視 + col中央重視）
      const scored = moves.map(m => {
        const rowDist = -Math.abs(m.targetHex!.row - gkTargetRow);
        const colDist = -Math.abs(m.targetHex!.col - gkTargetCol);
        return { action: m, score: rowDist * 3 + colDist * 2 };
      }).sort((a, b) => b.score - a.score);

      // 現在位置がすでにゴール中央付近ならstay
      const currentRowDist = Math.abs(piece.coord.row - gkTargetRow);
      const currentColDist = Math.abs(piece.coord.col - gkTargetCol);
      const alreadyGood = currentRowDist <= 1 && currentColDist <= 1;

      if (scored.length > 0 && !alreadyGood) {
        const best = scored[0];
        addOrder({ pieceId: piece.id, type: 'move', target: best.action.targetHex });
        console.log(`[COM AI]   GK → move(${best.action.targetHex!.col},${best.action.targetHex!.row})`);
      } else {
        addOrder({ pieceId: piece.id, type: 'stay' });
        console.log(`[COM AI]   GK → stay (already at goal center)`);
      }
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

      // スコアリング: 目標行への接近 + 適度な横幅 + 味方から離れる
      const scored = moves.map(m => {
        const targetDepthActual = toAttackDepth(m.targetHex!.row);
        const rowCloseness = -Math.abs(m.targetHex!.row - targetRow); // 目標rowに近いほど良い（最重要）
        // 横幅: 中央付近を維持しつつ適度に広がる（col 5〜15が理想帯、端は減点）
        const colDist = Math.abs(m.targetHex!.col - 10);
        const spreadScore = colDist <= 5 ? colDist * 0.5 : -(colDist - 5) * 2; // 5以内は微加点、超えると大減点
        // 味方から離れているか（固まらない）
        const minAllyDist = myPieces
          .filter(p => p.id !== piece.id)
          .reduce((min, p) => Math.min(min, hexDistance(m.targetHex!, p.coord)), 99);
        const notClumped = minAllyDist >= 2 ? 2 : minAllyDist >= 1 ? 0 : -3;
        // ライン範囲の中央に留まるボーナス（上限に張り付かない）
        const rangeMid = (range.min + range.max) / 2;
        const rangeCenter = -Math.abs(targetDepthActual - rangeMid) * 0.3;

        return {
          action: m,
          score: rowCloseness * 4 + spreadScore + notClumped + rangeCenter,
        };
      }).sort((a, b) => b.score - a.score);

      const picked = pickByDifficulty(scored);
      if (picked) {
        addOrder({ pieceId: piece.id, type: 'move', target: picked.action.targetHex });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → ATK move(${picked.action.targetHex!.col},${picked.action.targetHex!.row})`);
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
        // 端に行きすぎない（col 3〜18が理想帯）
        const colDist = Math.abs(m.targetHex!.col - 10);
        const edgePenalty = colDist > 8 ? -(colDist - 8) * 3 : 0;
        return { action: m, score: rowDist * 3 + minAllyDist * 2 + edgePenalty };
      }).sort((a, b) => b.score - a.score);

      const picked = pickByDifficulty(scored);
      if (picked) {
        addOrder({ pieceId: piece.id, type: 'move', target: picked.action.targetHex });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF line(${picked.action.targetHex!.col},${picked.action.targetHex!.row})`);
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
        const colDist = Math.abs(m.targetHex!.col - 10);
        const spreadScore = colDist <= 5 ? colDist * 0.5 : -(colDist - 5) * 2;
        const minAllyDist = myPieces
          .filter(p => p.id !== piece.id)
          .reduce((min, p) => Math.min(min, hexDistance(m.targetHex!, p.coord)), 99);
        const notClumped = minAllyDist >= 2 ? 2 : minAllyDist >= 1 ? 0 : -3;
        return { action: m, score: rowCloseness * 4 + spreadScore + notClumped };
      }).sort((a, b) => b.score - a.score);

      const picked = pickByDifficulty(scored);
      if (picked) {
        addOrder({ pieceId: piece.id, type: 'move', target: picked.action.targetHex });
        console.log(`[COM AI]   ${piece.position}★${piece.cost} → DEF retreat(${picked.action.targetHex!.col},${picked.action.targetHex!.row})`);
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
    if (shoots.length > 0 && distToGoal <= diffConfig.shootRange) {
      console.log(`[COM AI]   Ball★${pm.position}★${pm.cost}: SHOOT (dist=${distToGoal})`);
      return { pieceId, type: 'shoot', target: { col: 10, row: goalRow } };
    }

    // ── 2. パスが通る味方にパス（前方〜横を含む） ──
    // maniac: ZOC遮断チェックでパスカットリスクを考慮
    const passBlockCheck = diffConfig.useZocPassBlock ? isPassBlockedByZoc : isPassBlockedByBody;
    const passCandidates = passes
      .map(p => {
        const receiver = myPieces.find(pc => pc.id === p.targetPieceId);
        if (!receiver) return null;
        const fwdScore = forwardness(currentHex, receiver.coord);
        const blocked = passBlockCheck(currentHex, receiver.coord);
        const dist = hexDistance(currentHex, receiver.coord);
        // 近すぎるパスは効果が薄い
        if (dist <= 1) return null;
        return { action: p, receiver, fwdScore, blocked, dist };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && !x.blocked)
      .sort((a, b) => {
        // 前方パスを優先、同程度なら近い方
        const fwdA = a.fwdScore > 0 ? 1 : 0;
        const fwdB = b.fwdScore > 0 ? 1 : 0;
        if (fwdA !== fwdB) return fwdB - fwdA;
        return b.fwdScore - a.fwdScore || a.dist - b.dist;
      });

    if (passCandidates.length > 0) {
      // beginner: 上位3つからランダム選択
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
          // B→Cの距離が遠すぎないか
          if (hexDistance(relayB.coord, targetC.coord) > diffConfig.relayMaxDist) return null;
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

    // ── 4. ドリブル（パスが全て塞がれた場合のフォールバック） ──
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

