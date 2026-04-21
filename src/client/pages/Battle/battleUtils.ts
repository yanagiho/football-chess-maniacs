// ============================================================
// battleUtils.ts — Battle画面の純粋関数・定数・型変換
// ============================================================

import type {
  GameEvent, HexCoord, PieceData, Cost, Position, Team,
  FormationData, FormationPiece, MatchStats, MvpInfo,
} from '../../types';
import { MAX_ROW } from '../../types';
import type {
  Piece as EnginePiece, Board as EngineBoard, Order as EngineOrder,
  BoardContext,
} from '../../../engine/types';
import {
  getMovementRange, getNeighbors, hexKey,
} from '../../../engine/movement';

// ============================================================
// ゲームメカニクス定数
// ============================================================

/** 基本移動力 (§8-1) */
export const DEFAULT_MOVE_RANGE = 4;

/** 正確パス距離の基本値 (§7-3) */
export const BASE_ACCURATE_PASS_RANGE = 6;
/** パス距離ボーナス: コスト3 → +1 */
export const PASS_RANGE_COST3_BONUS = 1;
/** パス距離ボーナス: OMポジション → +1 */
export const PASS_RANGE_OM_BONUS = 1;

/** シュートゾーン閾値 (§7-2: homeは row>=22, awayは row<=11) */
export const SHOOT_ZONE_HOME_MIN_ROW = 22;
export const SHOOT_ZONE_AWAY_MAX_ROW = 11;
/** シュート距離補正: DF/VO/SB は -1, WG/OM/FW は +1 */
export const SHOOT_RANGE_PENALTY_POSITIONS: Position[] = ['DF', 'VO', 'SB'];
export const SHOOT_RANGE_BONUS_POSITIONS: Position[] = ['WG', 'OM', 'FW'];

/** ゴール周辺のHEX範囲 (ゴールポスト: col 7〜14, ゴールラインからの行数: ±2) */
export const GOAL_COL_MIN = 7;
export const GOAL_COL_MAX = 14;
export const GOAL_ROW_RANGE = 2;

/** 交代ルール (§9-4) */
export const MAX_SUBSTITUTIONS = 3;
/** フィールドコスト上限 (§6-2) */
export const MAX_FIELD_COST = 16;

/** 試合時間表示 (§9-2) */
export const MINUTES_PER_TURN = 3;
export const HALFTIME_MINUTE = 45;
export const FULLTIME_MINUTE = 90;

/** 前半/後半の基本ターン数 */
export const HALF_TURNS = 15;

/** ハーフライン（row 16 が中央、キックオフ時は各チーム自陣のみ） */
export const HALF_LINE_ROW = 16;

// ============================================================
// タイミング定数 (ms)
// ============================================================

export const KICKOFF_CEREMONY_MS = 2500;
export const HALFTIME_CEREMONY_MS = 3000;
export const SECOND_HALF_DELAY_MS = 4500;
export const FULLTIME_RESULT_BTN_DELAY_MS = 3000;
export const TURN_FLASH_MS = 1200;
export const GOAL_CEREMONY_MS = 2000;
export const RECONNECT_BANNER_MS = 3000;
export const SAFETY_TIMEOUT_MS = 8000;
export const MINIGAME_COUNTDOWN_INTERVAL_MS = 1000;
export const MINIGAME_FK_PK_COUNTDOWN = 5;
export const MINIGAME_CK_COUNTDOWN = 10;

/** フェーズ演出タイミング (ms) */
export const PHASE_TIMINGS = [800, 500, 500, 500, 500]; // Phase0-4
export const TOTAL_ANIMATION_MS = PHASE_TIMINGS.reduce((a, b) => a + b, 0); // 2800

/** リプレイアニメーション時間（ms）。§5-1: 約2.5秒 */
export const REPLAY_DURATION = 2500;

// ============================================================
// デフォルトテンプレート
// ============================================================

/** デフォルト4-4-2テンプレート（自陣側: row 0〜16 に収まる） */
export const DEFAULT_TEMPLATE: Array<{ pos: Position; cost: Cost; col: number; row: number }> = [
  { pos: 'GK', cost: 1,   col: 10, row: 1 },
  { pos: 'DF', cost: 1,   col: 7,  row: 5 },
  { pos: 'DF', cost: 1.5, col: 13, row: 5 },
  { pos: 'SB', cost: 1,   col: 4,  row: 6 },
  { pos: 'SB', cost: 1,   col: 16, row: 6 },
  { pos: 'VO', cost: 1,   col: 10, row: 9 },
  { pos: 'MF', cost: 1,   col: 7,  row: 12 },
  { pos: 'MF', cost: 1,   col: 13, row: 12 },
  { pos: 'OM', cost: 2,   col: 10, row: 14 },
  { pos: 'WG', cost: 1.5, col: 4,  row: 13 },
  { pos: 'FW', cost: 2.5, col: 10, row: 16 },
];

// ============================================================
// ミニゲーム状態型
// ============================================================

/** ミニゲーム状態型 */
export type MiniGameState =
  | null
  | { type: 'fk'; coord: HexCoord; kickerPiece: PieceData; gkPiece: PieceData; isAttacker: boolean; fouledTeam: Team }
  | { type: 'ck'; isAttacker: boolean; pieces: PieceData[]; attackTeam: Team }
  | { type: 'pk'; coord: HexCoord; kickerPiece: PieceData; gkPiece: PieceData; isKicker: boolean; fouledTeam: Team };

/** 演出フェーズ型 */
export type CeremonyPhase = 'kickoff' | 'kickoff2nd' | 'halftime' | 'halftime_sub' | 'secondhalf' | 'fulltime' | 'turn' | 'goal' | null;

// ============================================================
// 純粋関数
// ============================================================

/** フォーメーション座標を自陣にクランプ（キックオフルール準拠） */
export function clampToOwnHalf(row: number, team: Team): number {
  if (team === 'home') return Math.min(row, HALF_LINE_ROW);
  return Math.max(row, HALF_LINE_ROW + 1);
}

/** FormationPiece配列 → PieceData配列に変換 */
export function formationToPieces(starters: FormationPiece[], bench: FormationPiece[], team: Team): PieceData[] {
  const prefix = team === 'home' ? 'h' : 'a';
  const pieces: PieceData[] = [];
  starters.forEach((s, i) => {
    pieces.push({
      id: `${prefix}${String(i + 1).padStart(2, '0')}`,
      team,
      position: s.position,
      cost: s.cost,
      coord: { col: s.col, row: clampToOwnHalf(s.row, team) },
      hasBall: false,
      moveRange: DEFAULT_MOVE_RANGE,
      isBench: false,
    });
  });
  bench.forEach((b, i) => {
    pieces.push({
      id: `${prefix}b${String(i + 1).padStart(2, '0')}`,
      team,
      position: b.position,
      cost: b.cost,
      coord: { col: b.col, row: b.row },
      hasBall: false,
      moveRange: DEFAULT_MOVE_RANGE,
      isBench: true,
    });
  });
  return pieces;
}

/** COM/awayチーム用のデフォルトコマ生成（row を反転して相手陣に配置） */
export function createDefaultAwayPieces(): PieceData[] {
  return DEFAULT_TEMPLATE.map((t, i) => ({
    id: `a${String(i + 1).padStart(2, '0')}`,
    team: 'away' as Team,
    position: t.pos,
    cost: t.cost,
    coord: { col: t.col, row: MAX_ROW - t.row },
    hasBall: false,
    moveRange: DEFAULT_MOVE_RANGE,
    isBench: false,
  }));
}

/** homeチーム用のデフォルトコマ生成（フォーメーション未設定時のフォールバック） */
export function createDefaultHomePieces(): PieceData[] {
  return DEFAULT_TEMPLATE.map((t, i) => ({
    id: `h${String(i + 1).padStart(2, '0')}`,
    team: 'home' as Team,
    position: t.pos,
    cost: t.cost,
    coord: { col: t.col, row: t.row },
    hasBall: false,
    moveRange: DEFAULT_MOVE_RANGE,
    isBench: false,
  }));
}

/** 初期コマ配置生成（Formation データ優先、なければデフォルト） */
export function createInitialPieces(formationData?: FormationData | null, kickoffTeam: Team = 'home'): PieceData[] {
  const homePieces = formationData
    ? formationToPieces(formationData.starters, formationData.bench, 'home')
    : createDefaultHomePieces();
  const awayPieces = createDefaultAwayPieces();
  const pieces = [...homePieces, ...awayPieces];
  const fw = pieces.find((p) => p.team === kickoffTeam && p.position === 'FW' && !p.isBench);
  if (fw) fw.hasBall = true;
  return pieces;
}

/** PieceData → engine Piece 変換 */
export function toEnginePiece(p: PieceData): EnginePiece {
  return { id: p.id, team: p.team, position: p.position, cost: p.cost, coord: p.coord, hasBall: p.hasBall };
}

/** クライアント OrderData → エンジン Order に変換 */
export function clientOrderToEngine(order: import('../../types').OrderData, pieces: PieceData[]): EngineOrder {
  if (order.action === 'pass' && order.targetPieceId) {
    const receiver = pieces.find(p => p.id === order.targetPieceId);
    return {
      pieceId: order.pieceId,
      type: 'pass',
      target: receiver?.coord,
      targetPieceId: order.targetPieceId,
    };
  }
  if (order.action === 'throughPass') {
    return {
      pieceId: order.pieceId,
      type: 'throughPass',
      target: order.targetHex,
    };
  }
  return {
    pieceId: order.pieceId,
    type: (order.action ?? 'stay') as EngineOrder['type'],
    target: order.targetHex,
  };
}

/** エンジン Piece[] → PieceData[] に変換（moveRange/isBench を既存データから引き継ぎ） */
export function enginePiecesToClient(enginePieces: EnginePiece[], existing: PieceData[]): PieceData[] {
  const existMap = new Map(existing.map(p => [p.id, p]));
  return enginePieces.map(ep => ({
    id: ep.id,
    team: ep.team,
    position: ep.position,
    cost: ep.cost,
    coord: ep.coord,
    hasBall: ep.hasBall,
    moveRange: existMap.get(ep.id)?.moveRange ?? DEFAULT_MOVE_RANGE,
    isBench: existMap.get(ep.id)?.isBench ?? false,
  }));
}

/**
 * ゴールリスタート用コマ配置（失点チームがキックオフ）
 * 交代済みコマを保持したまま、初期配置座標にリセットする。
 */
export function createGoalRestartPieces(
  fd: FormationData | null | undefined,
  kickoffTeam: Team,
  currentPieces?: PieceData[],
): PieceData[] {
  if (!currentPieces || currentPieces.length === 0) {
    return createInitialPieces(fd, kickoffTeam);
  }
  const templatePieces = createInitialPieces(fd, kickoffTeam);
  const templateById = new Map(templatePieces.map(p => [p.id, p]));
  const resetPieces = currentPieces.map(cp => {
    const template = templateById.get(cp.id);
    if (template) {
      return { ...cp, coord: template.coord, hasBall: template.hasBall };
    }
    const posTemplate = templatePieces.find(tp =>
      tp.team === cp.team && tp.position === cp.position && !templateById.has(cp.id),
    );
    if (posTemplate) {
      return { ...cp, coord: posTemplate.coord, hasBall: false };
    }
    return { ...cp, hasBall: false };
  });
  const fw = resetPieces.find(p => p.team === kickoffTeam && p.position === 'FW' && !p.isBench);
  if (fw) {
    for (const p of resetPieces) p.hasBall = false;
    fw.hasBall = true;
  }
  return resetPieces;
}

/** 正確パス距離（§7-3: 基本6HEX, コスト3+1, OM+1） */
export function getAccuratePassRange(piece: PieceData): number {
  let range = BASE_ACCURATE_PASS_RANGE;
  if (piece.cost === 3) range += PASS_RANGE_COST3_BONUS;
  if (piece.position === 'OM') range += PASS_RANGE_OM_BONUS;
  return range;
}

/** シュート可能判定（ポジション別距離補正: DF/VO/SB -1, WG/OM/FW +1） */
export function isShootZoneForPiece(coord: HexCoord, myTeam: Team, position: Position): boolean {
  let modifier = 0;
  if (SHOOT_RANGE_PENALTY_POSITIONS.includes(position)) modifier = -1;
  if (SHOOT_RANGE_BONUS_POSITIONS.includes(position)) modifier = 1;
  if (myTeam === 'home') return coord.row >= (SHOOT_ZONE_HOME_MIN_ROW - modifier);
  return coord.row <= (SHOOT_ZONE_AWAY_MAX_ROW + modifier);
}

/** BFS で移動可能HEXを列挙 */
export function computeReachableHexes(
  piece: EnginePiece,
  isDribbling: boolean,
  boardContext: BoardContext,
): HexCoord[] {
  const zone = boardContext.getZone(piece.coord);
  const lane = boardContext.getLane(piece.coord);
  const range = getMovementRange(piece, isDribbling, zone, lane);
  const reachable: HexCoord[] = [];
  const visited = new Set<string>();
  const queue: Array<{ coord: HexCoord; dist: number }> = [{ coord: piece.coord, dist: 0 }];
  visited.add(hexKey(piece.coord));
  while (queue.length > 0) {
    const { coord, dist } = queue.shift()!;
    if (dist > 0) reachable.push(coord);
    if (dist >= range) continue;
    for (const nb of getNeighbors(coord)) {
      const k = hexKey(nb);
      if (visited.has(k) || !boardContext.isValidHex(nb)) continue;
      visited.add(k);
      queue.push({ coord: nb, dist: dist + 1 });
    }
  }
  return reachable;
}

/**
 * サッカー風試合時間ラベルを生成。
 * 前半15ターン = 0:00〜42:00 (3分刻み), AT = 45+1, 45+2 …
 * 後半15ターン = 45:00〜87:00, AT = 90+1, 90+2 …
 */
export function getMatchTimeLabel(turn: number, at1: number, at2: number): { label: string; isAT: boolean } {
  const halfEnd = HALF_TURNS + at1;
  if (turn <= HALF_TURNS) {
    const min = (turn - 1) * MINUTES_PER_TURN;
    return { label: `${min}:00`, isAT: false };
  }
  if (turn <= halfEnd) {
    return { label: `${HALFTIME_MINUTE}+${turn - HALF_TURNS}`, isAT: true };
  }
  const secondHalfTurn = turn - at1;
  if (secondHalfTurn <= HALF_TURNS * 2) {
    const min = HALFTIME_MINUTE + (secondHalfTurn - HALF_TURNS - 1) * MINUTES_PER_TURN;
    return { label: `${min}:00`, isAT: false };
  }
  return { label: `${FULLTIME_MINUTE}+${secondHalfTurn - HALF_TURNS * 2}`, isAT: true };
}

/** イベントログからスタッツを集計 */
export function computeStats(allEvents: GameEvent[], totalTurns: number): MatchStats {
  const stats: MatchStats = {
    possession: { home: 50, away: 50 },
    shots: { home: 0, away: 0 },
    shotsOnTarget: { home: 0, away: 0 },
    passesAttempted: { home: 0, away: 0 },
    passesCompleted: { home: 0, away: 0 },
    tackles: { home: 0, away: 0 },
    fouls: { home: 0, away: 0 },
    offsides: { home: 0, away: 0 },
    cornerKicks: { home: 0, away: 0 },
  };

  let homePossessionTurns = 0;
  let awayPossessionTurns = 0;

  for (const ev of allEvents) {
    const e = ev as Record<string, unknown>;
    const pieceId = (e.pieceId ?? e.shooterId ?? e.passerId ?? '') as string;
    const team = pieceId.startsWith('h') ? 'home' : 'away';

    switch (ev.type) {
      case 'SHOOT': {
        stats.shots[team]++;
        const outcome = (e.result as Record<string, unknown>)?.outcome;
        if (outcome === 'goal' || outcome === 'saved_catch' || outcome === 'saved_ck') {
          stats.shotsOnTarget[team]++;
        }
        if (outcome === 'saved_ck') stats.cornerKicks[team]++;
        break;
      }
      case 'PASS_DELIVERED':
        stats.passesAttempted[pieceId.startsWith('h') ? 'home' : 'away']++;
        stats.passesCompleted[pieceId.startsWith('h') ? 'home' : 'away']++;
        break;
      case 'PASS_CUT': {
        const pTeam = pieceId.startsWith('h') ? 'home' : 'away';
        stats.passesAttempted[pTeam]++;
        break;
      }
      case 'TACKLE': {
        const tackler = ((e.result as Record<string, unknown>)?.tackler as Record<string, unknown>);
        const tTeam = (tackler?.team as string) === 'home' ? 'home' : 'away';
        if ((e.result as Record<string, unknown>)?.success) stats.tackles[tTeam]++;
        break;
      }
      case 'FOUL': {
        const fTeam = (e.tacklerId as string)?.startsWith('h') ? 'home' : 'away';
        stats.fouls[fTeam]++;
        break;
      }
      case 'OFFSIDE': {
        const rTeam = (e.receiverId as string)?.startsWith('h') ? 'home' : 'away';
        stats.offsides[rTeam]++;
        break;
      }
      case 'BALL_ACQUIRED':
        if (team === 'home') homePossessionTurns++;
        else awayPossessionTurns++;
        break;
    }
  }

  const totalPoss = homePossessionTurns + awayPossessionTurns;
  if (totalPoss > 0) {
    stats.possession.home = Math.round((homePossessionTurns / totalPoss) * 100);
    stats.possession.away = 100 - stats.possession.home;
  }
  return stats;
}

/** イベントログからMVPを選出 */
export function computeMvp(allEvents: GameEvent[]): MvpInfo | null {
  const scores = new Map<string, { goals: number; assists: number; tackles: number; team: string; position: string; cost: number }>();

  for (const ev of allEvents) {
    const e = ev as Record<string, unknown>;
    if (ev.type === 'SHOOT') {
      const outcome = (e.result as Record<string, unknown>)?.outcome;
      if (outcome === 'goal') {
        const id = e.shooterId as string;
        const s = scores.get(id) ?? { goals: 0, assists: 0, tackles: 0, team: id.startsWith('h') ? 'home' : 'away', position: '', cost: 1 };
        s.goals++;
        scores.set(id, s);
      }
    }
    if (ev.type === 'PASS_DELIVERED') {
      const id = e.passerId as string;
      const s = scores.get(id) ?? { goals: 0, assists: 0, tackles: 0, team: id.startsWith('h') ? 'home' : 'away', position: '', cost: 1 };
      s.assists++;
      scores.set(id, s);
    }
    if (ev.type === 'TACKLE') {
      const result = e.result as Record<string, unknown>;
      if (result?.success) {
        const tackler = result.tackler as Record<string, unknown>;
        const id = tackler?.id as string;
        if (id) {
          const s = scores.get(id) ?? { goals: 0, assists: 0, tackles: 0, team: id.startsWith('h') ? 'home' : 'away', position: '', cost: 1 };
          s.tackles++;
          scores.set(id, s);
        }
      }
    }
  }

  if (scores.size === 0) return null;

  let best: [string, { goals: number; assists: number; tackles: number; team: string; position: string; cost: number }] | null = null;
  for (const [id, s] of scores) {
    if (!best || s.goals > best[1].goals || (s.goals === best[1].goals && s.assists > best[1].assists) || (s.goals === best[1].goals && s.assists === best[1].assists && s.tackles > best[1].tackles)) {
      best = [id, s];
    }
  }

  if (!best) return null;
  const [id, s] = best;
  return {
    pieceId: id,
    position: (s.position || 'FW') as Position,
    cost: (s.cost || 1) as Cost,
    team: s.team as Team,
    goals: s.goals,
    assists: s.assists,
    tackles: s.tackles,
  };
}
