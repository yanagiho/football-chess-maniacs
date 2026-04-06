// ============================================================
// rule_based.ts — ルールベース最善手選択（§1-3 フォールバック用）
//
// Gemmaなしで単独動作する完全なAIエンジン。
// Workers AI障害時に自動でこちらに切り替え。プレイヤーに影響ゼロ。
// ブートストラップ Phase 1 の自動対戦にも使用（§3-1）。
// ============================================================

import type { Piece, Team, HexCoord, Order, OrderType, Zone } from '../engine/types';
import { hexKey, hexDistance, getNeighbors } from '../engine/movement';
import { evaluateBoard, recommendStrategy, type Strategy, type EvaluationResult } from './evaluator';
import {
  generateAllLegalMoves,
  type LegalMovesContext,
  type PieceLegalMoves,
  type LegalAction,
} from './legal_moves';

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

/**
 * ルールベースAIで全11枚の指示を生成する。
 *
 * Gemmaのフォールバックとして、および
 * ブートストラップ自動対戦（§3-1）で使用。
 */
export function generateRuleBasedOrders(input: RuleBasedInput): RuleBasedOutput {
  const {
    pieces,
    myTeam,
    scoreHome,
    scoreAway,
    turn,
    maxTurn = 90,
    remainingSubs,
    benchPieces,
    maxFieldCost = 16,
  } = input;

  const goalDiff = myTeam === 'home' ? scoreHome - scoreAway : scoreAway - scoreHome;

  // 局面評価
  const evaluation = evaluateBoard(pieces, myTeam, scoreHome, scoreAway, turn, maxTurn);
  const strategy = recommendStrategy(goalDiff, turn, maxTurn);

  // 合法手生成
  const ctx: LegalMovesContext = {
    pieces,
    myTeam,
    remainingSubs,
    maxFieldCost,
    benchPieces,
  };
  const allLegalMoves = generateAllLegalMoves(ctx);

  // 各コマの最善手を選択
  const orders: Order[] = [];
  const usedPieceIds = new Set<string>();

  // ボール保持コマを最優先で処理
  const ballHolder = allLegalMoves.find((pm) => pm.hasBall);
  if (ballHolder) {
    const order = selectBestAction(ballHolder, strategy, pieces, myTeam, allLegalMoves);
    if (order) {
      orders.push(order);
      usedPieceIds.add(ballHolder.pieceId);
    }
  }

  // 残りのコマを処理
  const sortedPieces = sortByPriority(allLegalMoves, strategy, usedPieceIds);

  for (const pieceMoves of sortedPieces) {
    if (usedPieceIds.has(pieceMoves.pieceId)) continue;

    const order = selectBestAction(pieceMoves, strategy, pieces, myTeam, allLegalMoves);
    if (order) {
      orders.push(order);
      usedPieceIds.add(pieceMoves.pieceId);
    }
  }

  return { orders, evaluation, strategy };
}

// ================================================================
// 指示優先順位でコマをソート
// ================================================================

function sortByPriority(
  allMoves: PieceLegalMoves[],
  strategy: Strategy,
  skipIds: Set<string>,
): PieceLegalMoves[] {
  const POSITION_PRIORITY_ATTACK: Record<string, number> = {
    FW: 10, WG: 9, OM: 8, MF: 6, VO: 4, SB: 3, DF: 2, GK: 1,
  };
  const POSITION_PRIORITY_DEFEND: Record<string, number> = {
    GK: 1, DF: 10, SB: 9, VO: 8, MF: 6, OM: 4, WG: 3, FW: 2,
  };

  const priorityMap = (strategy === 'attack' || strategy === 'desperate_attack')
    ? POSITION_PRIORITY_ATTACK
    : strategy === 'defend'
    ? POSITION_PRIORITY_DEFEND
    : POSITION_PRIORITY_ATTACK; // balanced → やや攻撃寄り

  return [...allMoves]
    .filter((pm) => !skipIds.has(pm.pieceId))
    .sort((a, b) => {
      const pa = priorityMap[a.position] ?? 5;
      const pb = priorityMap[b.position] ?? 5;
      // 高コストコマを優先
      if (pb !== pa) return pb - pa;
      return b.cost - a.cost;
    });
}

// ================================================================
// 各コマの最善手選択
// ================================================================

function selectBestAction(
  pieceMoves: PieceLegalMoves,
  strategy: Strategy,
  allPieces: Piece[],
  myTeam: Team,
  allLegalMoves: PieceLegalMoves[],
): Order | null {
  const { pieceId, hasBall, legalActions, position, currentHex } = pieceMoves;
  const piece = allPieces.find((p) => p.id === pieceId);
  if (!piece) return null;

  // ── ボール保持時 ──
  if (hasBall) {
    return selectBallHolderAction(pieceMoves, strategy, allPieces, myTeam, allLegalMoves);
  }

  // ── ボール非保持時 ──
  return selectNonBallAction(pieceMoves, strategy, allPieces, myTeam);
}

// ================================================================
// ボール保持コマの指示選択
// ================================================================

function selectBallHolderAction(
  pm: PieceLegalMoves,
  strategy: Strategy,
  allPieces: Piece[],
  myTeam: Team,
  allLegalMoves: PieceLegalMoves[],
): Order {
  const { pieceId, legalActions, currentHex } = pm;
  const shoots = legalActions.filter((a) => a.action === 'shoot');
  const passes = legalActions.filter((a) => a.action === 'pass' && a.targetPieceId);

  // ゴールまでの距離
  const goalRow = myTeam === 'home' ? 33 : 0;
  const distToGoal = Math.abs(currentHex.row - goalRow);

  // ── 1. 前方パス（ビルドアップ優先。パスカットでボール失う機会を作る） ──
  if (passes.length > 0) {
    const scoredPasses = passes.map((p) => {
      const receiver = allPieces.find((pc) => pc.id === p.targetPieceId);
      if (!receiver) return { action: p, score: -100 };

      const forwardScore = moveDirectionScore(currentHex, receiver.coord, myTeam, strategy);
      const cutProb = parseEstimateFromNote(p.note, 'パスカット推定');
      const score = forwardScore * 5 - cutProb * 0.8;
      return { action: p, score };
    }).sort((a, b) => b.score - a.score);

    if (scoredPasses.length > 0 && scoredPasses[0].score > 0) {
      const best = scoredPasses[0].action;
      const cutProb = parseEstimateFromNote(best.note, 'パスカット推定');
      if (cutProb <= 45) {
        return actionToOrder(pieceId, best, allPieces);
      }
    }
  }

  // ── 2. 近距離シュート（ゴールまで4HEX以内かつブロック推定30%以下） ──
  if (shoots.length > 0 && distToGoal <= 4) {
    const bestShoot = shoots.reduce((best, s) => {
      const blockEst = parseEstimateFromNote(s.note, 'ブロック推定');
      const bestBlockEst = parseEstimateFromNote(best.note, 'ブロック推定');
      return blockEst < bestBlockEst ? s : best;
    });
    const blockEst = parseEstimateFromNote(bestShoot.note, 'ブロック推定');
    if (blockEst <= 30) {
      return actionToOrder(pieceId, bestShoot);
    }
  }

  // ── 3. ドリブルで前進（ZOC外、攻撃方向） ──
  const dribbles = legalActions
    .filter((a) => a.action === 'dribble' && !a.note.includes('ZOC内'))
    .map((a) => ({
      action: a,
      dirScore: moveDirectionScore(currentHex, a.targetHex!, myTeam, strategy),
    }))
    .filter((d) => d.dirScore > 0)
    .sort((a, b) => b.dirScore - a.dirScore);

  if (dribbles.length > 0) {
    return actionToOrder(pieceId, dribbles[0].action);
  }

  // ── 4. 中距離シュート（ドリブル不可の場合、ゴールまで6HEX以内） ──
  if (shoots.length > 0 && distToGoal <= 6) {
    const bestShoot = shoots.reduce((best, s) => {
      const blockEst = parseEstimateFromNote(s.note, 'ブロック推定');
      const bestBlockEst = parseEstimateFromNote(best.note, 'ブロック推定');
      return blockEst < bestBlockEst ? s : best;
    });
    return actionToOrder(pieceId, bestShoot);
  }

  // ── 5. ZOC内ドリブル前進 ──
  const zocDribbles = legalActions
    .filter((a) => a.action === 'dribble')
    .map((a) => ({
      action: a,
      dirScore: moveDirectionScore(currentHex, a.targetHex!, myTeam, strategy),
    }))
    .filter((d) => d.dirScore > 0)
    .sort((a, b) => b.dirScore - a.dirScore);

  if (zocDribbles.length > 0) {
    return actionToOrder(pieceId, zocDribbles[0].action);
  }

  // ── 6. 遠距離シュート（他に選択肢がない場合、ゴール10HEX以内） ──
  if (shoots.length > 0 && distToGoal <= 10) {
    return actionToOrder(pieceId, shoots[0]);
  }

  // ── 7. 後方パス（安全弁） ──
  if (passes.length > 0) {
    const safest = passes.reduce((best, p) => {
      const cutEst = parseEstimateFromNote(p.note, 'パスカット推定');
      const bestCutEst = parseEstimateFromNote(best.note, 'パスカット推定');
      return cutEst < bestCutEst ? p : best;
    });
    return actionToOrder(pieceId, safest, allPieces);
  }

  // ── 6. フォールバック: 静止 ──
  return { pieceId, type: 'stay' };
}

// ================================================================
// ボール非保持コマの指示選択
// ================================================================

function selectNonBallAction(
  pm: PieceLegalMoves,
  strategy: Strategy,
  allPieces: Piece[],
  myTeam: Team,
): Order {
  const { pieceId, legalActions, position, currentHex } = pm;

  // 移動候補をスコアリング
  const moves = legalActions
    .filter((a) => a.action === 'move')
    .map((a) => ({
      action: a,
      score: scoreMoveTarget(pm, a, strategy, allPieces, myTeam),
    }))
    .sort((a, b) => b.score - a.score);

  if (moves.length > 0 && moves[0].score > 0) {
    return actionToOrder(pieceId, moves[0].action);
  }

  // 移動する価値がなければ静止
  return { pieceId, type: 'stay' };
}

// ================================================================
// 移動先のスコアリング
// ================================================================

function scoreMoveTarget(
  pm: PieceLegalMoves,
  action: LegalAction,
  strategy: Strategy,
  allPieces: Piece[],
  myTeam: Team,
): number {
  if (!action.targetHex) return 0;

  let score = 0;
  const from = pm.currentHex;
  const to = action.targetHex;

  // 戦略に基づく方向ボーナス
  score += moveDirectionScore(from, to, myTeam, strategy) * 3;

  // ZOC内はペナルティ（タックルリスク）
  if (action.note.includes('ZOC内')) {
    score -= 15;
  }

  // ポジションに適したゾーンへの移動はボーナス
  score += positionZoneAffinity(pm.position, to, myTeam);

  // ボール保持者に近づく動きはボーナス（攻撃時）
  if (strategy === 'attack' || strategy === 'desperate_attack') {
    const ballHolder = allPieces.find((p) => p.hasBall && p.team === myTeam);
    if (ballHolder) {
      const distBefore = hexDistance(from, ballHolder.coord);
      const distAfter = hexDistance(to, ballHolder.coord);
      if (distAfter < distBefore) score += 5;
    }
  }

  // 同一ポジションの味方と近すぎない方が良い（分散ボーナス）
  const samePosPieces = allPieces.filter(
    (p) => p.team === myTeam && p.position === pm.position && p.id !== pm.pieceId,
  );
  for (const sp of samePosPieces) {
    const dist = hexDistance(to, sp.coord);
    if (dist <= 1) score -= 8;
    else if (dist <= 2) score -= 3;
    else if (dist >= 4) score += 2;
  }

  return score;
}

/** 攻撃方向への移動スコア（hexDistanceベースでodd-q非対称を排除） */
function moveDirectionScore(from: HexCoord, to: HexCoord, myTeam: Team, strategy: Strategy): number {
  // ゴール座標への距離が縮まるほど高スコア
  const goal: HexCoord = myTeam === 'home' ? { col: 10, row: 33 } : { col: 10, row: 0 };
  const distBefore = hexDistance(from, goal);
  const distAfter = hexDistance(to, goal);
  const attackDir = distBefore - distAfter; // 正=ゴールに近づいた

  if (strategy === 'attack' || strategy === 'desperate_attack') {
    return attackDir * 2;
  } else if (strategy === 'defend') {
    return -attackDir; // 守備時は後退を評価
  }
  return attackDir; // balanced
}

/** ポジションとゾーンの親和性スコア（hexDistanceベース） */
function positionZoneAffinity(position: string, coord: HexCoord, myTeam: Team): number {
  // ゴールまでのhexDistanceで位置を正規化（0=ゴール至近, 33=自陣奥）
  const goal: HexCoord = myTeam === 'home' ? { col: 10, row: 33 } : { col: 10, row: 0 };
  const distToGoal = hexDistance(coord, goal);
  const attackRow = 33 - distToGoal; // 0=自陣奥, 33=相手ゴール至近

  switch (position) {
    case 'GK':
      return attackRow <= 4 ? 10 : -20;
    case 'DF':
    case 'SB':
      return attackRow <= 12 ? 5 : attackRow >= 25 ? -10 : 0;
    case 'VO':
      return attackRow >= 10 && attackRow <= 22 ? 5 : -3;
    case 'MF':
      return attackRow >= 12 && attackRow <= 25 ? 5 : -3;
    case 'OM':
      return attackRow >= 18 ? 5 : -3;
    case 'WG':
    case 'FW':
      return attackRow >= 22 ? 8 : attackRow >= 16 ? 3 : -5;
    default:
      return 0;
  }
}

// ================================================================
// ユーティリティ
// ================================================================

/** LegalAction → Order 変換 */
function actionToOrder(pieceId: string, action: LegalAction, allPieces?: Piece[]): Order {
  // パスの場合: 受け手コマのIDと座標を target にセット
  if (action.action === 'pass' && action.targetPieceId && allPieces) {
    const receiver = allPieces.find((p) => p.id === action.targetPieceId);
    if (receiver) {
      return { pieceId, type: 'pass', target: receiver.coord, targetPieceId: action.targetPieceId };
    }
  }
  return {
    pieceId,
    type: action.action,
    target: action.targetHex,
  };
}

/** ノート文字列からパーセンテージ値を抽出 */
function parseEstimateFromNote(note: string, prefix: string): number {
  const match = note.match(new RegExp(`${prefix}(\\d+)%`));
  return match ? parseInt(match[1], 10) : 50;
}

// ================================================================
// §9-3 Gemma出力の検証・フォールバック置換
// ================================================================

export interface GemmaOrder {
  piece_id: string;
  action: string;
  target_hex?: [number, number];
  target_piece?: string;
  zone?: string;
  bench_piece?: string;
}

/**
 * §9-3 Gemma出力をパース・検証し、不正な指示をルールベースで置換
 */
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
    // 重複チェック
    if (usedIds.has(gemmaOrder.piece_id)) continue;

    // 自チームのフィールドコマか
    const pieceMoves = legalMap.get(gemmaOrder.piece_id);
    if (!pieceMoves) continue;

    // Gemmaの指示が合法手リスト内か
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

  // §9-3: 不正なorderはルールベース最善手で置換
  for (const [pieceId, pieceMoves] of legalMap) {
    if (usedIds.has(pieceId)) continue;
    const fallback = ruleMap.get(pieceId);
    if (fallback) {
      result.push(fallback);
      usedIds.add(pieceId);
    }
  }

  return result;
}
