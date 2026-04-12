// ============================================================
// legal_moves.ts — 合法手生成（§5 ルールベース安全層）
//
// 毎ターン全11枚の合法手を列挙。
// Gemmaに渡す構造化データの生成 & フォールバック時の手の列挙に使用。
// ============================================================

import type {
  Piece, Team, HexCoord, Zone, Lane, Order, OrderType,
  Cost, BoardContext,
} from '../engine/types';
import {
  hexKey,
  hexDistance,
  getNeighbors,
  getZocHexes,
  getZoc2Hexes,
  buildZocMap,
  buildZoc2Map,
  getMovementRange,
  hexLinePath,
} from '../engine/movement';
import { calcProbability } from '../engine/dice';
import hexMapData from '../data/hex_map.json';

// ── hex_map.json からBoardContext相当を構築 ──

interface HexEntry {
  col: number;
  row: number;
  x: number;
  y: number;
  zone: string;
  lane: string;
}

const hexMap = hexMapData as HexEntry[];

const hexLookup = new Map<string, HexEntry>();
for (const h of hexMap) hexLookup.set(`${h.col},${h.row}`, h);

function getZone(coord: HexCoord): Zone {
  return (hexLookup.get(hexKey(coord))?.zone as Zone) ?? 'ミドルサードD';
}

function getLane(coord: HexCoord): Lane {
  return (hexLookup.get(hexKey(coord))?.lane as Lane) ?? 'センターレーン';
}

function isValidHex(coord: HexCoord): boolean {
  return coord.col >= 0 && coord.col <= 21 && coord.row >= 0 && coord.row <= 33;
}

// ── シュートゾーン定義（ゴール6分割） ──

export type ShootZone = 'top_left' | 'top_center' | 'top_right' | 'bottom_left' | 'bottom_center' | 'bottom_right';
const SHOOT_ZONES: ShootZone[] = ['top_left', 'top_center', 'top_right', 'bottom_left', 'bottom_center', 'bottom_right'];

// ── ゴール位置（シュート射程判定用） ──

function goalCoord(attackingTeam: Team): HexCoord {
  // ball.ts と一致: home → row 33（ファイナルサード方向）、away → row 0（ディフェンシブGサード方向）
  return attackingTeam === 'home' ? { col: 10, row: 33 } : { col: 10, row: 0 };
}

// ── シュート射程（相手ゴール付近のゾーンからシュート可能） ──
// hex_map.json のゾーン名は絶対座標: row 0-5=ディフェンシブG, row 28-33=ファイナル
// home は row 33 方向に攻撃 → ファイナルサード/アタッキングサード でシュート可能
// away は row 0 方向に攻撃 → ディフェンシブGサード/ディフェンシブサード でシュート可能

const SHOOTABLE_ZONES_HOME = new Set<string>(['ファイナルサード', 'アタッキングサード']);
const SHOOTABLE_ZONES_AWAY = new Set<string>(['ディフェンシブGサード', 'ディフェンシブサード']);

function canShootFromZone(zone: Zone, team: Team): boolean {
  if (team === 'home') return SHOOTABLE_ZONES_HOME.has(zone);
  return SHOOTABLE_ZONES_AWAY.has(zone);
}

// ================================================================
// §5-1 合法手の型定義
// ================================================================

export interface LegalAction {
  /** ユニークID（Gemmaが参照する） */
  id: string;
  action: OrderType;
  targetHex?: HexCoord;
  targetPieceId?: string;
  benchPieceId?: string;
  shootZone?: ShootZone;
  /** Gemma向けの注釈 */
  note: string;
}

export interface PieceLegalMoves {
  pieceId: string;
  position: string;
  cost: number;
  currentHex: HexCoord;
  hasBall: boolean;
  legalActions: LegalAction[];
}

// ================================================================
// §5-1 合法手生成メイン
// ================================================================

export interface LegalMovesContext {
  pieces: Piece[];
  myTeam: Team;
  /** 残り交代回数 */
  remainingSubs: number;
  /** 交代後のフィールド総コスト上限 */
  maxFieldCost: number;
  /** ベンチコマ */
  benchPieces: Piece[];
}

/**
 * §5 全フィールドコマの合法手を列挙
 */
export function generateAllLegalMoves(ctx: LegalMovesContext): PieceLegalMoves[] {
  const { pieces, myTeam } = ctx;

  const myFieldPieces = pieces.filter((p) => p.team === myTeam && !isBench(p, ctx.benchPieces));
  const opponents = pieces.filter((p) => p.team !== myTeam);
  const teammates = pieces.filter((p) => p.team === myTeam);

  // ZOCマップ構築
  const opponentZocMap = buildZocMap(pieces, myTeam === 'home' ? 'away' : 'home');
  const opponentZoc2Map = buildZoc2Map(pieces, myTeam === 'home' ? 'away' : 'home');

  // 現在のフィールド総コスト
  const currentFieldCost = myFieldPieces.reduce((s, p) => s + p.cost, 0);

  const result: PieceLegalMoves[] = [];

  for (const piece of myFieldPieces) {
    const actions: LegalAction[] = [];
    let actionCounter = 0;
    const nextId = () => `a${++actionCounter}`;

    const zone = getZone(piece.coord);
    const lane = getLane(piece.coord);

    // ── §5-1 移動（ボール非保持・保持共通） ──
    const moveRange = getMovementRange(piece, false, zone, lane);
    const moveTargets = getReachableHexes(piece.coord, moveRange);

    for (const target of moveTargets) {
      // 同一位置はスキップ
      if (target.col === piece.coord.col && target.row === piece.coord.row) continue;
      // 味方コマがいるHEXには移動不可
      if (teammates.some((t) => t.id !== piece.id && t.coord.col === target.col && t.coord.row === target.row)) continue;

      const tk = hexKey(target);
      const inZoc = opponentZocMap.has(tk);
      const dist = hexDistance(piece.coord, target);
      const targetZone = getZone(target);

      const note = inZoc
        ? `距離${dist}, ${targetZone}, 相手ZOC内→停止+タックル`
        : `距離${dist}, ${targetZone}`;

      actions.push({ id: nextId(), action: 'move', targetHex: target, note });
    }

    // ── §5-1 ボール保持時の追加アクション ──
    if (piece.hasBall) {
      // ドリブル
      const dribbleRange = getMovementRange(piece, true, zone, lane);
      const dribbleTargets = getReachableHexes(piece.coord, dribbleRange);
      for (const target of dribbleTargets) {
        if (target.col === piece.coord.col && target.row === piece.coord.row) continue;
        if (teammates.some((t) => t.id !== piece.id && t.coord.col === target.col && t.coord.row === target.row)) continue;

        const tk = hexKey(target);
        const inZoc = opponentZocMap.has(tk);
        const note = inZoc
          ? `ドリブル, 相手ZOC内→タックル`
          : `ドリブル, ZOC外`;

        actions.push({ id: nextId(), action: 'dribble', targetHex: target, note });
      }

      // パス（射程内の全味方 §5-1）
      const passTargets = teammates.filter((t) => t.id !== piece.id && !isBench(t, ctx.benchPieces));
      for (const receiver of passTargets) {
        // パスカット推定（移動前盤面基準）
        const passCutEstimate = estimatePassCutProbability(
          piece, receiver, opponents, opponentZocMap, opponentZoc2Map,
        );
        const receiverZone = getZone(receiver.coord);
        const note = `${receiver.position}★${receiver.cost}, ${receiverZone}, パスカット推定${passCutEstimate}%`;

        actions.push({
          id: nextId(),
          action: 'pass',
          targetPieceId: receiver.id,
          note,
        });
      }

      // シュート（射程内ならゴール6ゾーン §5-1）
      if (canShootFromZone(zone, myTeam)) {
        const goal = goalCoord(myTeam);
        const distToGoal = hexDistance(piece.coord, goal);

        // ブロック推定
        const blockEstimate = estimateBlockProbability(piece, opponents);

        for (const shootZone of SHOOT_ZONES) {
          const note = `距離${distToGoal}HEX, ブロック推定${blockEstimate}%`;
          actions.push({
            id: nextId(),
            action: 'shoot',
            shootZone,
            targetHex: goal,
            note,
          });
        }
      }
    }

    // ── §5-1 交代 ──
    if (ctx.remainingSubs > 0) {
      for (const bench of ctx.benchPieces) {
        if (bench.team !== myTeam) continue;
        // コスト上限チェック
        const newCost = currentFieldCost - piece.cost + bench.cost;
        if (newCost > ctx.maxFieldCost) continue;

        const note = `${bench.position}★${bench.cost}と交代`;
        actions.push({
          id: nextId(),
          action: 'substitute',
          benchPieceId: bench.id,
          note,
        });
      }
    }

    // 静止（常に合法）
    actions.push({ id: nextId(), action: 'stay', note: '静止' });

    result.push({
      pieceId: piece.id,
      position: piece.position,
      cost: piece.cost,
      currentHex: piece.coord,
      hasBall: piece.hasBall,
      legalActions: actions,
    });
  }

  return result;
}

// ================================================================
// ヘルパー
// ================================================================

/** BFS で移動範囲内の全HEXを列挙 */
function getReachableHexes(from: HexCoord, range: number): HexCoord[] {
  const visited = new Set<string>();
  const result: HexCoord[] = [];
  const queue: { coord: HexCoord; dist: number }[] = [{ coord: from, dist: 0 }];
  visited.add(hexKey(from));

  while (queue.length > 0) {
    const { coord, dist } = queue.shift()!;
    result.push(coord);

    if (dist >= range) continue;

    for (const neighbor of getNeighbors(coord)) {
      if (!isValidHex(neighbor)) continue;
      const nk = hexKey(neighbor);
      if (visited.has(nk)) continue;
      visited.add(nk);
      queue.push({ coord: neighbor, dist: dist + 1 });
    }
  }

  return result;
}

/** パスカット確率の推定（移動前盤面基準 §5-2注記） */
function estimatePassCutProbability(
  passer: Piece,
  receiver: Piece,
  opponents: Piece[],
  opponentZocMap: Map<string, string>,
  opponentZoc2Map: Map<string, string>,
): number {
  // hexLinePathでパスコースを正確に生成し、ZOC/ZOC2の通過をカウント
  const passPath = hexLinePath(passer.coord, receiver.coord);
  let zocCrossings = 0;
  let zoc2Crossings = 0;

  for (const hex of passPath) {
    // 受け手自身のHEXは除外
    if (hex.col === receiver.coord.col && hex.row === receiver.coord.row) break;
    const mk = hexKey(hex);
    if (opponentZocMap.has(mk)) zocCrossings++;
    else if (opponentZoc2Map.has(mk)) zoc2Crossings++;
  }

  // 大まかな推定: ZOC1通過あたり20%、ZOC2通過あたり10%（上限80%）
  return Math.min(80, zocCrossings * 20 + zoc2Crossings * 10);
}

/** ブロック確率の推定（シュートコース上の守備ZOCをチェック） */
function estimateBlockProbability(shooter: Piece, opponents: Piece[]): number {
  const goal = goalCoord(shooter.team);
  const shootPath = hexLinePath(shooter.coord, goal);
  // シュートコース上のHEXが守備コマのZOC内にあるかカウント
  let blockerCount = 0;
  const counted = new Set<string>();
  for (const hex of shootPath) {
    for (const opp of opponents) {
      if (counted.has(opp.id)) continue;
      const oppZoc = getZocHexes(opp.coord);
      if (oppZoc.some(z => z.col === hex.col && z.row === hex.row) ||
          (opp.coord.col === hex.col && opp.coord.row === hex.row)) {
        blockerCount++;
        counted.add(opp.id);
      }
    }
  }
  return Math.min(60, blockerCount * 15);
}

function isBench(piece: Piece, benchPieces: Piece[]): boolean {
  return benchPieces.some((bp) => bp.id === piece.id);
}

// ================================================================
// §5-2 Gemmaへの合法手データ変換
// ================================================================

/**
 * Gemma入力用のJSON構造に変換（§5-2 フォーマット準拠）
 * 合法手は上位5手に絞る（§9-5 プロンプトサイズ管理）
 */
export function toLegalMovesJson(
  allMoves: PieceLegalMoves[],
  maxActionsPerPiece: number = 5,
): object[] {
  return allMoves.map((pm) => ({
    piece_id: pm.pieceId,
    position: pm.position,
    cost: pm.cost,
    current_hex: [pm.currentHex.col, pm.currentHex.row],
    has_ball: pm.hasBall,
    legal_actions: pm.legalActions.slice(0, maxActionsPerPiece).map((a) => ({
      id: a.id,
      action: a.action,
      ...(a.targetHex ? { target: [a.targetHex.col, a.targetHex.row] } : {}),
      ...(a.targetPieceId ? { target_piece: a.targetPieceId } : {}),
      ...(a.shootZone ? { zone: a.shootZone } : {}),
      ...(a.benchPieceId ? { bench_piece: a.benchPieceId } : {}),
      note: a.note,
    })),
  }));
}
