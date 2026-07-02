// ============================================================
// battleUtils.ts — Battle画面の純粋関数・定数・型変換
// ============================================================

import type {
  GameEvent, HexCoord, PieceData, Cost, Position, Team,
  FormationData, FormationPiece, MatchStats, MvpInfo,
} from '../../types';
import { MAX_ROW } from '../../types';
import type { PresetTeam } from '../../../data/presetTeams';
import type {
  Piece as EnginePiece, Board as EngineBoard, Order as EngineOrder,
  BoardContext,
} from '../../../engine/types';
import {
  getMovementRange, getNeighbors, hexKey, hexDistance,
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

// ── Phase E: 演出タイミング体系（一元管理）──
// CeremonyLayer / CenterOverlay のタイミングは必ずここの定数を使うこと。
// KICKOFF_CEREMONY_MS はターン進行（TURN_START→INPUTのnormalDelay）と連動しているため
// 変更する場合は Battle.tsx 側も必ず合わせる。

/** 暗転背景のフェードイン/アウト */
export const CEREMONY_BACKDROP_FADE_MS = 250;
/** カットイン（文字/帯）の入り */
export const CUTIN_IN_MS = 250;
/** イベントカットインのデフォルトホールド（showOverlayのduration未指定時） */
export const CUTIN_HOLD_MS = 1000;
/** カットイン（文字/帯）の抜け */
export const CUTIN_OUT_MS = 200;
/** KICKOFF演出全体（ターン進行と連動） */
export const KICKOFF_CEREMONY_MS = 2500;
/** KICKOFF文字のホールド（入り→この時間静止→抜け→背景フェードアウト） */
export const KICKOFF_HOLD_MS = 1500;
/** SECOND HALF表示（この後kickoff2ndへ遷移） */
export const SECONDHALF_CEREMONY_MS = 1500;
/** Turn表示（試合時間ラベル横の小さなフェード切替） */
export const TURN_INDICATOR_MS = 600;
/** HALF TIME / FULL TIME のスケールイン */
export const CEREMONY_SCALE_IN_MS = 600;
/** FULL TIME のホイッスル振動 */
export const FULLTIME_SHAKE_MS = 500;
export const HALFTIME_CEREMONY_MS = 3000;
export const FULLTIME_RESULT_BTN_DELAY_MS = 3000;
export const GOAL_CEREMONY_MS = 2600;
/** GOAL演出に渡す得点スナップショット（演出中はstateのスコア更新前のため、確定値をここで固定する） */
export interface GoalCelebrationInfo {
  team: Team;
  scoreHome: number;
  scoreAway: number;
}
export const RECONNECT_BANNER_MS = 3000;
export const SAFETY_TIMEOUT_MS = 8000;
export const MINIGAME_COUNTDOWN_INTERVAL_MS = 1000;
export const MINIGAME_FK_PK_COUNTDOWN = 5;
export const MINIGAME_CK_COUNTDOWN = 10;

/** ゴールキック ワイプ演出タイミング (ms) */
export const GOALKICK_WIPE_TOTAL_MS = 1400;
/** ワイプが画面を覆い切ったタイミング（この瞬間に裏で再配置） */
export const GOALKICK_WIPE_COVER_MS = 560;

/** フェーズ演出タイミング (ms) */
export const PHASE_TIMINGS = [800, 500, 500, 500, 500]; // Phase0-4
export const TOTAL_ANIMATION_MS = PHASE_TIMINGS.reduce((a, b) => a + b, 0); // 2800

/** リプレイアニメーション時間（ms）。§5-1: 約2.5秒 */
export const REPLAY_DURATION = 2500;

// ============================================================
// D2: コマ移動アニメーション（距離連動速度）
// ============================================================

/** コマ移動 1pxあたりのアニメーション時間（1HEX ≈ 40〜45px） */
export const PIECE_MOVE_MS_PER_PX = 3;
/** コマ移動アニメーションの下限（短距離でもこれよりは速くしない） */
export const PIECE_MOVE_MIN_MS = 300;
/** コマ移動アニメーションの上限（従来の固定0.8sと同じ） */
export const PIECE_MOVE_MAX_MS = 800;

/**
 * コマ移動アニメーション時間（ms）を移動ピクセル距離から算出。
 * Piece.tsx のCSS transitionと Battle.tsx のフェーズ待機の両方がこれを使う
 * （片方だけ変えると次フェーズ演出のタイミングがズレるため必ず共有すること）。
 * 移動なし（距離0以下）は 0。
 */
export function calcPieceMoveDurationMs(distPx: number): number {
  if (!Number.isFinite(distPx) || distPx <= 0) return 0;
  return Math.max(PIECE_MOVE_MIN_MS, Math.min(PIECE_MOVE_MAX_MS, Math.round(distPx * PIECE_MOVE_MS_PER_PX)));
}

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
export type CeremonyPhase = 'kickoff' | 'kickoff2nd' | 'halftime' | 'halftime_sub' | 'secondhalf' | 'fulltime' | 'goal' | 'goalkick' | null;

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

/** COM/awayチーム用のデフォルトコマ生成（NPC対戦相手が選出されていればそのチームを使用、なければ固定4-4-2） */
export function createDefaultAwayPieces(opponent?: PresetTeam | null): PieceData[] {
  if (opponent) {
    // PresetTeam.pieces の座標は NPC_TEAMS 定義由来で既に away 側(row 17-33)配置済み
    return opponent.pieces.map((p, i) => ({
      id: `a${String(i + 1).padStart(2, '0')}`,
      team: 'away' as Team,
      position: p.position,
      cost: p.cost,
      coord: { col: p.col, row: p.row },
      hasBall: false,
      moveRange: DEFAULT_MOVE_RANGE,
      isBench: false,
    }));
  }
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

/** 初期コマ配置生成（Formation データ優先、なければデフォルト。opponent指定時はaway側にNPC対戦相手を使用） */
export function createInitialPieces(
  formationData?: FormationData | null,
  kickoffTeam: Team = 'home',
  opponent?: PresetTeam | null,
): PieceData[] {
  const homePieces = formationData
    ? formationToPieces(formationData.starters, formationData.bench, 'home')
    : createDefaultHomePieces();
  const awayPieces = createDefaultAwayPieces(opponent);
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
  if (order.action === 'substitute') {
    return {
      pieceId: order.pieceId,
      type: 'substitute',
      benchPieceId: order.benchPieceId,
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
  opponent?: PresetTeam | null,
): PieceData[] {
  if (!currentPieces || currentPieces.length === 0) {
    return createInitialPieces(fd, kickoffTeam, opponent);
  }
  const templatePieces = createInitialPieces(fd, kickoffTeam, opponent);
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

// ============================================================
// Phase H: セットプレー後の動的再配置（アンカー + 状況シフト + 揺らぎ）
// ============================================================

export type SetPieceRestartType = 'goalkick' | 'fk_fail' | 'pk_fail';

/**
 * mulberry32: シード付き決定的PRNG。
 * 将来オンライン対戦でサーバー/両クライアントが同一配置を再現できるよう、
 * 揺らぎに Math.random() は使わない。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SetPieceRestartArgs {
  currentPieces: PieceData[];
  /** ボールを得る側（ゴールキックを行う側 / GKがセーブした側） */
  defenseTeam: Team;
  restartType: SetPieceRestartType;
  formationData?: FormationData | null;
  opponent?: PresetTeam | null;
  /** 揺らぎのシード（ターン番号等、両クライアントで一致する値） */
  seed: number;
  scoreHome: number;
  scoreAway: number;
  turn: number;
  maxTurn: number;
}

/**
 * セットプレー後の再配置（旧 createGoalKickPieces を置換）。
 * 3層アルゴリズム:
 *  第1層 アンカー   — 各チームの編成フォーメーション座標を基準にし、守備側は自陣へ圧縮、
 *                     攻撃側はハーフライン付近へ前進圧縮（縦方向の線形リマップで形を保存）
 *  第2層 状況シフト — ビハインドは前へ+1（残り25%以下は+2）、リードは終盤のみ-1
 *  第3層 揺らぎ     — シード付きPRNGで列・行±1（毎回同じ定型配置になる単調さの解消）
 *
 * depth = 自陣ゴールラインからの距離（home: row=depth, away: row=MAX_ROW-depth）
 * GKは常に自ゴール前固定。ボールは守備側GK（不在時は守備側の任意コマ）。
 */
export function createSetPieceRestartPieces(args: SetPieceRestartArgs): PieceData[] {
  const {
    currentPieces, defenseTeam, restartType, formationData, opponent,
    seed, scoreHome, scoreAway, turn, maxTurn,
  } = args;

  const depthOf = (team: Team, row: number) => (team === 'home' ? row : MAX_ROW - row);
  const rowOf = (team: Team, depth: number) => (team === 'home' ? depth : MAX_ROW - depth);

  // ── 第1層: アンカー（編成フォーメーション由来の基準位置） ──
  const anchorSource = createInitialPieces(formationData, 'home', opponent);
  const anchorById = new Map(anchorSource.filter(p => !p.isBench).map(p => [p.id, p.coord]));
  // アンカー不明（交代出場等）のフォールバック: 同ポジションのDEFAULT_TEMPLATE座標
  const anchorFor = (p: PieceData): { col: number; depth: number } => {
    const a = anchorById.get(p.id);
    if (a) {
      return { col: a.col, depth: Math.max(0, Math.min(HALF_LINE_ROW, depthOf(p.team, a.row))) };
    }
    const tpl = DEFAULT_TEMPLATE.find(t => t.pos === p.position) ?? DEFAULT_TEMPLATE[0];
    return { col: tpl.col, depth: tpl.row }; // DEFAULT_TEMPLATE は自陣深度そのもの
  };

  const field = currentPieces.filter(p => !p.isBench);
  const bench = currentPieces.filter(p => p.isBench).map(p => ({ ...p, hasBall: false }));

  // 深度レンジ: 守備側は自陣圧縮（FK/PK失敗はGKキャッチの流れなので2列浅く=ライン高め）、
  // 攻撃側はハーフライン(16)付近まで前進圧縮
  const defRange: [number, number] = restartType === 'goalkick' ? [4, 14] : [6, 15];
  const atkRange: [number, number] = [13, 21];

  // ── 第2層: 状況シフト（スコアと残り時間） ──
  const remainingRatio = maxTurn > 0 ? (maxTurn - turn) / maxTurn : 1;
  const shiftFor = (team: Team): number => {
    const myScore = team === 'home' ? scoreHome : scoreAway;
    const oppScore = team === 'home' ? scoreAway : scoreHome;
    if (myScore < oppScore) return remainingRatio <= 0.25 ? 2 : 1; // ビハインド: 前へ
    if (myScore > oppScore && remainingRatio <= 0.25) return -1;   // リード終盤: 後ろへ
    return 0;
  };

  // チームごとの編成深度スパン（線形リマップ用）
  const spanByTeam = new Map<Team, { min: number; max: number }>();
  for (const team of ['home', 'away'] as Team[]) {
    const ds = field.filter(p => p.team === team && p.position !== 'GK').map(p => anchorFor(p).depth);
    spanByTeam.set(team, ds.length > 0
      ? { min: Math.min(...ds), max: Math.max(...ds) }
      : { min: 0, max: HALF_LINE_ROW });
  }

  // 衝突回避（既占有HEXなら列を左右にずらす）
  const occupied = new Set<string>();
  const claim = (col: number, row: number): HexCoord => {
    const tryOffsets = [0, 1, -1, 2, -2, 3, -3];
    for (const dc of tryOffsets) {
      const c = Math.max(0, Math.min(21, col + dc));
      const key = `${c},${row}`;
      if (!occupied.has(key)) { occupied.add(key); return { col: c, row }; }
    }
    occupied.add(`${col},${row}`);
    return { col, row };
  };

  // GKを先に確定（自ゴール前固定。シフト・揺らぎ対象外）
  const coordById = new Map<string, HexCoord>();
  for (const p of field) {
    if (p.position === 'GK') coordById.set(p.id, claim(10, rowOf(p.team, 1)));
  }

  field.forEach((p, i) => {
    if (p.position === 'GK') return;
    // ── 第3層: 揺らぎ（シード+コマindexから決定的に生成） ──
    const rand = mulberry32((Math.imul(seed, 1000003) + Math.imul(i + 1, 7919)) >>> 0);
    const isDef = p.team === defenseTeam;
    const [t0, t1] = isDef ? defRange : atkRange;
    const anchor = anchorFor(p);
    const span = spanByTeam.get(p.team)!;
    const denom = Math.max(1, span.max - span.min);
    let depth = t0 + ((anchor.depth - span.min) * (t1 - t0)) / denom;
    depth += shiftFor(p.team);
    const jitterCol = Math.floor(rand() * 3) - 1;
    const jitterDepth = Math.floor(rand() * 3) - 1;
    depth = Math.round(depth) + jitterDepth;
    // FPは自陣ゴール前(2)〜敵陣に深入りしない範囲(21)へクランプ
    depth = Math.max(2, Math.min(21, depth));
    const col = Math.max(0, Math.min(21, anchor.col + jitterCol));
    const row = Math.max(0, Math.min(MAX_ROW, rowOf(p.team, depth)));
    coordById.set(p.id, claim(col, row));
  });

  const result = field.map(p => ({ ...p, coord: coordById.get(p.id)!, hasBall: false }));

  // ボールは守備側GK（不在時は守備側の任意FP）
  const gk = result.find(p => p.team === defenseTeam && p.position === 'GK')
    ?? result.find(p => p.team === defenseTeam);
  if (gk) gk.hasBall = true;

  return [...result, ...bench];
}

/**
 * G1: 枠外シュート（outcome === 'missed'）を検出し、ゴールキックを行う守備側チームを返す。
 * エンジンは missed をフェーズ外処理として hasBall をシューターに残したまま返すため、
 * クライアントがこの検出結果を使って守備側ゴールキックへ遷移させる責務を持つ。
 */
export function getMissedShootRestart(
  events: GameEvent[],
): { shooterTeam: Team; defenseTeam: Team } | null {
  const missed = events.find(e =>
    e.type === 'SHOOT' && (e as { result?: { outcome?: string } }).result?.outcome === 'missed');
  if (!missed) return null;
  const shooterTeam: Team = String((missed as { shooterId?: unknown }).shooterId ?? '').startsWith('h')
    ? 'home' : 'away';
  return { shooterTeam, defenseTeam: shooterTeam === 'home' ? 'away' : 'home' };
}

/**
 * G3: ヘディングチャンス（CK 2ゾーン勝利）のボール受け手を選ぶ。
 * 攻撃側の非GKコマのうち相手ゴールに最も近いコマ（距離が第一条件、同距離ならFW優先）。
 * 非GKが1体もいない場合は攻撃側の任意のコマにフォールバック。
 */
export function pickHeadingChanceReceiver(pieces: PieceData[], attackTeam: Team): PieceData | null {
  const goalCoord: HexCoord = { col: 10, row: attackTeam === 'home' ? MAX_ROW : 0 };
  const candidates = pieces.filter(p => p.team === attackTeam && !p.isBench && p.position !== 'GK');
  if (candidates.length === 0) {
    return pieces.find(p => p.team === attackTeam && !p.isBench) ?? null;
  }
  let best: PieceData | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    // 距離×2 + FW以外は+1 → 距離が第一条件、同距離のときだけFWが勝つ
    const score = hexDistance(c.coord, goalCoord) * 2 + (c.position === 'FW' ? 0 : 1);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
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
