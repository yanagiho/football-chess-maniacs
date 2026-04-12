// ============================================================
// movement.ts — フェーズ1: コマ移動処理
//
// §9-2 フェーズ1 処理順:
//   1. 全コマ同時移動（移動前ZOCを基準に停止位置を決定）
//   2. 相手ZOC進入で強制停止
//   3. 同一HEX競合 → 競合判定（§7-6）
//   4. ドリブルコマがZOC停止 → タックル判定（§7-4）
//   5. タックルがアタッキングサード → ファウル判定（§7-5）
// ============================================================

import { resolveCollision } from './collision';
import { resolveFoul } from './foul';
import { resolveTackle } from './tackle';
import type {
  BallAcquiredEvent,
  BoardContext,
  CollisionEvent,
  FoulEvent,
  GameEvent,
  HexCoord,
  Lane,
  Order,
  Piece,
  PieceMovedEvent,
  Position,
  Team,
  TackleEvent,
  ZocAdjacency,
  ZocStopEvent,
  LooseBallEvent,
  Zone,
} from './types';

// ============================================================
// HEX ユーティリティ（flat-top odd-q オフセット）
// ============================================================

interface CubeCoord { x: number; y: number; z: number }

export function hexKey(h: HexCoord): string {
  return `${h.col},${h.row}`;
}

function toCube(h: HexCoord): CubeCoord {
  const x = h.col;
  const z = h.row - (h.col - (h.col & 1)) / 2;
  return { x, y: -x - z, z };
}

function fromCube(c: CubeCoord): HexCoord {
  const col = c.x;
  const row = c.z + (c.x - (c.x & 1)) / 2;
  return { col, row };
}

function cubeRound(x: number, y: number, z: number): CubeCoord {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const ca = toCube(a), cb = toCube(b);
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
}

/**
 * flat-top odd-q: 奇数列は偶数列より下にオフセット。
 * 偶数列の隣接方向: 上, 下, 左上, 左下, 右上, 右下
 * 奇数列の隣接方向: 上, 下, 左上, 左下, 右上, 右下（row オフセットが逆転）
 */
export function getNeighbors(h: HexCoord): HexCoord[] {
  if ((h.col & 1) === 1) {
    // odd column
    return [
      { col: h.col,     row: h.row - 1 },
      { col: h.col,     row: h.row + 1 },
      { col: h.col - 1, row: h.row     },
      { col: h.col - 1, row: h.row + 1 },
      { col: h.col + 1, row: h.row     },
      { col: h.col + 1, row: h.row + 1 },
    ];
  } else {
    // even column
    return [
      { col: h.col,     row: h.row - 1 },
      { col: h.col,     row: h.row + 1 },
      { col: h.col - 1, row: h.row - 1 },
      { col: h.col - 1, row: h.row     },
      { col: h.col + 1, row: h.row - 1 },
      { col: h.col + 1, row: h.row     },
    ];
  }
}

/** ZOC（隣接6HEX）= getNeighbors */
export function getZocHexes(h: HexCoord): HexCoord[] {
  return getNeighbors(h);
}

/**
 * ZOC2（外周12HEX: 距離2のHEX群）
 * 距離1ハーフを除いた距離2の全HEX。
 */
export function getZoc2Hexes(h: HexCoord): HexCoord[] {
  const excluded = new Set<string>([hexKey(h), ...getZocHexes(h).map(hexKey)]);
  const result: HexCoord[] = [];
  const seen = new Set<string>();
  for (const n1 of getZocHexes(h)) {
    for (const n2 of getZocHexes(n1)) {
      const k = hexKey(n2);
      if (!excluded.has(k) && !seen.has(k)) {
        seen.add(k);
        result.push(n2);
      }
    }
  }
  return result;
}

/**
 * from → to の直線パス（from 除く、to 含む、最大 maxSteps HEX）
 * cube 座標の線形補間で HEX 列を生成。
 */
export function hexLinePath(from: HexCoord, to: HexCoord, maxSteps?: number): HexCoord[] {
  const a = toCube(from), b = toCube(to);
  const n = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  if (n === 0) return [];
  const steps = maxSteps !== undefined ? Math.min(n, maxSteps) : n;
  const path: HexCoord[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / n;
    const c = cubeRound(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t,
    );
    path.push(fromCube(c));
  }
  return path;
}

// ============================================================
// ZOC マップ構築
// ============================================================

/**
 * 指定チームの ZOC マップ: hexKey → ZOC を展開しているコマID
 * （複数コマが同じHEXをカバーする場合は最初のコマIDのみ記録）
 */
export function buildZocMap(pieces: Piece[], team: Team): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of pieces) {
    if (p.team !== team) continue;
    for (const n of getZocHexes(p.coord)) {
      const k = hexKey(n);
      if (!map.has(k)) map.set(k, p.id);
    }
  }
  return map;
}

/**
 * 指定チームの ZOC2 マップ: hexKey → コマID
 */
export function buildZoc2Map(pieces: Piece[], team: Team): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of pieces) {
    if (p.team !== team) continue;
    for (const n of getZoc2Hexes(p.coord)) {
      const k = hexKey(n);
      if (!map.has(k)) map.set(k, p.id);
    }
  }
  return map;
}

/**
 * 指定HEXの ZOC 隣接情報（攻撃/守備コマ数）
 * coord のZOC内（隣接6HEX）にいるコマを数える。
 */
export function getZocAdjacency(
  coord: HexCoord,
  attackTeam: Team,
  pieces: Piece[],
): ZocAdjacency {
  const defenseTeam: Team = attackTeam === 'home' ? 'away' : 'home';
  const zocKeys = new Set(getZocHexes(coord).map(hexKey));
  let attackCount = 0, defenseCount = 0;
  for (const p of pieces) {
    if (!zocKeys.has(hexKey(p.coord))) continue;
    if (p.team === attackTeam) attackCount++;
    else if (p.team === defenseTeam) defenseCount++;
  }
  return { attackCount, defenseCount };
}

// ============================================================
// 移動力計算（§8-1）
// ============================================================

const ZONE_BONUS_MAP: Partial<Record<Zone | Lane, Position[]>> = {
  'アタッキングサード': ['OM'],
  'ミドルサードD':      ['VO'],
  'ミドルサードA':      ['MF'],
  'ファイナルサード':   ['FW'],
  'ディフェンシブサード':   ['DF'],
  'ディフェンシブGサード':  ['DF'],
  '左サイドレーン':  ['WG', 'SB'],
  '右サイドレーン': ['WG', 'SB'],
};

function hasZoneBonus(pos: Position, zone: Zone, lane: Lane): boolean {
  return (
    (ZONE_BONUS_MAP[zone]?.includes(pos) ?? false) ||
    (ZONE_BONUS_MAP[lane]?.includes(pos) ?? false)
  );
}

export function getMovementRange(
  piece: Piece,
  isDribbling: boolean,
  zone: Zone,
  lane: Lane,
): number {
  let range = isDribbling ? 3 : 4;
  if (piece.cost === 3) range += 1;
  if (hasZoneBonus(piece.position, zone, lane)) range += 1;
  return range;
}

// ============================================================
// フェーズ1: コマ移動処理
// ============================================================

export interface MovementResult {
  pieces: Piece[];
  events: GameEvent[];
  /** フリーボール位置（ルーズボール争奪の結果） */
  freeBallHex: HexCoord | null;
}

export function processMovement(
  piecesIn: Piece[],
  orders: Order[],
  context: BoardContext,
): MovementResult {
  const events: GameEvent[] = [];

  // ── コマのディープコピー（フェーズ内で状態を変更するため）
  const pieces: Piece[] = piecesIn.map(p => ({ ...p, coord: { ...p.coord } }));
  const pieceById = new Map(pieces.map(p => [p.id, p]));
  const orderMap  = new Map(orders.map(o => [o.pieceId, o]));

  // ── 移動前の ZOC マップ（同時移動のため開始位置で固定）
  const homeZoc = buildZocMap(pieces, 'home');
  const awayZoc = buildZocMap(pieces, 'away');
  const enemyZocOf = (team: Team) => team === 'home' ? awayZoc : homeZoc;

  // ── ステップ1・2: 各コマの到達先を決定（ZOC 停止適用）
  // pieceId → { finalCoord, isDribbling, zocStoppedBy }
  type MoveIntent = {
    finalCoord: HexCoord;
    isDribbling: boolean;
    zocStoppedBy: string | null; // ZOC 停止させた敵コマID
    startCoord: HexCoord;
  };
  const intents = new Map<string, MoveIntent>();

  for (const piece of pieces) {
    const order = orderMap.get(piece.id);
    const startCoord = { ...piece.coord };

    if (!order || !order.target || (order.type !== 'move' && order.type !== 'dribble')) {
      intents.set(piece.id, { finalCoord: startCoord, isDribbling: false, zocStoppedBy: null, startCoord });
      continue;
    }

    const dribbling = order.type === 'dribble';
    const { zone, lane } = {
      zone: context.getZone(piece.coord),
      lane: context.getLane(piece.coord),
    };
    const range  = getMovementRange(piece, dribbling, zone, lane);
    const path   = hexLinePath(piece.coord, order.target, range).filter(h => context.isValidHex(h));

    const eZoc = enemyZocOf(piece.team);
    let finalCoord   = startCoord;
    let zocStoppedBy: string | null = null;

    for (const hex of path) {
      const k = hexKey(hex);
      if (eZoc.has(k)) {
        finalCoord   = hex;
        zocStoppedBy = eZoc.get(k)!;
        break;
      }
      finalCoord = hex;
    }

    intents.set(piece.id, { finalCoord, isDribbling: dribbling, zocStoppedBy, startCoord });
  }

  // ── ステップ3: 同一 HEX 競合の検出
  // hexKey → [pieceId, ...]
  const hexToPieces = new Map<string, string[]>();
  for (const [pieceId, intent] of intents) {
    const k = hexKey(intent.finalCoord);
    const list = hexToPieces.get(k);
    if (list) list.push(pieceId);
    else hexToPieces.set(k, [pieceId]);
  }

  // 競合解決済みコマ（タックル/競合でリセットされたもの）
  const resetToStart = new Set<string>();

  for (const [, pieceIds] of hexToPieces) {
    if (pieceIds.length < 2) continue;

    const piecesHere = pieceIds.map(id => pieceById.get(id)!);
    const homePieces = piecesHere.filter(p => p.team === 'home');
    const awayPieces = piecesHere.filter(p => p.team === 'away');
    if (homePieces.length === 0 || awayPieces.length === 0) continue; // 同チーム競合は無視

    const pieceA = homePieces[0];
    const pieceB = awayPieces[0];
    const coord  = intents.get(pieceA.id)!.finalCoord;

    if (pieceA.hasBall || pieceB.hasBall) {
      // ボール保持コマが関与 → タックル（§7-6 切り替え）
      const dribbler = pieceA.hasBall ? pieceA : pieceB;
      const tackler  = pieceA.hasBall ? pieceB : pieceA;
      const adj = getZocAdjacency(coord, dribbler.team, pieces);
      const tackleResult = resolveTackle({ tackler, dribbler, zoc: adj });

      events.push({ type: 'TACKLE', phase: 1, coord, result: tackleResult } as TackleEvent);

      if (tackleResult.success) {
        dribbler.hasBall = false;
        tackler.hasBall  = true;
        events.push({ type: 'BALL_ACQUIRED', phase: 1, pieceId: tackler.id } as BallAcquiredEvent);

        // ファウル判定（ドリブラーの攻撃方向でゾーンを判定）
        const foulResult = resolveFoul({ zone: context.getZone(coord), col: coord.col, attackingTeam: dribbler.team });
        if (foulResult.occurred) {
          tackler.hasBall  = false;
          dribbler.hasBall = true;
          events.push({ type: 'FOUL', phase: 1, coord, tacklerId: tackler.id, result: foulResult } as FoulEvent);
        }

        // ドリブラーを開始地点に戻す
        resetToStart.add(dribbler.id);
      } else {
        // タックル失敗 → タックラーを開始地点に戻す
        resetToStart.add(tackler.id);
      }
    } else {
      // 通常の競合判定
      const adj = getZocAdjacency(coord, pieceA.team, pieces);
      const collResult = resolveCollision({ pieceA, pieceB, zoc: adj });
      events.push({ type: 'COLLISION', phase: 1, coord, result: collResult } as CollisionEvent);
      resetToStart.add(collResult.loser.id);
    }
  }

  // ── ステップ4: ドリブルコマの ZOC 停止 → タックル
  for (const [pieceId, intent] of intents) {
    if (!intent.isDribbling || !intent.zocStoppedBy) continue;
    if (resetToStart.has(pieceId)) continue; // 競合で既に処理済み

    const dribbler = pieceById.get(pieceId)!;
    const tackler  = pieceById.get(intent.zocStoppedBy);
    if (!tackler) continue;

    const coord = intent.finalCoord;
    const adj   = getZocAdjacency(coord, dribbler.team, pieces);
    const tackleResult = resolveTackle({ tackler, dribbler, zoc: adj });

    events.push({ type: 'TACKLE', phase: 1, coord, result: tackleResult } as TackleEvent);

    if (tackleResult.success) {
      dribbler.hasBall = false;
      tackler.hasBall  = true;
      events.push({ type: 'BALL_ACQUIRED', phase: 1, pieceId: tackler.id } as BallAcquiredEvent);

      // ステップ5: ファウル判定（§7-5）
      const zone = context.getZone(coord);
      const foulResult = resolveFoul({ zone, col: coord.col, attackingTeam: dribbler.team });
      if (foulResult.occurred) {
        tackler.hasBall  = false;
        dribbler.hasBall = true;
        events.push({ type: 'FOUL', phase: 1, coord, tacklerId: tackler.id, result: foulResult } as FoulEvent);
      }
    }
  }

  // ── 最終位置の適用と PIECE_MOVED イベントの発行
  for (const [pieceId, intent] of intents) {
    const piece = pieceById.get(pieceId)!;
    const dest  = resetToStart.has(pieceId) ? intent.startCoord : intent.finalCoord;

    if (dest.col !== intent.startCoord.col || dest.row !== intent.startCoord.row) {
      events.push({
        type: 'PIECE_MOVED',
        phase: 1,
        pieceId,
        from: intent.startCoord,
        to: dest,
      } as PieceMovedEvent);
    }

    if (intent.zocStoppedBy && !resetToStart.has(pieceId)) {
      events.push({
        type: 'ZOC_STOP',
        phase: 1,
        pieceId,
        coord: dest,
        zocOwnerId: intent.zocStoppedBy,
      } as ZocStopEvent);
    }

    piece.coord = dest;
  }

  return { pieces, events, freeBallHex: null };
}
