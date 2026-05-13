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
import type { AiContext, DiffConfig, TeamTactics } from './ai_context';
import { selectBallHolderOrder } from './ball_holder_ai';
import { selectFormationOrders } from './formation_ai';

// ================================================================
// 定数
// ================================================================

/** away は row 0 方向に攻撃、home は row 33 方向に攻撃 */
const GOAL_ROW = { home: 33, away: 0 } as const;
const MAX_ROW = 33;

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
  /** チーム戦術パラメータ（プリセットチーム用） */
  teamTactics?: TeamTactics;
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
    difficulty = 'regular', teamTactics,
  } = input;

  const goalDiff = myTeam === 'home' ? scoreHome - scoreAway : scoreAway - scoreHome;
  const evaluation = evaluateBoard(pieces, myTeam, scoreHome, scoreAway, turn, maxTurn);
  const strategy = recommendStrategy(goalDiff, turn, maxTurn);

  // ── 難易度パラメータ（teamTacticsで部分オーバーライド可能） ──
  const baseDiffConfig: DiffConfig = {
    shootRange: difficulty === 'beginner' ? 5 : difficulty === 'maniac' ? 9 : 7,
    maxPressers: difficulty === 'beginner' ? 1 : difficulty === 'maniac' ? 3 : 2,
    skipRate: difficulty === 'beginner' ? 0.25 : 0,
    useZocPassBlock: difficulty === 'maniac',
    relayMaxDist: difficulty === 'beginner' ? 6 : difficulty === 'maniac' ? 12 : 8,
    pickBest: difficulty !== 'beginner',
  };
  const diffConfig: DiffConfig = teamTactics?.diffOverrides
    ? { ...baseDiffConfig, ...teamTactics.diffOverrides }
    : baseDiffConfig;

  // 合法手生成
  const allLegalMoves = generateAllLegalMoves({ pieces, myTeam, remainingSubs, maxFieldCost, benchPieces });

  const myPieces = pieces.filter(p => p.team === myTeam);
  const opponents = pieces.filter(p => p.team !== myTeam);
  const myBallHolder = myPieces.find(p => p.hasBall);
  const enemyBallHolder = opponents.find(p => p.hasBall);
  const isAttacking = !!myBallHolder;

  const goalRow = GOAL_ROW[myTeam];
  const ownGoalRow = myTeam === 'home' ? 0 : MAX_ROW;
  const fwd = myTeam === 'home' ? 1 : -1;

  // ZOCマップ（敵チーム）
  const enemyTeam: Team = myTeam === 'home' ? 'away' : 'home';
  const enemyZoc = buildZocMap(pieces, enemyTeam);

  // 占有チェック用
  const occupiedByEnemy = new Set(opponents.map(p => hexKey(p.coord)));
  const usedTargets = new Set<string>();
  const orders: Order[] = [];
  const legalMap = new Map(allLegalMoves.map(pm => [pm.pieceId, pm]));

  console.log(`[COM AI] === Turn ${turn} | ${isAttacking ? 'ATTACK' : 'DEFENSE'} mode | team=${myTeam} | difficulty=${difficulty} ===`);

  // ── コンテキスト作成 ──
  const ctx: AiContext = {
    myTeam, myPieces, opponents, goalRow, ownGoalRow, fwd, diffConfig,
    usedTargets, legalMap,

    toAttackDepth: (row: number): number => myTeam === 'home' ? row : MAX_ROW - row,
    fromAttackDepth: (depth: number): number => myTeam === 'home' ? depth : MAX_ROW - depth,

    isPassBlockedByBody: (from: HexCoord, to: HexCoord): boolean => {
      const path = hexLinePath(from, to);
      for (const hex of path) {
        if (hex.col === to.col && hex.row === to.row) break;
        if (occupiedByEnemy.has(hexKey(hex))) return true;
      }
      return false;
    },

    isPassBlockedByZoc: (from: HexCoord, to: HexCoord): boolean => {
      const path = hexLinePath(from, to);
      for (const hex of path) {
        if (hex.col === to.col && hex.row === to.row) break;
        const k = hexKey(hex);
        if (occupiedByEnemy.has(k)) return true;
        if (enemyZoc.has(k)) return true;
      }
      return false;
    },

    getLineRange: (position: string, attacking: boolean): { min: number; max: number } => {
      // teamTacticsにオーバーライドがあればそちらを優先
      const override = teamTactics?.lineRanges?.[position];
      if (override) return attacking ? override.attack : override.defense;

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
      return attacking ? { min: 16, max: 32 } : { min: 14, max: 22 };
    },

    getFilteredMoves: (pm: PieceLegalMoves, attacking: boolean): LegalAction[] => {
      const range = ctx.getLineRange(pm.position, attacking);
      return pm.legalActions
        .filter(a => a.action === 'move' && a.targetHex)
        .filter(a => {
          const depth = ctx.toAttackDepth(a.targetHex!.row);
          return depth >= range.min && depth <= range.max;
        })
        .filter(a => !usedTargets.has(hexKey(a.targetHex!)));
    },

    forwardness: (from: HexCoord, to: HexCoord): number => (to.row - from.row) * fwd,

    addOrder: (order: Order) => {
      orders.push(order);
      if (order.target) usedTargets.add(hexKey(order.target));
    },
  };

  // ── ボール保持コマの行動（攻撃時） ──
  if (myBallHolder) {
    const pm = legalMap.get(myBallHolder.id);
    if (pm) {
      const order = selectBallHolderOrder(pm, ctx);
      ctx.addOrder(order);
    }
  }

  // ── プレス役の選定（守備時のみ） ──
  const pressIds = new Set<string>();
  if (!isAttacking && enemyBallHolder) {
    const pressCandidates = myPieces
      .filter(p => ['FW', 'WG', 'OM'].includes(p.position) && !p.hasBall)
      .map(p => ({ piece: p, dist: hexDistance(p.coord, enemyBallHolder.coord) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, diffConfig.maxPressers);
    for (const t of pressCandidates) pressIds.add(t.piece.id);
  }

  // ── 非ボール保持コマの行動 ──
  const posOrder = ['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'];
  const sortedPieces = [...myPieces]
    .filter(p => !p.hasBall)
    .sort((a, b) => posOrder.indexOf(a.position) - posOrder.indexOf(b.position));

  selectFormationOrders(sortedPieces, pressIds, enemyBallHolder, isAttacking, ctx);

  // 最終ログ
  console.log(`[COM AI] === orders=${orders.length}: ${orders.map(o => {
    const p = pieces.find(pp => pp.id === o.pieceId);
    return `${p?.position ?? '?'}:${o.type}${o.target ? `(${o.target.col},${o.target.row})` : ''}`;
  }).join(', ')} ===`);

  return { orders, evaluation, strategy };
}
