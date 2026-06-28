// ============================================================
// turn_processor.ts — フェーズ0〜3 のターン処理オーケストレーター
//
// §9-2 全フェーズを順番に実行し TurnResult を返す。
//
// 入力:
//   board        — 現在のボード状態
//   homeOrders   — home チームの指示配列
//   awayOrders   — away チームの指示配列
//   context      — HEX情報プロバイダ（zone/lane/isValid）
//
// 出力:
//   TurnResult { board, events }
//
// フェーズ概要:
//   Phase 0: スナップショット（移動前位置を記録）
//   Phase 1: コマ移動（ZOC停止→競合→タックル→ファウル）
//   Phase 2: ボール処理（シュート→パス配送→パスカット）
//   Phase 3: 特殊判定（オフサイド）
// ============================================================

import { processBall } from './ball';
import { processMovement, hexDistance } from './movement';
import { getOffsideLine, resolveOffside } from './offside';
import { processSpecial } from './special';
import type {
  BallAcquiredEvent,
  BattleDelayEvent,
  Board,
  BoardContext,
  FreeBallSource,
  GameEvent,
  HexCoord,
  LooseBallEvent,
  OffsideEvent,
  Order,
  PassiveTacticsEvent,
  Piece,
  PossessionDelayState,
  Team,
  TurnResult,
} from './types';

const PASSIVE_TACTICS_THRESHOLD = 9;
const BATTLE_DELAY_THRESHOLD = 3;

// ============================================================
// ターン処理メイン
// ============================================================

/**
 * 1ターン分の処理を実行する。
 *
 * @param board       現在のボード状態
 * @param homeOrders  home チームの指示（最大11枚分）
 * @param awayOrders  away チームの指示（最大11枚分）
 * @param context     HEX情報プロバイダ
 * @returns           フェーズ3完了後のボード + 全イベントリスト
 */
export function processTurn(
  board: Board,
  homeOrders: Order[],
  awayOrders: Order[],
  context: BoardContext,
): TurnResult {
  const allEvents: GameEvent[] = [];

  // ──────────────────────────────────────────────────────────
  // フェーズ0: スナップショット
  // ターン開始時の全コマ位置を記録（オフサイド判定用）
  // ──────────────────────────────────────────────────────────
  const snapshot: Piece[] = board.pieces.map(p => ({
    ...p,
    coord: { ...p.coord },
  }));
  const turnStartHolderTeam = board.pieces.find(p => p.hasBall)?.team ?? null;

  // 両チームの指示を結合
  const allOrders: Order[] = [...homeOrders, ...awayOrders];

  // ──────────────────────────────────────────────────────────
  // フェーズ1: コマ移動
  // ──────────────────────────────────────────────────────────
  const passivePenaltyTeams = board.passiveTacticsTeams ?? [];
  const phase1 = processMovement(board.pieces, allOrders, context, { passivePenaltyTeams });
  allEvents.push(...phase1.events);

  // ──────────────────────────────────────────────────────────
  // フェーズ1.5: フリーボール争奪（ルーズボール）
  // ──────────────────────────────────────────────────────────
  let freeBallHex: HexCoord | null = board.freeBallHex ?? null;
  let freeBallLastTouchedTeam: Team | null = board.freeBallLastTouchedTeam ?? null;
  let freeBallLastTouchedPieceId: string | null = board.freeBallLastTouchedPieceId ?? null;
  let freeBallSource: FreeBallSource | null = board.freeBallSource ?? null;
  if (freeBallHex) {
    const contestResult = resolveLooseBall(phase1.pieces, freeBallHex, {
      snapshot,
      lastTouchedTeam: freeBallLastTouchedTeam,
      lastTouchedPieceId: freeBallLastTouchedPieceId,
      source: freeBallSource,
    });
    allEvents.push(...contestResult.events);
    if (contestResult.acquiredBy) {
      freeBallHex = null; // 誰かが拾った
      freeBallLastTouchedTeam = null;
      freeBallLastTouchedPieceId = null;
      freeBallSource = null;
    } else {
      freeBallHex = contestResult.newFreeBallHex; // まだフリー
    }
  }

  // ──────────────────────────────────────────────────────────
  // フェーズ2: ボール処理
  // フェーズ1 完了後の盤面を使用
  // ──────────────────────────────────────────────────────────
  const phase2 = processBall(phase1.pieces, allOrders, context, { passivePenaltyTeams });
  allEvents.push(...phase2.events);

  // ──────────────────────────────────────────────────────────
  // フェーズ3: 特殊判定（オフサイド）
  // フェーズ0 スナップショットを基準に判定
  // ──────────────────────────────────────────────────────────
  const phase3 = processSpecial(phase2.pieces, snapshot, phase2.deliveredPass);
  allEvents.push(...phase3.events);

  // ──────────────────────────────────────────────────────────
  // フェーズ2後: スルーパスでフリーボールが発生したかチェック
  // ──────────────────────────────────────────────────────────
  if (phase2.freeBallHex) {
    freeBallHex = phase2.freeBallHex;
    freeBallLastTouchedTeam = phase2.freeBallLastTouchedTeam;
    freeBallLastTouchedPieceId = phase2.freeBallLastTouchedPieceId;
    freeBallSource = phase2.freeBallSource;
  }

  // ──────────────────────────────────────────────────────────
  // ボール整合性チェック＋自動修正（validateBallState）
  // ──────────────────────────────────────────────────────────
  const finalPieces = phase3.pieces;
  validateBallState(finalPieces, freeBallHex, snapshot);
  // validateBallState が freeBallHex を変更することはないが、
  // 保持者がいたらフリーボールをクリア
  const postHolders = finalPieces.filter(p => p.hasBall);
  if (postHolders.length > 0) {
    freeBallHex = null;
    freeBallLastTouchedTeam = null;
    freeBallLastTouchedPieceId = null;
    freeBallSource = null;
  }

  // ──────────────────────────────────────────────────────────
  // フェーズ3b: 遅延行為 / 消極的戦術
  // ──────────────────────────────────────────────────────────
  const delayResult = applyBattleDelay(finalPieces, board.possessionDelay ?? null, turnStartHolderTeam);
  allEvents.push(...delayResult.events);

  const passiveResult = detectPassiveTactics(finalPieces, freeBallHex, context);
  allEvents.push(...passiveResult.events);

  // ──────────────────────────────────────────────────────────
  // 次のターン用ボードを構築
  // ──────────────────────────────────────────────────────────
  const newBoard: Board = {
    pieces: finalPieces,
    snapshot,
    freeBallHex,
    freeBallLastTouchedTeam,
    freeBallLastTouchedPieceId,
    freeBallSource,
    possessionDelay: delayResult.possessionDelay,
    passiveTacticsTeams: passiveResult.passiveTacticsTeams,
  };

  return { board: newBoard, events: allEvents };
}

// ============================================================
// ボール整合性検証＋自動修正
// ============================================================

function validateBallState(
  pieces: Piece[],
  freeBallHex: HexCoord | null,
  snapshot: Piece[],
): void {
  const holders = pieces.filter(p => p.hasBall);

  // 1. 複数保持者 → 最初の1人だけ残す
  if (holders.length > 1) {
    console.error('[validateBallState] Multiple holders:', holders.map(p => p.id));
    for (let i = 1; i < holders.length; i++) holders[i].hasBall = false;
  }

  // 2. 保持者0人 + フリーボールなし → 復帰
  if (holders.length === 0 && !freeBallHex) {
    console.error('[validateBallState] Ball disappeared, restoring');
    // スナップショットの保持者から復帰
    const origHolder = snapshot.find(p => p.hasBall);
    const restoreId = origHolder?.id;
    const target = restoreId ? pieces.find(p => p.id === restoreId) : null;
    if (target) {
      target.hasBall = true;
    } else {
      // GK → 任意のFP
      const gk = pieces.find(p => p.position === 'GK');
      const fb = gk ?? pieces[0];
      if (fb) fb.hasBall = true;
    }
  }
}

// ============================================================
// フリーボール争奪（ルーズボール）
// ============================================================

interface LooseBallResult {
  events: GameEvent[];
  acquiredBy: string | null;
  newFreeBallHex: HexCoord | null;
}

interface LooseBallMeta {
  snapshot: Piece[];
  lastTouchedTeam: Team | null;
  lastTouchedPieceId: string | null;
  source: FreeBallSource | null;
}

function resolveLooseBall(pieces: Piece[], freeBallHex: HexCoord, meta: LooseBallMeta): LooseBallResult {
  const events: GameEvent[] = [];
  const fbKey = `${freeBallHex.col},${freeBallHex.row}`;

  // freeBallHexにいるコマを検出
  const onHex = pieces.filter(p => `${p.coord.col},${p.coord.row}` === fbKey);

  if (onHex.length === 0) {
    // 隣接HEX（HEX距離1）にいるコマを検出
    const adjacent = pieces.filter(p => {
      return hexDistance(p.coord, freeBallHex) === 1;
    });
    if (adjacent.length === 0) {
      // 誰も近くにいない → フリーボール継続
      events.push({ type: 'LOOSE_BALL', phase: 1, coord: freeBallHex, acquiredBy: null } as LooseBallEvent);
      return { events, acquiredBy: null, newFreeBallHex: freeBallHex };
    }
    // 隣接コマの中でコスト最高が拾う
    const winner = pickByHighestCost(adjacent);
    winner.hasBall = true;
    events.push({ type: 'LOOSE_BALL', phase: 1, coord: freeBallHex, acquiredBy: winner.id } as LooseBallEvent);
    events.push({ type: 'BALL_ACQUIRED', phase: 1, pieceId: winner.id } as BallAcquiredEvent);
    const offsideAward = applyFreeBallOffsideIfNeeded(pieces, winner, meta, events);
    if (offsideAward) return { events, acquiredBy: offsideAward, newFreeBallHex: null };
    return { events, acquiredBy: winner.id, newFreeBallHex: null };
  }

  if (onHex.length === 1) {
    // 1チームの1コマだけ → 自動取得
    onHex[0].hasBall = true;
    events.push({ type: 'LOOSE_BALL', phase: 1, coord: freeBallHex, acquiredBy: onHex[0].id } as LooseBallEvent);
    events.push({ type: 'BALL_ACQUIRED', phase: 1, pieceId: onHex[0].id } as BallAcquiredEvent);
    const offsideAward = applyFreeBallOffsideIfNeeded(pieces, onHex[0], meta, events);
    if (offsideAward) return { events, acquiredBy: offsideAward, newFreeBallHex: null };
    return { events, acquiredBy: onHex[0].id, newFreeBallHex: null };
  }

  // 複数コマが同一HEXにいる場合 — コスト最高で比較
  const winner = pickByHighestCost(onHex);
  winner.hasBall = true;
  events.push({ type: 'LOOSE_BALL', phase: 1, coord: freeBallHex, acquiredBy: winner.id } as LooseBallEvent);
  events.push({ type: 'BALL_ACQUIRED', phase: 1, pieceId: winner.id } as BallAcquiredEvent);
  const offsideAward = applyFreeBallOffsideIfNeeded(pieces, winner, meta, events);
  if (offsideAward) return { events, acquiredBy: offsideAward, newFreeBallHex: null };
  return { events, acquiredBy: winner.id, newFreeBallHex: null };
}

/** コスト最高のコマを選出（同コストなら乱数） */
function pickByHighestCost(candidates: Piece[]): Piece {
  if (candidates.length === 0) {
    throw new Error('[pickByHighestCost] candidates array is empty');
  }
  const maxCost = Math.max(...candidates.map(p => p.cost));
  const topCandidates = candidates.filter(p => p.cost === maxCost);
  return topCandidates[Math.floor(Math.random() * topCandidates.length)];
}

function applyFreeBallOffsideIfNeeded(
  pieces: Piece[],
  winner: Piece,
  meta: LooseBallMeta,
  events: GameEvent[],
): string | null {
  if (meta.source !== 'throughPass') return null;
  if (!meta.lastTouchedTeam || !meta.lastTouchedPieceId) return null;
  if (winner.team !== meta.lastTouchedTeam) return null;

  const receiverSnapshot = meta.snapshot.find(p => p.id === winner.id);
  if (!receiverSnapshot) return null;

  const defenseTeam: Team = meta.lastTouchedTeam === 'home' ? 'away' : 'home';
  const defenderSnaps = meta.snapshot.filter(p => p.team === defenseTeam);
  const passerSnapshot = meta.snapshot.find(p => p.id === meta.lastTouchedPieceId);
  const defenderGoalIsLowRow = defenseTeam === 'home';
  const attackIsHighRow = meta.lastTouchedTeam === 'home';
  const offsideLine = getOffsideLine(defenderSnaps, defenderGoalIsLowRow, passerSnapshot?.coord.row);
  const result = resolveOffside({ receiverSnapshot, offsideLine, attackIsHighRow });
  if (!result.isOffside) return null;

  events.push({
    type: 'OFFSIDE',
    phase: 3,
    receiverId: winner.id,
    passerId: meta.lastTouchedPieceId,
    source: 'freeBall',
    result,
  } as OffsideEvent);

  pieces.forEach(p => { p.hasBall = false; });
  const restartPiece = pieces.find(p => p.team === defenseTeam && p.position === 'GK')
    ?? pieces.find(p => p.team === defenseTeam)
    ?? null;
  if (!restartPiece) return null;

  restartPiece.hasBall = true;
  events.push({ type: 'BALL_ACQUIRED', phase: 3, pieceId: restartPiece.id } as BallAcquiredEvent);
  return restartPiece.id;
}

function isOwnHalf(piece: Piece): boolean {
  return piece.team === 'home'
    ? piece.coord.row <= 16
    : piece.coord.row >= 17;
}

function applyBattleDelay(
  pieces: Piece[],
  previous: PossessionDelayState | null,
  turnStartHolderTeam: Team | null,
): { possessionDelay: PossessionDelayState | null; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const holder = pieces.find(p => p.hasBall) ?? null;
  if (!holder || !isOwnHalf(holder) || holder.team !== turnStartHolderTeam) {
    return { possessionDelay: null, events };
  }

  const count = previous?.team === holder.team ? previous.count + 1 : 1;
  if (count < BATTLE_DELAY_THRESHOLD) {
    return { possessionDelay: { team: holder.team, count }, events };
  }

  const opponent: Team = holder.team === 'home' ? 'away' : 'home';
  pieces.forEach(p => { p.hasBall = false; });
  const restartPiece = pieces.find(p => p.team === opponent && p.position === 'GK')
    ?? pieces.find(p => p.team === opponent)
    ?? null;
  if (restartPiece) restartPiece.hasBall = true;

  events.push({
    type: 'BATTLE_DELAY',
    phase: 3,
    team: holder.team,
    count,
    coord: { ...holder.coord },
    awardedToPieceId: restartPiece?.id,
  } as BattleDelayEvent);
  if (restartPiece) {
    events.push({ type: 'BALL_ACQUIRED', phase: 3, pieceId: restartPiece.id } as BallAcquiredEvent);
  }

  return { possessionDelay: null, events };
}

function isPassiveArea(team: Team, coord: HexCoord, context: BoardContext): boolean {
  const zone = context.getZone(coord);
  if (team === 'home') {
    return zone === 'ディフェンシブGサード' || zone === 'ディフェンシブサード';
  }
  return zone === 'ファイナルサード' || zone === 'アタッキングサード';
}

function detectPassiveTactics(
  pieces: Piece[],
  freeBallHex: HexCoord | null,
  context: BoardContext,
): { passiveTacticsTeams: Team[]; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const teams: Team[] = [];
  const holder = pieces.find(p => p.hasBall) ?? null;
  const ballCoord = holder?.coord ?? freeBallHex;

  for (const team of ['home', 'away'] as Team[]) {
    if (ballCoord && isPassiveArea(team, ballCoord, context)) continue;

    const pieceCount = pieces.filter(p => p.team === team && isPassiveArea(team, p.coord, context)).length;
    if (pieceCount < PASSIVE_TACTICS_THRESHOLD) continue;

    teams.push(team);
    events.push({
      type: 'PASSIVE_TACTICS',
      phase: 3,
      team,
      pieceCount,
    } as PassiveTacticsEvent);
  }

  return { passiveTacticsTeams: teams, events };
}

// ============================================================
// ユーティリティ: BoardContext の標準実装ファクトリ
// ============================================================

/**
 * hex_map.json のデータから BoardContext を生成する。
 *
 * 使用例:
 *   import hexMapData from '../data/hex_map.json';
 *   const context = createBoardContext(hexMapData);
 */
export function createBoardContext(
  hexMapData: Array<{ col: number; row: number; zone: string; lane: string }>,
): BoardContext {
  const lookup = new Map(hexMapData.map(h => [`${h.col},${h.row}`, h]));

  return {
    getZone(coord) {
      return (lookup.get(`${coord.col},${coord.row}`)?.zone as import('./types').Zone) ??
        'ミドルサードA';
    },
    getLane(coord) {
      return (lookup.get(`${coord.col},${coord.row}`)?.lane as import('./types').Lane) ??
        'センターレーン';
    },
    isValidHex(coord) {
      return lookup.has(`${coord.col},${coord.row}`);
    },
  };
}

// ============================================================
// ユーティリティ: イベントフィルタ
// ============================================================

/** 特定フェーズのイベントだけ抽出 */
export function eventsOfPhase(
  events: GameEvent[],
  phase: 0 | 1 | 2 | 3,
): GameEvent[] {
  return events.filter(e => (e as { phase?: number }).phase === phase);
}

/** 特定タイプのイベントだけ抽出 */
export function eventsOfType<T extends GameEvent>(
  events: GameEvent[],
  type: T['type'],
): T[] {
  return events.filter((e): e is T => e.type === type);
}

/** ゴールが発生したか確認 */
export function hasGoal(events: GameEvent[]): boolean {
  return events.some(e => e.type === 'SHOOT' && (e as import('./types').ShootEvent).result.outcome === 'goal');
}

/** ファウルが発生した場合にその情報を返す */
export function getFoulEvent(events: GameEvent[]): import('./types').FoulEvent | null {
  return events.find((e): e is import('./types').FoulEvent => e.type === 'FOUL') ?? null;
}
