// ============================================================
// Battle.tsx — 対戦画面（メイン）
// スマホ: §2 全項目 / PC: §3 全項目
// デバイスに応じて完全にUIを切り替える。
// ============================================================

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import type { Page, GameEvent, HexCoord, ActionMode, PieceData, GameMode, Cost, Position, Team, WsMessage, FormationData, FormationPiece, MatchEndData, MatchStats, MvpInfo, TurnPhase } from '../types';
import CenterOverlay, { type OverlayItem } from '../components/CenterOverlay';
import { soundManager } from '../audio/SoundManager';
import { useSettings } from '../contexts/SettingsContext';
import type { BallTrail } from '../components/board/Overlay';
import FlyingBall, { type FlyingBallData } from '../components/FlyingBall';
// BallActionMenu is now inlined in the render
import { POSITION_COLORS, getWsBaseUrl, MAX_ROW } from '../types';
import { useDeviceType } from '../hooks/useDeviceType';
import { useGameState } from '../hooks/useGameState';
import { useWebSocket } from '../hooks/useWebSocket';
import HexBoard from '../components/board/HexBoard';
import Timer from '../components/ui/Timer';
import ActionBar from '../components/ui/ActionBar';
import { LeftPanel, RightPanel } from '../components/ui/SidePanel';
import { generateRuleBasedOrders } from '../../ai/rule_based';
import { processTurn, createBoardContext, hasGoal, getFoulEvent } from '../../engine/turn_processor';
import {
  getMovementRange, getNeighbors, hexKey, hexDistance,
  buildZocMap, buildZoc2Map,
} from '../../engine/movement';
import type {
  Piece as EnginePiece, Board as EngineBoard, Order as EngineOrder,
  ShootEvent, FoulEvent as EngineFoulEvent, GameEvent as EngineGameEvent,
  CollisionEvent, TackleEvent, PassCutEvent, OffsideEvent, PassDeliveredEvent,
} from '../../engine/types';
import FKGame from '../components/minigame/FKGame';
import CKGame from '../components/minigame/CKGame';
import PKGame from '../components/minigame/PKGame';
import hexMapData from '../data/hex_map.json';
import { setBallHolder } from '../utils/ballManager';

interface BattleProps {
  onNavigate: (page: Page) => void;
  matchId?: string;
  gameMode?: GameMode;
  authToken?: string;
  myTeam?: Team;
  formationData?: FormationData | null;
  onMatchEnd?: (data: MatchEndData) => void;
}

/** イベントログからスタッツを集計 */
function computeStats(allEvents: GameEvent[], totalTurns: number): MatchStats {
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
function computeMvp(allEvents: GameEvent[]): MvpInfo | null {
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
      // Assist = パス→次ターンゴール（簡易的にパス送り手をアシスト候補に）
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

  let best: [string, typeof scores extends Map<string, infer V> ? V : never] | null = null;
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

/** ハーフライン（row 16 が中央、キックオフ時は各チーム自陣のみ） */
const HALF_LINE_ROW = 16;

/** デフォルト4-4-2テンプレート（自陣側: row 0〜16 に収まる） */
const DEFAULT_TEMPLATE: Array<{ pos: Position; cost: Cost; col: number; row: number }> = [
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

/** フォーメーション座標を自陣にクランプ（キックオフルール準拠） */
function clampToOwnHalf(row: number, team: Team): number {
  // home: row 0〜16, away: row 17〜33
  if (team === 'home') return Math.min(row, HALF_LINE_ROW);
  return Math.max(row, HALF_LINE_ROW + 1);
}

/** FormationPiece配列 → PieceData配列に変換 */
function formationToPieces(starters: FormationPiece[], bench: FormationPiece[], team: Team): PieceData[] {
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
function createDefaultAwayPieces(): PieceData[] {
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
function createDefaultHomePieces(): PieceData[] {
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
function createInitialPieces(formationData?: FormationData | null, kickoffTeam: Team = 'home'): PieceData[] {
  // ── homeチーム: フォーメーションデータがあればそれを使用 ──
  const homePieces = formationData
    ? formationToPieces(formationData.starters, formationData.bench, 'home')
    : createDefaultHomePieces();

  // ── awayチーム: デフォルト4-4-2（row反転で相手陣配置） ──
  const awayPieces = createDefaultAwayPieces();

  const pieces = [...homePieces, ...awayPieces];

  // キックオフ: 指定チームの FW にボール
  const fw = pieces.find((p) => p.team === kickoffTeam && p.position === 'FW' && !p.isBench);
  if (fw) fw.hasBall = true;

  return pieces;
}

/** PieceData → engine Piece 変換 */
function toEnginePiece(p: PieceData): EnginePiece {
  return { id: p.id, team: p.team, position: p.position, cost: p.cost, coord: p.coord, hasBall: p.hasBall };
}

/** クライアント OrderData → エンジン Order に変換 */
function clientOrderToEngine(order: import('../types').OrderData, pieces: PieceData[]): EngineOrder {
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
    // スルーパスはエンジン上では 'throughPass' として処理
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
function enginePiecesToClient(enginePieces: EnginePiece[], existing: PieceData[]): PieceData[] {
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

/** ゴールリスタート用コマ配置（失点チームがキックオフ） */
function createGoalRestartPieces(
  fd: FormationData | null | undefined,
  kickoffTeam: Team,
): PieceData[] {
  return createInitialPieces(fd, kickoffTeam);
}

// ============================================================
// ゲームメカニクス定数
// ============================================================

/** 基本移動力 (§8-1) */
const DEFAULT_MOVE_RANGE = 4;

/** 正確パス距離の基本値 (§7-3) */
const BASE_ACCURATE_PASS_RANGE = 6;
/** パス距離ボーナス: コスト3 → +1 */
const PASS_RANGE_COST3_BONUS = 1;
/** パス距離ボーナス: OMポジション → +1 */
const PASS_RANGE_OM_BONUS = 1;

/** シュートゾーン閾値 (§7-2: homeは row>=22, awayは row<=11) */
const SHOOT_ZONE_HOME_MIN_ROW = 22;
const SHOOT_ZONE_AWAY_MAX_ROW = 11;
/** シュート距離補正: DF/VO/SB は -1, WG/OM/FW は +1 */
const SHOOT_RANGE_PENALTY_POSITIONS: Position[] = ['DF', 'VO', 'SB'];
const SHOOT_RANGE_BONUS_POSITIONS: Position[] = ['WG', 'OM', 'FW'];

/** ゴール周辺のHEX範囲 (ゴールポスト: col 7〜14, ゴールラインからの行数: ±2) */
const GOAL_COL_MIN = 7;
const GOAL_COL_MAX = 14;
const GOAL_ROW_RANGE = 2;

/** 交代ルール (§9-4) */
const MAX_SUBSTITUTIONS = 3;
/** フィールドコスト上限 (§6-2) */
const MAX_FIELD_COST = 16;

/** 試合時間表示 (§9-2) */
const MINUTES_PER_TURN = 3;
const HALFTIME_MINUTE = 45;
const FULLTIME_MINUTE = 90;

// ============================================================
// タイミング定数 (ms)
// ============================================================

const KICKOFF_CEREMONY_MS = 2500;
const HALFTIME_CEREMONY_MS = 3000;
const SECOND_HALF_DELAY_MS = 4500;
const FULLTIME_RESULT_BTN_DELAY_MS = 3000;
const TURN_FLASH_MS = 1200;
const GOAL_CEREMONY_MS = 2000;
const RECONNECT_BANNER_MS = 3000;
const SAFETY_TIMEOUT_MS = 8000;
const MINIGAME_COUNTDOWN_INTERVAL_MS = 1000;
const MINIGAME_FK_PK_COUNTDOWN = 5;
const MINIGAME_CK_COUNTDOWN = 10;

/** 正確パス距離（§7-3: 基本6HEX, コスト3+1, OM+1） */
function getAccuratePassRange(piece: PieceData): number {
  let range = BASE_ACCURATE_PASS_RANGE;
  if (piece.cost === 3) range += PASS_RANGE_COST3_BONUS;
  if (piece.position === 'OM') range += PASS_RANGE_OM_BONUS;
  return range;
}

/** シュート可能判定（ポジション別距離補正: DF/VO/SB -1, WG/OM/FW +1） */
function isShootZoneForPiece(coord: HexCoord, myTeam: Team, position: Position): boolean {
  let modifier = 0;
  if (SHOOT_RANGE_PENALTY_POSITIONS.includes(position)) modifier = -1;
  if (SHOOT_RANGE_BONUS_POSITIONS.includes(position)) modifier = 1;
  if (myTeam === 'home') return coord.row >= (SHOOT_ZONE_HOME_MIN_ROW - modifier);
  return coord.row <= (SHOOT_ZONE_AWAY_MAX_ROW + modifier);
}

/** BFS で移動可能HEXを列挙 */
function computeReachableHexes(
  piece: EnginePiece,
  isDribbling: boolean,
  boardContext: import('../../engine/types').BoardContext,
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

/** フェーズ演出タイミング (ms) */
const PHASE_TIMINGS = [800, 500, 500, 500, 500]; // Phase0-4
const TOTAL_ANIMATION_MS = PHASE_TIMINGS.reduce((a, b) => a + b, 0); // 2800

/** ミニゲーム状態型 */
type MiniGameState =
  | null
  | { type: 'fk'; coord: HexCoord; kickerPiece: PieceData; gkPiece: PieceData; isAttacker: boolean; fouledTeam: Team }
  | { type: 'ck'; isAttacker: boolean; pieces: PieceData[]; attackTeam: Team }
  | { type: 'pk'; coord: HexCoord; kickerPiece: PieceData; gkPiece: PieceData; isKicker: boolean; fouledTeam: Team };

/** 前半/後半の基本ターン数 */
const HALF_TURNS = 15;

/**
 * サッカー風試合時間ラベルを生成。
 * 前半15ターン = 0:00〜42:00 (3分刻み), AT = 45+1, 45+2 …
 * 後半15ターン = 45:00〜87:00, AT = 90+1, 90+2 …
 */
function getMatchTimeLabel(turn: number, at1: number, at2: number): { label: string; isAT: boolean } {
  const halfEnd = HALF_TURNS + at1;

  // 前半レギュラー (ターン 1〜15)
  if (turn <= HALF_TURNS) {
    const min = (turn - 1) * MINUTES_PER_TURN;
    return { label: `${min}:00`, isAT: false };
  }
  // 前半AT (ターン 16〜halfEnd)
  if (turn <= halfEnd) {
    return { label: `${HALFTIME_MINUTE}+${turn - HALF_TURNS}`, isAT: true };
  }
  // 後半レギュラー
  const secondHalfTurn = turn - at1; // at1 を引いて後半ターン番号に
  if (secondHalfTurn <= HALF_TURNS * 2) {
    const min = HALFTIME_MINUTE + (secondHalfTurn - HALF_TURNS - 1) * MINUTES_PER_TURN;
    return { label: `${min}:00`, isAT: false };
  }
  // 後半AT
  return { label: `${FULLTIME_MINUTE}+${secondHalfTurn - HALF_TURNS * 2}`, isAT: true };
}

export default function Battle({ onNavigate, matchId, gameMode, authToken, myTeam: propMyTeam, formationData, onMatchEnd }: BattleProps) {
  const device = useDeviceType();
  const { settings } = useSettings();
  const animSpeed = settings.animationSpeed || 1;
  const isMobile = device === 'mobile' || device === 'tablet';
  const {
    state,
    dispatch,
    myPieces,
    myBenchPieces,
    opponentPieces,
    orderedCount,
    totalFieldPieces,
    selectedPiece,
    handleWsMessage,
  } = useGameState();

  const [events, setEvents] = useState<GameEvent[]>([]);
  const [disconnectBanner, setDisconnectBanner] = useState<string | null>(null);
  /** 全ターンの累積イベントログ（スタッツ集計用） */
  const cumulativeEventsRef = useRef<GameEvent[]>([]);

  const isCom = gameMode === 'com' || matchId?.startsWith('com_');

  // ── リプレイタイマー管理（cleanup用） ──
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replaySafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** リプレイ中のタイマーをすべてクリア */
  const clearReplayTimers = useCallback(() => {
    if (replayTimerRef.current) { clearTimeout(replayTimerRef.current); replayTimerRef.current = null; }
    if (replaySafetyRef.current) { clearTimeout(replaySafetyRef.current); replaySafetyRef.current = null; }
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => clearReplayTimers();
  }, [clearReplayTimers]);

  // ── エンジン用 BoardContext（1回だけ生成） ──
  const boardContext = useMemo(
    () => createBoardContext(hexMapData as Array<{ col: number; row: number; zone: string; lane: string }>),
    [],
  );

  // ── ゴール追跡 ──
  const goalScoredRef = useRef<{ scored: boolean; scorerTeam: Team | null }>({ scored: false, scorerTeam: null });

  // ── オンライン対戦: sequence/nonce管理 ──
  const sequenceRef = useRef(0);

  // ── オンライン対戦: WS メッセージ処理 ──
  const handleOnlineMessage = useCallback((msg: unknown) => {
    const data = msg as WsMessage;
    switch (data.type) {
      case 'TURN_RESULT':
        // リプレイアニメーション（ローカル命令適用）→ 2.5秒後にサーバー状態を反映
        dispatch({ type: 'RESOLVE_TURN' });
        setTimeout(() => {
          dispatch({
            type: 'APPLY_TURN_RESULT',
            board: data.board,
            turn: data.turn,
            scoreHome: data.scoreHome,
            scoreAway: data.scoreAway,
          });
          if (data.events) {
            setEvents(data.events);
          }
        }, REPLAY_DURATION);
        break;

      case 'INPUT_ACCEPTED':
        dispatch({ type: 'SET_STATUS', status: 'waiting_opponent' });
        break;

      case 'INPUT_REJECTED':
        console.warn('[Battle] Input rejected:', data.violations);
        dispatch({ type: 'SET_STATUS', status: 'playing' });
        break;

      case 'OPPONENT_DISCONNECTED':
        setDisconnectBanner(`相手が切断しました（${data.graceSeconds}秒以内に復帰しない場合、勝利となります）`);
        break;

      case 'MATCH_END':
        dispatch({ type: 'SET_STATUS', status: 'finished' });
        setDisconnectBanner(null);
        break;

      case 'RECONNECT':
        dispatch({
          type: 'SET_BOARD',
          board: data.state.board,
          turn: data.state.turn,
          scoreHome: data.state.scoreHome,
          scoreAway: data.state.scoreAway,
        });
        dispatch({ type: 'SET_STATUS', status: 'playing' });
        setDisconnectBanner(null);
        break;

      case 'RATE_LIMIT_WARNING':
        console.warn('[Battle] Rate limit warning');
        break;
    }
  }, [dispatch]);

  // ── WebSocket接続（オンライン対戦用） ──
  const wsUrl = matchId ? `${getWsBaseUrl()}/match/${matchId}/ws` : '';
  const { connect: wsConnect, disconnect: wsDisconnect, send: wsSend, status: wsStatus } = useWebSocket({
    url: wsUrl,
    token: authToken ?? '',
    onMessage: handleOnlineMessage,
    onDisconnect: () => {
      if (!isCom) {
        setDisconnectBanner('サーバーとの接続が切断されました。再接続中...');
      }
    },
    onReconnect: () => {
      setDisconnectBanner('接続が復帰しました');
      setTimeout(() => setDisconnectBanner(null), RECONNECT_BANNER_MS);
    },
    autoReconnect: true,
  });

  // ── オンライン対戦: WS接続 + ゲーム初期化 ──
  useEffect(() => {
    if (isCom) return;
    if (!matchId || !authToken) return;

    wsConnect();

    // 初期コマ配置（サーバーからTURN_RESULTまたはRECONNECTが来るまでの暫定表示）
    const pieces = createInitialPieces(formationData);
    dispatch({
      type: 'INIT_MATCH',
      matchId,
      myTeam: propMyTeam ?? 'home',
      board: { pieces },
    });

    return () => wsDisconnect();
  }, [isCom, matchId, authToken, wsConnect, wsDisconnect, dispatch, propMyTeam]);

  // ── COM対戦: ゲーム状態を即座に初期化 ──
  // ── 1st Halfキックオフチーム（ランダム決定、2nd Halfは逆） ──
  const firstHalfKickoffRef = useRef<Team>(Math.random() < 0.5 ? 'home' : 'away');

  // refガードなし: StrictModeの再マウントでも正常に初期化する
  useEffect(() => {
    if (!isCom) return;

    const kickoffTeam = firstHalfKickoffRef.current;
    const pieces = createInitialPieces(formationData, kickoffTeam);
    console.log(`[Battle] COM init: 1st half kickoff = ${kickoffTeam}`);
    dispatch({
      type: 'INIT_MATCH',
      matchId: matchId ?? `com_${Date.now()}`,
      myTeam: 'home',
      board: { pieces },
    });
  }, [isCom, matchId, dispatch, formationData]);

  // ── 演出フェーズ管理 ──
  type CeremonyPhase = 'kickoff' | 'kickoff2nd' | 'halftime' | 'secondhalf' | 'fulltime' | 'turn' | 'goal' | null;
  const [ceremony, setCeremony] = useState<CeremonyPhase>(null);
  const [showResultBtn, setShowResultBtn] = useState(false);

  // キックオフ演出（試合開始時）
  useEffect(() => {
    if (state.turn !== 1 || state.status !== 'playing') return;
    setCeremony('kickoff');
    const timer = setTimeout(() => setCeremony(null), KICKOFF_CEREMONY_MS);
    return () => clearTimeout(timer);
  }, [state.turn, state.status]);

  // ハーフタイム演出 → 3秒後に「SECOND HALF」→ 1.5秒後にボードリセット+キックオフ演出 → 2.5秒後に後半開始
  // 後半は前半にキックオフしなかった方（away）がキックオフ
  useEffect(() => {
    if (state.status !== 'halftime') return;
    setCeremony('halftime');
    // キャプチャ: エフェクト実行時の値を保持
    const capturedTurn = state.turn;
    const capturedScoreHome = state.scoreHome;
    const capturedScoreAway = state.scoreAway;
    // 後半リセット用コマ（2nd halfは1st halfと逆チームがキックオフ）
    const secondHalfKickoff: Team = firstHalfKickoffRef.current === 'home' ? 'away' : 'home';
    const resetPieces = createGoalRestartPieces(formationData, secondHalfKickoff);
    const t1 = setTimeout(() => setCeremony('secondhalf'), HALFTIME_CEREMONY_MS);
    const t2 = setTimeout(() => {
      // キックオフ演出表示と同時にコマを初期位置に表示（演出中に配置が見える）
      dispatch({ type: 'SET_DISPLAY_PIECES', pieces: resetPieces });
      setCeremony('kickoff2nd');
    }, SECOND_HALF_DELAY_MS);
    const t3 = setTimeout(() => {
      // 後半開始: 正式にボード状態をリセット — 1回のdispatchで原子的に実行
      setCeremony(null);
      dispatch({
        type: 'RESUME_SECOND_HALF',
        board: { pieces: resetPieces },
        turn: capturedTurn,
        scoreHome: capturedScoreHome,
        scoreAway: capturedScoreAway,
      });
    }, SECOND_HALF_DELAY_MS + KICKOFF_CEREMONY_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [state.status, dispatch, formationData, state.turn, state.scoreHome, state.scoreAway]);

  // タイムアップ演出（試合終了時）
  useEffect(() => {
    if (state.status !== 'finished') return;
    setCeremony('fulltime');
    const t = setTimeout(() => setShowResultBtn(true), FULLTIME_RESULT_BTN_DELAY_MS);
    return () => clearTimeout(t);
  }, [state.status]);

  // リプレイ中 or 相手待ちフラグ（操作不可）
  const isResolving = state.status === 'resolving';
  const isWaiting = state.status === 'waiting_opponent';
  const isInputDisabled = isResolving || isWaiting || state.turnPhase !== 'INPUT';

  // ── CenterOverlay キュー管理 ──
  const [overlayQueue, setOverlayQueue] = useState<OverlayItem[]>([]);
  const overlayIdCounter = useRef(0);

  const showOverlay = useCallback((text: string, opts?: { subText?: string; duration?: number; color?: string; fontSize?: number; glow?: boolean }) => {
    const id = `ov_${++overlayIdCounter.current}`;
    setOverlayQueue(prev => [...prev, {
      id, text, duration: opts?.duration ?? 1000,
      subText: opts?.subText, color: opts?.color, fontSize: opts?.fontSize, glow: opts?.glow,
    }]);
    return id;
  }, []);

  const handleOverlayComplete = useCallback((id: string) => {
    setOverlayQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  // ── turnPhase 遷移管理 ──
  const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPhaseTimeout = useCallback(() => {
    if (phaseTimeoutRef.current) { clearTimeout(phaseTimeoutRef.current); phaseTimeoutRef.current = null; }
  }, []);

  // TURN_START → INPUT（1秒後、安全弁2秒）
  const tutorialShownRef = useRef(false);
  useEffect(() => {
    if (state.turnPhase !== 'TURN_START' || state.status !== 'playing') return;
    clearPhaseTimeout();
    // Turn X の演出表示
    if (state.turn > 0) {
      showOverlay(`Turn ${state.turn}`, { duration: 800, fontSize: 36 });
    }
    // Turn 1 初回チュートリアルヒント
    if (state.turn === 1 && !tutorialShownRef.current) {
      tutorialShownRef.current = true;
      setTimeout(() => {
        showOverlay('コマタップ → 移動・ドリブル', {
          subText: 'ボールタップ → パス・シュート',
          duration: 2500, fontSize: 24,
        });
      }, 1200);
    }
    const normalDelay = state.turn === 1 ? 4000 : 1000; // Turn 1はチュートリアル分長く
    phaseTimeoutRef.current = setTimeout(() => {
      dispatch({ type: 'SAVE_SNAPSHOT' });
      dispatch({ type: 'SET_TURN_PHASE', phase: 'INPUT' });
    }, normalDelay);
    // 安全弁: 通常の2倍（Turn 1は8秒、それ以外は2秒）
    const safetyDelay = normalDelay * 2;
    const safety = setTimeout(() => {
      if (state.turnPhase === 'TURN_START') dispatch({ type: 'SET_TURN_PHASE', phase: 'INPUT' });
    }, safetyDelay);
    return () => { clearPhaseTimeout(); clearTimeout(safety); };
  }, [state.turnPhase, state.status, state.turn, dispatch, clearPhaseTimeout, showOverlay]);

  // ── 非INPUTフェーズではメニューを閉じる ──
  useEffect(() => {
    if (state.turnPhase !== 'INPUT') setBallActionMenu(null);
  }, [state.turnPhase]);

  // ── ボール整合性チェック（INPUT開始時） ──
  useEffect(() => {
    if (state.turnPhase !== 'INPUT' || state.status !== 'playing') return;
    const holders = state.board.pieces.filter(p => p.hasBall && !p.isBench);
    if (holders.length === 0 && !state.board.freeBallHex) {
      console.error('[Battle] BALL SAFETY: No ball at INPUT start, restoring to GK');
      const gk = state.board.pieces.find(p => p.position === 'GK' && p.team === state.myTeam && !p.isBench);
      const fallback = gk ?? state.board.pieces.find(p => p.team === state.myTeam && !p.isBench);
      if (fallback) {
        const fixed = state.board.pieces.map(p => p.id === fallback.id ? { ...p, hasBall: true } : p);
        dispatch({ type: 'SET_DISPLAY_PIECES', pieces: fixed });
      }
    }
  }, [state.turnPhase, state.status, state.board.pieces, state.board.freeBallHex, state.myTeam, dispatch]);

  // EXECUTION → EVENT → TURN_END は handleConfirm のsetTimeoutチェーンで管理（既存）
  // EXECUTION 安全弁: 8秒（既存の replaySafetyRef）
  // TURN_END → 次ターン: NEXT_TURN dispatch で TURN_START に戻る

  // WAITING 安全弁（COM用: 10秒）
  useEffect(() => {
    if (state.turnPhase !== 'WAITING' || !isCom) return;
    const safety = setTimeout(() => {
      if (state.turnPhase === 'WAITING') dispatch({ type: 'SET_TURN_PHASE', phase: 'EXECUTION' });
    }, 10000);
    return () => clearTimeout(safety);
  }, [state.turnPhase, isCom, dispatch]);

  useEffect(() => {
    return () => clearPhaseTimeout();
  }, [clearPhaseTimeout]);

  // ── A8: オフサイドライン表示トグル ──
  // オフサイドライン表示は無効化（判定ロジックはエンジン側で維持）

  // ── A7: ミニゲーム状態 ──
  const [miniGame, setMiniGame] = useState<MiniGameState>(null);
  const [miniGameCountdown, setMiniGameCountdown] = useState(5);

  // ── A10: フェーズ演出 ──
  const [resolvingPhase, setResolvingPhase] = useState(-1); // -1 = not in animation
  const [phaseEffects, setPhaseEffects] = useState<Array<{ coord: HexCoord; icon: string; color: string; text?: string }>>([]);
  const [ballTrails, setBallTrails] = useState<BallTrail[]>([]);
  const [flyingBall, setFlyingBall] = useState<FlyingBallData | null>(null);
  const [ballActionMenu, setBallActionMenu] = useState<string | null>(null); // pieceId or null
  const flyingBallResolveRef = useRef<(() => void) | null>(null);
  const resolvingEventsRef = useRef<EngineGameEvent[]>([]);

  // ── A2: 移動範囲（selectedPiece の移動可能HEX） ──
  const highlightHexes = useMemo(() => {
    if (!selectedPiece || isInputDisabled) return [];
    const ep = toEnginePiece(selectedPiece);
    const isDribbling = selectedPiece.hasBall;
    return computeReachableHexes(ep, isDribbling, boardContext);
  }, [selectedPiece, isInputDisabled, boardContext]);

  // ── A3: ZOC表示（選択コマがある時のみ） ──
  const zocHexes = useMemo(() => {
    if (!state.selectedPieceId) return { own: [] as HexCoord[], opponent: [] as HexCoord[] };
    const fieldPieces = state.board.pieces.filter(p => !p.isBench).map(toEnginePiece);
    const myTeam = state.myTeam;
    const enemyTeam: Team = myTeam === 'home' ? 'away' : 'home';
    const ownZocMap = buildZocMap(fieldPieces, myTeam);
    const oppZocMap = buildZocMap(fieldPieces, enemyTeam);
    const own: HexCoord[] = [];
    const opponent: HexCoord[] = [];
    for (const key of ownZocMap.keys()) {
      const [col, row] = key.split(',').map(Number);
      own.push({ col, row });
    }
    for (const key of oppZocMap.keys()) {
      const [col, row] = key.split(',').map(Number);
      opponent.push({ col, row });
    }
    return { own, opponent };
  }, [state.selectedPieceId, state.board.pieces, state.myTeam]);

  // ── A8: オフサイドライン計算（GK除外 + ハーフライン制約 + ボール位置制約） ──
  // オフサイドライン表示は無効化（常にnull）
  const offsideLine = null;

  // ── A4: シュート可能範囲HEX（シュートモード時に表示） ──
  const shootRangeHexes = useMemo(() => {
    if (!selectedPiece) return [];
    if (state.actionMode !== 'shoot' && !(selectedPiece.hasBall && state.actionMode === null)) return [];
    // highlightHexes（移動可能範囲）のうちシュートゾーンに入るHEXを返す
    // + 現在位置がシュートゾーンなら現在位置のゴール方向HEXも含める
    const pos = selectedPiece.position;
    const team = state.myTeam;
    // 現在位置からシュート可能なら、ゴール周辺のHEXをハイライト
    if (!isShootZoneForPiece(selectedPiece.coord, team, pos)) return [];
    const goalRow = team === 'home' ? MAX_ROW : 0;
    const result: HexCoord[] = [];
    for (let col = GOAL_COL_MIN; col <= GOAL_COL_MAX; col++) {
      for (let r = Math.max(0, goalRow - GOAL_ROW_RANGE); r <= Math.min(MAX_ROW, goalRow + GOAL_ROW_RANGE); r++) {
        if (boardContext.isValidHex({ col, row: r })) {
          result.push({ col, row: r });
        }
      }
    }
    return result;
  }, [selectedPiece, state.actionMode, state.myTeam, boardContext]);

  // ── A4/A9: ロングパス警告 ──
  const longPassWarnings = useMemo(() => {
    const warns = new Map<string, number>();
    for (const [pid, order] of state.orders) {
      if (order.action !== 'pass' || !order.targetPieceId) continue;
      const passer = state.board.pieces.find(p => p.id === pid);
      const receiver = state.board.pieces.find(p => p.id === order.targetPieceId);
      if (!passer || !receiver) continue;
      const dist = hexDistance(passer.coord, receiver.coord);
      const accurateRange = getAccuratePassRange(passer);
      if (dist > accurateRange) {
        warns.set(pid, dist);
      }
    }
    return warns.size > 0 ? warns : undefined;
  }, [state.orders, state.board.pieces]);

  // 通常ターン切替演出（上記以外）
  const halfEnd = HALF_TURNS + state.additionalTime1;
  useEffect(() => {
    if (state.turn <= 1 || state.status !== 'playing') return;
    if (state.turn === halfEnd + 1) return; // secondhalf は別演出
    setCeremony('turn');
    const timer = setTimeout(() => setCeremony(null), TURN_FLASH_MS);
    return () => clearTimeout(timer);
  }, [state.turn, state.status, halfEnd]);

  // ── 試合時間ラベル ──
  const turnInfo = useMemo(
    () => getMatchTimeLabel(state.turn, state.additionalTime1, state.additionalTime2),
    [state.turn, state.additionalTime1, state.additionalTime2],
  );

  // スマホ: 未指示コマ一覧展開（§2-2 指示カウントタップ）
  const [showUnorderedList, setShowUnorderedList] = useState(false);

  // スマホ: 相手コマ情報ポップアップ（§2-3）
  const [opponentPopup, setOpponentPopup] = useState<PieceData | null>(null);

  // PC: 右クリックコンテキストメニュー（§3-2）
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; pieceId: string;
  } | null>(null);

  // PC: マウスオーバーZOC表示用（§3-2）
  const [hoverZocPieceId, setHoverZocPieceId] = useState<string | null>(null);

  // PC: マウスオーバー相手コマツールチップ（§3-2）
  const [tooltip, setTooltip] = useState<{
    piece: PieceData; x: number; y: number;
  } | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);

  // ================================================================
  // §3-3 キーボードショートカット（PCのみ）
  // ================================================================
  useEffect(() => {
    if (isMobile) return;

    const handleKey = (e: KeyboardEvent) => {
      // テキスト入力中は無視
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // 1-9, 0, - でコマ選択（§3-3）
      const numKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];
      const idx = numKeys.indexOf(e.key);
      if (idx !== -1 && idx < myPieces.length) {
        dispatch({ type: 'SELECT_PIECE', pieceId: myPieces[idx].id });
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'd': // ドリブルモード
          if (selectedPiece?.hasBall) {
            dispatch({ type: 'SET_ACTION_MODE', mode: state.actionMode === 'dribble' ? null : 'dribble' });
          }
          break;
        case 'q': // パスモード
          if (selectedPiece?.hasBall) {
            dispatch({ type: 'SET_ACTION_MODE', mode: state.actionMode === 'pass' ? null : 'pass' });
          }
          break;
        case 'w': // シュートモード
          if (selectedPiece?.hasBall) {
            dispatch({ type: 'SET_ACTION_MODE', mode: state.actionMode === 'shoot' ? null : 'shoot' });
          }
          break;
        case 'e': // 交代メニュー
          dispatch({ type: 'SET_ACTION_MODE', mode: state.actionMode === 'substitute' ? null : 'substitute' });
          break;
        case 'z': // Undo
          dispatch({ type: 'UNDO_LAST_ORDER' });
          break;
        case ' ': // ターン確定
          e.preventDefault();
          handleConfirm();
          break;
        case 'tab': // 次の未指示コマ
          e.preventDefault();
          selectNextUnordered();
          break;
        case 'escape': // 選択解除
          dispatch({ type: 'SELECT_PIECE', pieceId: null });
          setContextMenu(null);
          break;
        case 'f': // ボード全体表示
          // HexBoard のダブルクリックと同じ効果 → synthetic event dispatch
          boardRef.current?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMobile, myPieces, state.orders, state.actionMode, selectedPiece, dispatch]);

  // コンテキストメニューを閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // ================================================================
  // 共通コールバック
  // ================================================================

  const selectNextUnordered = useCallback(() => {
    const unordered = myPieces.find((p) => !state.orders.has(p.id));
    if (unordered) dispatch({ type: 'SELECT_PIECE', pieceId: unordered.id });
  }, [myPieces, state.orders, dispatch]);

  const handleSelectPiece = useCallback(
    (pieceId: string | null) => {
      if (state.turnPhase !== 'INPUT') return;

      // §2-3 相手コマタップで情報ポップアップ
      if (pieceId && isMobile) {
        const op = opponentPieces.find((p) => p.id === pieceId);
        if (op) {
          setOpponentPopup(op);
          return;
        }
      }

      setOpponentPopup(null);
      setShowUnorderedList(false);

      if (pieceId) {
        const p = state.board.pieces.find(pp => pp.id === pieceId);

        // ボール保持者（味方・未命令）→ 選択してメニュー表示
        if (p?.hasBall && p.team === state.myTeam && !state.orders.has(pieceId)) {
          dispatch({ type: 'SELECT_PIECE', pieceId });
          setBallActionMenu(pieceId);
          if (isMobile && navigator.vibrate) navigator.vibrate(30);
          return;
        }

        dispatch({ type: 'SELECT_PIECE', pieceId });
        setBallActionMenu(null);
      } else {
        dispatch({ type: 'SELECT_PIECE', pieceId: null });
        setBallActionMenu(null);
      }

      if (isMobile && pieceId && navigator.vibrate) navigator.vibrate(30);
    },
    [dispatch, isMobile, opponentPieces, state.board.pieces, state.myTeam, state.turnPhase, state.orders],
  );

  /** ボールアイコンをタッチ → handleSelectPiece と同じ */
  const handleBallClick = useCallback(
    (pieceId: string) => handleSelectPiece(pieceId),
    [handleSelectPiece],
  );

  /** シュート可能ゾーン判定（ゲーム座標、ポジション別距離補正付き） */
  const isShootZone = useCallback((coord: HexCoord) => {
    const piece = state.selectedPieceId
      ? state.board.pieces.find(p => p.id === state.selectedPieceId)
      : null;
    const pos = piece?.position ?? 'MF';
    return isShootZoneForPiece(coord, state.myTeam, pos);
  }, [state.myTeam, state.selectedPieceId, state.board.pieces]);

  const handleHexClick = useCallback(
    (coord: HexCoord) => {
      if (state.turnPhase !== 'INPUT') return;
      setBallActionMenu(null); // メニューを閉じる
      if (!state.selectedPieceId) {
        dispatch({ type: 'SELECT_PIECE', pieceId: null });
        return;
      }

      const selPiece = state.board.pieces.find(p => p.id === state.selectedPieceId);
      const hasBall = selPiece?.hasBall ?? false;

      // ── パスモード（ボールタッチ由来） ──
      if (state.actionMode === 'pass') {
        const teammate = state.board.pieces.find(
          (p) => p.coord.col === coord.col && p.coord.row === coord.row
            && p.team === state.myTeam && p.id !== state.selectedPieceId && !p.isBench,
        );
        if (teammate) {
          // 味方コマ → パス: ボールを即座に移動し、パス元を命令済みに
          dispatch({ type: 'PASS_BALL', fromPieceId: state.selectedPieceId, toPieceId: teammate.id });
        } else if (isShootZone(coord)) {
          dispatch({ type: 'ADD_ORDER', order: { pieceId: state.selectedPieceId, action: 'shoot', targetHex: coord } });
        } else {
          // スルーパス: 命令登録 + ボールを元の選手から外す + フリーボール仮表示
          dispatch({ type: 'THROUGH_PASS', fromPieceId: state.selectedPieceId, targetHex: coord });
        }
      } else if (state.actionMode === 'shoot') {
        dispatch({ type: 'ADD_ORDER', order: { pieceId: state.selectedPieceId, action: 'shoot', targetHex: coord } });
      } else if (state.actionMode === 'dribble') {
        dispatch({ type: 'ADD_ORDER', order: { pieceId: state.selectedPieceId, action: 'dribble', targetHex: coord } });
      } else if (state.actionMode === 'throughPass') {
        dispatch({ type: 'ADD_ORDER', order: { pieceId: state.selectedPieceId, action: 'throughPass', targetHex: coord } });
      } else if (hasBall) {
        // ボール保持者 + モード未選択 → ドリブル（コマタッチからの遷移）
        dispatch({ type: 'ADD_ORDER', order: { pieceId: state.selectedPieceId, action: 'dribble', targetHex: coord } });
      } else {
        // ボール非保持者 → 移動
        dispatch({ type: 'ADD_ORDER', order: { pieceId: state.selectedPieceId, action: 'move', targetHex: coord } });
      }

      if (isMobile && navigator.vibrate) navigator.vibrate(20);
    },
    [state.selectedPieceId, state.actionMode, state.board.pieces, state.myTeam,
     dispatch, isMobile, isShootZone, state.turnPhase],
  );

  /** リプレイアニメーション時間（ms）。§5-1: 約2.5秒 */
  const REPLAY_DURATION = 2500;

  // ── HEX座標→ピクセル座標変換（hex_mapデータを使用、flipY対応） ──
  const hexToPixel = useCallback((coord: HexCoord): { x: number; y: number } => {
    const displayRow = state.myTeam === 'home' ? MAX_ROW - coord.row : coord.row;
    const cell = (hexMapData as Array<{ col: number; row: number; x: number; y: number }>)
      .find(c => c.col === coord.col && c.row === displayRow);
    return cell ? { x: cell.x, y: cell.y } : { x: 500, y: 900 };
  }, [state.myTeam]);

  // ── ボール飛行 → Promise ──
  const launchFlyingBall = useCallback((from: HexCoord, to: HexCoord, type: FlyingBallData['type']): Promise<void> => {
    const fromPx = hexToPixel(from);
    const toPx = hexToPixel(to);
    const dist = Math.hypot(toPx.x - fromPx.x, toPx.y - fromPx.y);
    const durationMs = Math.round(Math.max(200, Math.min(500, dist * 0.8)) / animSpeed);
    return new Promise<void>(resolve => {
      flyingBallResolveRef.current = resolve;
      setFlyingBall({ fromX: fromPx.x, fromY: fromPx.y, toX: toPx.x, toY: toPx.y, type, durationMs });
    });
  }, [hexToPixel, animSpeed]);

  const handleFlyingBallComplete = useCallback(() => {
    setFlyingBall(null);
    flyingBallResolveRef.current?.();
    flyingBallResolveRef.current = null;
  }, []);

  const handleConfirm = useCallback(() => {
    if (state.status !== 'playing' || state.turnPhase !== 'INPUT') return;

    // フェーズをWAITINGに移行
    dispatch({ type: 'SET_TURN_PHASE', phase: 'WAITING' });

    if (isCom) {
      try {
        // 1. プレイヤー命令をエンジン形式に変換
        // ※ hasBallをスナップショット（ターン開始時）から復元してエンジンに渡す
        // PASS_BALL/THROUGH_PASSがクライアント側でhasBallを変更しているが、
        // エンジンはhasBallを見てパス/スルーパスを判定するため元の状態が必要
        const snapshotBallMap = new Map<string, boolean>();
        if (state.turnStartSnapshot) {
          for (const sp of state.turnStartSnapshot) snapshotBallMap.set(sp.id, sp.hasBall);
        }
        const fieldPieces = state.board.pieces.filter(p => !p.isBench).map(p => ({
          ...p,
          hasBall: snapshotBallMap.get(p.id) ?? p.hasBall,
        }));
        const homeOrders: EngineOrder[] = [...state.orders.values()]
          .map(o => clientOrderToEngine(o, fieldPieces));

        // 2. COM AI命令を生成（エンジン互換形式）
        const enginePieces = fieldPieces.map(toEnginePiece);
        const comResult = generateRuleBasedOrders({
          pieces: enginePieces,
          myTeam: 'away',
          scoreHome: state.scoreHome,
          scoreAway: state.scoreAway,
          turn: state.turn,
          maxTurn: HALF_TURNS * 2 + state.additionalTime1 + state.additionalTime2,
          remainingSubs: MAX_SUBSTITUTIONS,
          benchPieces: [],
          maxFieldCost: MAX_FIELD_COST,
        });
        const awayOrders: EngineOrder[] = comResult.orders;
        console.log(`[Battle] COM AI: strategy=${comResult.strategy}, orders=${awayOrders.length}`, awayOrders.map(o => `${o.pieceId}:${o.type}`).join(', '));

        // 3. エンジン Board 構築
        const board: EngineBoard = { pieces: enginePieces, snapshot: [], freeBallHex: state.board.freeBallHex ?? null };

        // 4. processTurn 実行（Phase0〜3: 移動→タックル→ファウル→シュート→パスカット→オフサイド）
        const turnResult = processTurn(board, homeOrders, awayOrders, boardContext);

        // 5. ゴール判定 → スコア更新
        const goalScored = hasGoal(turnResult.events);
        let newScoreHome = state.scoreHome;
        let newScoreAway = state.scoreAway;
        let scorerTeam: Team | null = null;

        if (goalScored) {
          const shootEv = turnResult.events.find(
            (e): e is ShootEvent => e.type === 'SHOOT' && e.result.outcome === 'goal',
          );
          if (shootEv) {
            const shooter = fieldPieces.find(p => p.id === shootEv.shooterId);
            if (shooter?.team === 'home') { newScoreHome++; scorerTeam = 'home'; }
            else { newScoreAway++; scorerTeam = 'away'; }
          }
        }
        goalScoredRef.current = { scored: goalScored, scorerTeam };

        // 6. エンジン結果をクライアント形式に変換（ベンチコマを保持）
        const newFieldPieces = enginePiecesToClient(turnResult.board.pieces, state.board.pieces);
        const benchPieces = state.board.pieces.filter(p => p.isBench);
        const newPieces = [...newFieldPieces, ...benchPieces];

        // 7. イベントログ保存
        setEvents(turnResult.events as unknown as GameEvent[]);
        cumulativeEventsRef.current = [...cumulativeEventsRef.current, ...(turnResult.events as unknown as GameEvent[])];
        resolvingEventsRef.current = turnResult.events;

        // 7b. ボール軌跡用のデータ準備（Phase3再生で段階的に表示）
        const postPieces = turnResult.board.pieces;
        const prePieces = fieldPieces; // 移動前のコマ配列
        const trails: BallTrail[] = [];
        // 初期軌跡はPhase3で段階的に追加するため、ここではクリア
        setBallTrails([]);

        // 8. スナップショットに巻き戻し → EXECUTION再生
        if (state.turnStartSnapshot) {
          dispatch({ type: 'SET_DISPLAY_PIECES', pieces: state.turnStartSnapshot });
        }
        dispatch({ type: 'SET_TURN_PHASE', phase: 'EXECUTION' });

        clearReplayTimers();
        const evts = turnResult.events;

        // === 非同期イベント再生 ===
        const wait = (ms: number) => new Promise<void>(r => { replayTimerRef.current = setTimeout(r, Math.round(ms / animSpeed)); });

        (async () => {
          // Phase0: 全コマ同時移動（0.3秒待ち → APPLY_ENGINE_RESULT → CSS transition 0.8秒）
          setResolvingPhase(0);
          await wait(300);
          dispatch({
            type: 'APPLY_ENGINE_RESULT',
            pieces: newPieces,
            scoreHome: newScoreHome,
            scoreAway: newScoreAway,
            freeBallHex: turnResult.board.freeBallHex ?? null,
          });
          await wait(800); // CSS transition完了を待つ

          // ドリブル軌跡を追加（移動完了後に表示）
          for (const ev of evts) {
            if (ev.type === 'PIECE_MOVED') {
              const movedEv = ev as import('../../engine/types').PieceMovedEvent;
              const prePiece = prePieces.find(pp => pp.id === movedEv.pieceId);
              if (prePiece && prePiece.hasBall) {
                trails.push({ from: movedEv.from, to: movedEv.to, type: 'dribble', result: 'success' });
              }
            }
          }
          if (trails.length > 0) setBallTrails([...trails]);

          // Phase1: 競合・タックル
          setResolvingPhase(1);
          const p1Effects: typeof phaseEffects = [];
          for (const ev of evts) {
            if (ev.type === 'COLLISION') {
              const ce = ev as CollisionEvent;
              p1Effects.push({ coord: ce.coord, icon: '💪', color: '#fff', text: '' });
              p1Effects.push({ coord: ce.coord, icon: '💫', color: '#aaa', text: '' });
            }
            if (ev.type === 'TACKLE') {
              const te = ev as TackleEvent;
              if (te.result.success) {
                p1Effects.push({ coord: te.coord, icon: '⚔', color: '#fff', text: 'TACKLE' });
                const tkr = te.result.tackler;
                showOverlay('TACKLE!', {
                  subText: `${tkr.position} \u2605${tkr.cost}`,
                  duration: 1000, fontSize: 48,
                });
                soundManager.play('tackle');
              } else {
                p1Effects.push({ coord: te.coord, icon: '💨', color: '#00cccc', text: 'BREAK' });
                showOverlay('BREAKTHROUGH!', { duration: 800, color: '#00dddd', fontSize: 40 });
              }
            }
          }
          setPhaseEffects(p1Effects);
          if (p1Effects.length > 0) await wait(500);

          // Phase2: ファウル
          setResolvingPhase(2);
          const p2Effects: typeof phaseEffects = [];
          for (const ev of evts) {
            if (ev.type === 'FOUL') {
              const fe = ev as EngineFoulEvent;
              p2Effects.push({ coord: fe.coord, icon: '🟨', color: '#ffcc00', text: 'FOUL' });
              showOverlay('FOUL!', {
                subText: fe.result.outcome === 'pk' ? 'PK' : 'FK',
                duration: 1500, color: '#FACC15', fontSize: 48,
              });
              soundManager.play('foul');
            }
          }
          setPhaseEffects(p2Effects);
          if (p2Effects.length > 0) await wait(500);

          // Phase3: ボール移動（パス/シュート）— FlyingBall で順番に再生
          setResolvingPhase(3);
          setPhaseEffects([]);
          // オフサイドイベントを先に検索（パス直後に表示するため）
          const offsideEv = evts.find((e): e is OffsideEvent => e.type === 'OFFSIDE');
          for (const ev of evts) {
            if (ev.type === 'PASS_DELIVERED') {
              const pe = ev as PassDeliveredEvent;
              const passer = postPieces.find(pp => pp.id === pe.passerId);
              if (passer) {
                // 軌跡を先に表示（ボール飛行と同時に線が見える）
                trails.push({ from: passer.coord, to: pe.receiverCoord, type: 'pass', result: 'success' });
                setBallTrails([...trails]);
                soundManager.play('pass');
                // ボール飛行アニメーション
                await launchFlyingBall(passer.coord, pe.receiverCoord, 'pass');
                // パス直後にオフサイド判定結果を表示（同ターン内で即時）
                if (offsideEv) {
                  const receiver = turnResult.board.pieces.find(p => p.id === offsideEv.receiverId);
                  const coord = receiver?.coord ?? { col: 10, row: 16 };
                  setPhaseEffects([{ coord, icon: '🚩', color: '#ffcc00', text: 'OFFSIDE' }]);
                  showOverlay('OFFSIDE!', { duration: 1200, color: '#FACC15', fontSize: 48 });
                  await wait(800);
                  setPhaseEffects([]);
                }
                await wait(150);
              }
            }
            if (ev.type === 'SHOOT') {
              const se = ev as ShootEvent;
              const shooter = postPieces.find(pp => pp.id === se.shooterId);
              if (shooter) {
                const goalRow = shooter.team === 'home' ? 33 : 0;
                const goalCoord = { col: 10, row: goalRow };
                const result = se.result.outcome === 'goal' ? 'goal' as const
                  : se.result.outcome === 'blocked' ? 'blocked' as const
                  : (se.result.outcome === 'saved_catch' || se.result.outcome === 'saved_ck') ? 'saved' as const
                  : 'success' as const;
                // 軌跡を先に表示
                trails.push({ from: shooter.coord, to: goalCoord, type: 'shoot', result });
                setBallTrails([...trails]);
                soundManager.play('shoot');
                // ボール飛行アニメーション
                await launchFlyingBall(shooter.coord, goalCoord, 'shoot');
                // 結果演出
                if (se.result.outcome === 'goal') {
                  soundManager.play('goal');
                } else if (se.result.outcome === 'blocked') {
                  showOverlay('BLOCKED!', { duration: 800, fontSize: 44 });
                } else if (se.result.outcome === 'saved_catch') {
                  const gk = postPieces.find(pp => pp.position === 'GK' && pp.team !== shooter.team);
                  showOverlay('GK CATCH!', { duration: 800, color: '#22C55E', fontSize: 40 });
                } else if (se.result.outcome === 'saved_ck') {
                  const gk = postPieces.find(pp => pp.position === 'GK' && pp.team !== shooter.team);
                  showOverlay('GREAT SAVE!', {
                    subText: gk ? `GK \u2605${gk.cost}` : undefined,
                    duration: 1200, color: '#22C55E', fontSize: 48,
                  });
                }
                await wait(400);
              }
            }
          }

          // Phase4: パスカット/オフサイド
          setResolvingPhase(4);
          const p4Effects: typeof phaseEffects = [];
          for (const ev of evts) {
            if (ev.type === 'PASS_CUT') {
              const pc = ev as PassCutEvent;
              const passer = postPieces.find(pp => pp.id === pc.passerId);
              const interceptorId = pc.result.cut1?.interceptor?.id ?? pc.result.cut2?.interceptor?.id;
              const interceptor = interceptorId ? turnResult.board.pieces.find(p => p.id === interceptorId) : null;
              if (passer && interceptor) {
                // 軌跡を先に表示 → ボール飛行
                trails.push({ from: passer.coord, to: interceptor.coord, type: 'passCut', result: 'cut' });
                setBallTrails([...trails]);
                await launchFlyingBall(passer.coord, interceptor.coord, 'pass');
              }
              const coord = interceptor?.coord ?? { col: 10, row: 16 };
              p4Effects.push({ coord, icon: '✋', color: '#ff8800', text: 'INTERCEPTED' });
              showOverlay('BALL CUT!', {
                subText: interceptor ? `${interceptor.position} \u2605${interceptor.cost}` : undefined,
                duration: 1200, fontSize: 48,
              });
              soundManager.play('tackle');
            }
            // オフサイドはPhase3（パス直後）で表示済み
          }
          setPhaseEffects(p4Effects);
          if (p4Effects.length > 0) await wait(500);

          // フリーボール発生チェック
          for (const ev of evts) {
            if (ev.type === 'LOOSE_BALL') {
              showOverlay('LOOSE BALL!', { duration: 1000, fontSize: 40 });
              await wait(400);
            }
          }

          // 全フェーズ完了
          setResolvingPhase(-1);
          setPhaseEffects([]);

          // 軌跡を1秒表示してからクリア
          await wait(800);
          setBallTrails([]);

          // A7: FK/PK ミニゲーム遷移
          const foulEv = evts.find((e): e is EngineFoulEvent => e.type === 'FOUL');
          if (foulEv && foulEv.result.occurred) {
            // ファウルしたのはtackler側 → ファウルされた側（ドリブラー側）がキッカー
            const tacklerTeam: Team = foulEv.tacklerId.startsWith('h') ? 'home' : 'away';
            const fouledTeam: Team = tacklerTeam === 'home' ? 'away' : 'home';
            const isMyTeamFouled = fouledTeam === state.myTeam;

            const kickerPiece = fieldPieces.find(p =>
              p.team === fouledTeam && p.hasBall,
            ) ?? fieldPieces.find(p => p.team === fouledTeam && p.position === 'FW')
              ?? fieldPieces.find(p => p.team === fouledTeam && !p.isBench)!;
            const gkPiece = fieldPieces.find(p =>
              p.team === tacklerTeam && p.position === 'GK',
            ) ?? fieldPieces.find(p => p.team === tacklerTeam && !p.isBench)!;

            if (foulEv.result.outcome === 'pk') {
              setMiniGame({
                type: 'pk', coord: foulEv.coord,
                kickerPiece: kickerPiece ?? fieldPieces[0],
                gkPiece: gkPiece ?? fieldPieces[0],
                isKicker: isMyTeamFouled,
                fouledTeam,
              });
              setMiniGameCountdown(MINIGAME_FK_PK_COUNTDOWN);
              clearReplayTimers(); // 安全タイムアウトをキャンセル
              return;
            } else if (foulEv.result.outcome === 'fk') {
              setMiniGame({
                type: 'fk', coord: foulEv.coord,
                kickerPiece: kickerPiece ?? fieldPieces[0],
                gkPiece: gkPiece ?? fieldPieces[0],
                isAttacker: isMyTeamFouled,
                fouledTeam,
              });
              setMiniGameCountdown(MINIGAME_FK_PK_COUNTDOWN);
              clearReplayTimers(); // 安全タイムアウトをキャンセル
              return;
            }
          }

          // A7: CK遷移
          const ckShoot = evts.find(
            (e): e is ShootEvent => e.type === 'SHOOT' && e.result.outcome === 'saved_ck',
          );
          if (ckShoot) {
            const ckAttackTeam: Team = ckShoot.shooterId.startsWith('h') ? 'home' : 'away';
            const isMyAttack = ckAttackTeam === state.myTeam;
            const attackPieces = fieldPieces
              .filter(p => p.team === state.myTeam && p.position !== 'GK')
              .slice(0, 5);
            setMiniGame({ type: 'ck', isAttacker: isMyAttack, pieces: attackPieces, attackTeam: ckAttackTeam });
            setMiniGameCountdown(MINIGAME_CK_COUNTDOWN);
            clearReplayTimers(); // 安全タイムアウトをキャンセル
            return;
          }

          // A6: ゴール判定
          dispatch({ type: 'SET_TURN_PHASE', phase: 'EVENT' });
          // リプレイ正常完了 → 安全タイマーをクリア（二重NEXT_TURN防止）
          clearReplayTimers();
          if (goalScoredRef.current.scored) {
            showOverlay('GOAL!!', {
              subText: `${newScoreHome} - ${newScoreAway}`,
              duration: 2500, color: '#FFD700', fontSize: 64, glow: true,
            });
            setCeremony('goal');
            await wait(GOAL_CEREMONY_MS);
            setCeremony(null);
            const kickoff = goalScoredRef.current.scorerTeam === 'home' ? 'away' : 'home';
            const resetPieces = createGoalRestartPieces(formationData, kickoff);
            goalScoredRef.current = { scored: false, scorerTeam: null };
            dispatch({
              type: 'SET_BOARD',
              board: { pieces: resetPieces },
              turn: state.turn,
              scoreHome: newScoreHome,
              scoreAway: newScoreAway,
            });
            dispatch({ type: 'NEXT_TURN' });
          } else {
            dispatch({ type: 'SET_TURN_PHASE', phase: 'TURN_END' });
            await wait(500);
            dispatch({ type: 'NEXT_TURN' });
          }
        })();

        // 安全タイムアウト（async再生が何らかの理由で止まった場合）
        replaySafetyRef.current = setTimeout(() => {
          console.warn(`[Battle] Safety timeout (${SAFETY_TIMEOUT_MS}ms): forcing NEXT_TURN`);
          replaySafetyRef.current = null;
          goalScoredRef.current = { scored: false, scorerTeam: null };
          setResolvingPhase(-1);
          setPhaseEffects([]);
          setBallTrails([]);
          setFlyingBall(null);
          setMiniGame(null);
          clearReplayTimers();
          dispatch({ type: 'NEXT_TURN' });
        }, SAFETY_TIMEOUT_MS);

      } catch (e) {
        console.error('[Battle] processTurn error:', e);
        dispatch({ type: 'NEXT_TURN' });
        clearReplayTimers();
      }
    } else {
      // ── オンライン対戦: TURN_INPUT をWebSocket送信 ──
      const currentSeq = sequenceRef.current;
      sequenceRef.current++;

      const rawOrders = [...state.orders.values()].map(order => ({
        piece_id: order.pieceId,
        action: order.action ?? 'move',
        target_hex: order.targetHex ? [order.targetHex.col, order.targetHex.row] as [number, number] : undefined,
        target_piece: order.targetPieceId,
        bench_piece: order.benchPieceId,
      }));

      const turnInput = {
        type: 'TURN_INPUT',
        match_id: matchId ?? '',
        turn: state.turn,
        player_id: '', // サーバー側はWS attachmentから取得するため空でも可
        sequence: currentSeq,
        nonce: `${matchId}_${state.turn}_${Date.now()}`,
        orders: rawOrders,
        client_hash: '', // TODO: 盤面ハッシュ
        timestamp: Date.now(),
      };

      wsSend(turnInput);
    }
    if (isMobile && navigator.vibrate) {
      navigator.vibrate([50, 30, 50]);
    }
  }, [isCom, matchId, state, dispatch, isMobile, wsSend, boardContext, formationData, clearReplayTimers]);

  const handleTimeout = useCallback(() => {
    handleConfirm();
  }, [handleConfirm]);

  const handleSetMode = useCallback(
    (mode: ActionMode) => {
      dispatch({ type: 'SET_ACTION_MODE', mode });
    },
    [dispatch],
  );

  const handleSubstitute = useCallback(
    (fieldPieceId: string, benchPieceId: string) => {
      dispatch({
        type: 'ADD_ORDER',
        order: { pieceId: fieldPieceId, action: 'substitute', benchPieceId },
      });
    },
    [dispatch],
  );

  // ── A7: ミニゲームカウントダウン ──
  useEffect(() => {
    if (!miniGame) return;
    if (miniGameCountdown <= 0) return;
    const t = setTimeout(() => setMiniGameCountdown(prev => prev - 1), MINIGAME_COUNTDOWN_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [miniGame, miniGameCountdown]);

  // ── A7: FK/PKミニゲーム完了ハンドラ（ゾーン対決を解決してボール所持者を設定） ──
  const handleFKComplete = useCallback((data: import('../components/minigame/FKGame').FKInput) => {
    if (!miniGame || miniGame.type !== 'fk') return;
    const { kickerPiece, gkPiece, fouledTeam } = miniGame;
    const defenseTeam: Team = fouledTeam === 'home' ? 'away' : 'home';

    // COM守備のゾーン選択（ランダム）
    const comZone = Math.floor(Math.random() * 6);
    const attackerZone = data.zone;
    // GKがゾーンを当てたらセーブ、外したらゴール方向に飛ぶ（キッカーコスト依存で成功率）
    const gkGuessedRight = attackerZone === comZone;

    let kickSuccess: boolean;
    if (gkGuessedRight) {
      // GKが正しい方向 → キッカーコスト×15% でもゴール（パワーで抜ける）
      kickSuccess = Math.random() < kickerPiece.cost * 0.15;
    } else {
      // GKが外した → キッカーコスト×20+30 % でゴール（枠に入るか）
      kickSuccess = Math.random() < Math.min(0.95, kickerPiece.cost * 0.20 + 0.30);
    }
    // ロブはGK正解時にセーブ率低下
    if (data.kickType === 'lob' && gkGuessedRight) {
      kickSuccess = kickSuccess || Math.random() < 0.25;
    }

    const currentPieces = state.board.pieces;
    let newHolderId: string | null;
    let newScoreHome = state.scoreHome;
    let newScoreAway = state.scoreAway;

    if (kickSuccess) {
      // FK直接ゴール → スコア加算 + ゴールリスタート
      if (fouledTeam === 'home') newScoreHome++; else newScoreAway++;
      showOverlay('GOAL!!', { subText: `${newScoreHome} - ${newScoreAway}`, duration: 2500, color: '#FFD700', fontSize: 64, glow: true });
      const kickoff = fouledTeam === 'home' ? 'away' : 'home';
      const resetPieces = createGoalRestartPieces(formationData, kickoff);
      setMiniGame(null);
      setMiniGameCountdown(MINIGAME_FK_PK_COUNTDOWN);
      dispatch({
        type: 'SET_BOARD',
        board: { pieces: resetPieces },
        turn: state.turn,
        scoreHome: newScoreHome,
        scoreAway: newScoreAway,
      });
      dispatch({ type: 'NEXT_TURN' });
      clearReplayTimers();
      return;
    }

    // FK失敗 → GKがボール獲得
    const gk = currentPieces.find(p => p.team === defenseTeam && p.position === 'GK' && !p.isBench);
    newHolderId = gk?.id ?? currentPieces.find(p => p.team === defenseTeam && !p.isBench)?.id ?? null;
    showOverlay('GREAT SAVE!', { subText: `GK ★${gkPiece.cost}`, duration: 1200, color: '#4ade80', fontSize: 48 });

    const ballState = setBallHolder(currentPieces, newHolderId);
    setMiniGame(null);
    setMiniGameCountdown(MINIGAME_FK_PK_COUNTDOWN);
    dispatch({
      type: 'SET_BOARD',
      board: { pieces: ballState.pieces, freeBallHex: ballState.freeBallHex },
      turn: state.turn,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
    });
    dispatch({ type: 'NEXT_TURN' });
    clearReplayTimers();
  }, [miniGame, state, dispatch, clearReplayTimers, formationData, showOverlay]);

  const handlePKComplete = useCallback((zone: number) => {
    if (!miniGame || miniGame.type !== 'pk') return;
    const { kickerPiece, gkPiece, fouledTeam } = miniGame;
    const defenseTeam: Team = fouledTeam === 'home' ? 'away' : 'home';

    // COM側のゾーン選択（ランダム）
    const comZone = Math.floor(Math.random() * 6);
    const kickerZone = zone;
    const gkGuessedRight = kickerZone === comZone;

    let kickSuccess: boolean;
    if (gkGuessedRight) {
      // GKが正しい方向 → キッカーコスト×10% でゴール
      kickSuccess = Math.random() < kickerPiece.cost * 0.10;
    } else {
      // GKが外した → キッカーコスト×15+40 % でゴール（PK成功率高め）
      kickSuccess = Math.random() < Math.min(0.95, kickerPiece.cost * 0.15 + 0.40);
    }

    const currentPieces = state.board.pieces;
    let newScoreHome = state.scoreHome;
    let newScoreAway = state.scoreAway;

    if (kickSuccess) {
      // PKゴール
      if (fouledTeam === 'home') newScoreHome++; else newScoreAway++;
      showOverlay('GOAL!!', { subText: `${newScoreHome} - ${newScoreAway}`, duration: 2500, color: '#FFD700', fontSize: 64, glow: true });
      const kickoff = fouledTeam === 'home' ? 'away' : 'home';
      const resetPieces = createGoalRestartPieces(formationData, kickoff);
      setMiniGame(null);
      setMiniGameCountdown(MINIGAME_FK_PK_COUNTDOWN);
      dispatch({
        type: 'SET_BOARD',
        board: { pieces: resetPieces },
        turn: state.turn,
        scoreHome: newScoreHome,
        scoreAway: newScoreAway,
      });
      dispatch({ type: 'NEXT_TURN' });
      clearReplayTimers();
      return;
    }

    // PK失敗 → GKがボール獲得
    const gk = currentPieces.find(p => p.team === defenseTeam && p.position === 'GK' && !p.isBench);
    const newHolderId = gk?.id ?? currentPieces.find(p => p.team === defenseTeam && !p.isBench)?.id ?? null;
    showOverlay('GREAT SAVE!', { subText: `GK ★${gkPiece.cost}`, duration: 1200, color: '#4ade80', fontSize: 48 });

    const ballState = setBallHolder(currentPieces, newHolderId);
    setMiniGame(null);
    setMiniGameCountdown(MINIGAME_FK_PK_COUNTDOWN);
    dispatch({
      type: 'SET_BOARD',
      board: { pieces: ballState.pieces, freeBallHex: ballState.freeBallHex },
      turn: state.turn,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
    });
    dispatch({ type: 'NEXT_TURN' });
    clearReplayTimers();
  }, [miniGame, state, dispatch, clearReplayTimers, formationData, showOverlay]);

  // ── A7: CKミニゲーム完了ハンドラ（ゾーン対決を解決してボール所持者を設定） ──
  const handleCKComplete = useCallback((data: import('../components/minigame/CKGame').CKInput) => {
    if (!miniGame || miniGame.type !== 'ck') return;

    const attackTeam = miniGame.attackTeam;
    const defenseTeam: Team = attackTeam === 'home' ? 'away' : 'home';
    const currentPieces = state.board.pieces;

    // 守備側のゾーン配置をランダム生成（COM対戦）
    const defFieldPieces = currentPieces.filter(
      p => p.team === defenseTeam && !p.isBench && p.position !== 'GK',
    );
    const defSelected = defFieldPieces
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 3);
    const defZones: Array<'near' | 'center' | 'far'> = ['near', 'center', 'far'];
    // シャッフル
    for (let i = defZones.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [defZones[i], defZones[j]] = [defZones[j], defZones[i]];
    }
    const defPlacements = defSelected.map((p, i) => ({ pieceId: p.id, zone: defZones[i] }));

    // ゾーン対決: 各ゾーンで攻撃コマ vs 守備コマのコスト比較
    let attackWins = 0;
    for (const zone of ['near', 'center', 'far'] as const) {
      const atkPlacement = data.placements.find(p => p.zone === zone);
      const defPlacement = defPlacements.find(p => p.zone === zone);
      const atkCost = atkPlacement
        ? (miniGame.pieces.find(p => p.id === atkPlacement.pieceId)?.cost ?? 1)
        : 0;
      const defCost = defPlacement
        ? (defSelected.find(p => p.id === defPlacement.pieceId)?.cost ?? 1)
        : 0;

      if (atkCost > defCost) {
        attackWins++;
      } else if (atkCost === defCost) {
        // 同コスト → 50%で攻撃勝利
        if (Math.random() < 0.5) attackWins++;
      }
    }

    // 2ゾーン以上勝てば攻撃側がボール獲得、それ以外は守備側GKがボール獲得
    const attackerWon = attackWins >= 2;
    const ballTeam = attackerWon ? attackTeam : defenseTeam;

    // ボール保持者を設定: 勝った側の適切なコマ
    let newHolderId: string | null = null;
    if (attackerWon) {
      // 攻撃成功: 攻撃側FWまたは最初のFP
      const candidate = currentPieces.find(p => p.team === ballTeam && p.position === 'FW' && !p.isBench)
        ?? currentPieces.find(p => p.team === ballTeam && !p.isBench && p.position !== 'GK');
      newHolderId = candidate?.id ?? null;
    } else {
      // 守備成功: GKがボール獲得
      const gk = currentPieces.find(p => p.team === ballTeam && p.position === 'GK' && !p.isBench);
      newHolderId = gk?.id ?? currentPieces.find(p => p.team === ballTeam && !p.isBench)?.id ?? null;
    }

    // ボール状態を更新
    const ballState = setBallHolder(currentPieces, newHolderId);
    dispatch({
      type: 'SET_BOARD',
      board: { pieces: ballState.pieces, freeBallHex: ballState.freeBallHex },
      turn: state.turn,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
    });

    setMiniGame(null);
    setMiniGameCountdown(MINIGAME_CK_COUNTDOWN);
    dispatch({ type: 'NEXT_TURN' });
    clearReplayTimers();
  }, [miniGame, state.board.pieces, state.turn, state.scoreHome, state.scoreAway, dispatch, clearReplayTimers]);

  // PC: 右クリックコンテキストメニュー（§3-2）
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      e.preventDefault();
      // ボード座標からコマを探す（HexBoardがclickで処理済みなので、ここではselectされたコマに対してメニュー表示）
      if (state.selectedPieceId) {
        setContextMenu({ x: e.clientX, y: e.clientY, pieceId: state.selectedPieceId });
      }
    },
    [isMobile, state.selectedPieceId],
  );

  // ================================================================
  // 切断バナー（§4-4）
  // ================================================================
  const disconnectBannerEl = disconnectBanner && (
    <div style={{
      padding: '6px 16px',
      background: disconnectBanner.includes('復帰') ? '#2a8a2a' : '#cc8800',
      color: '#fff',
      fontSize: 13,
      textAlign: 'center',
      flexShrink: 0,
    }}>
      {disconnectBanner}
    </div>
  );

  // ── 演出オーバーレイ（共通） ──
  const ceremonyEl = ceremony && (
    <>
      <style>{`
        @keyframes fcms-slide-up { 0% { opacity:0; transform:translate(-50%,-40%) translateY(40px); } 20% { opacity:1; transform:translate(-50%,-50%) translateY(0); } 80% { opacity:1; } 100% { opacity:0; } }
        @keyframes fcms-scale-in { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.5); } 25% { opacity:1; transform:translate(-50%,-50%) scale(1.08); } 40% { transform:translate(-50%,-50%) scale(1); } 100% { opacity:1; transform:translate(-50%,-50%) scale(1); } }
        @keyframes fcms-scale-out { 0% { opacity:1; transform:translate(-50%,-50%) scale(1); } 100% { opacity:0; transform:translate(-50%,-50%) scale(0.8); } }
        @keyframes fcms-turn-flash { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.8); } 30% { opacity:1; transform:translate(-50%,-50%) scale(1); } 100% { opacity:0; transform:translate(-50%,-50%) scale(1); } }
        @keyframes fcms-whistle { 0%,100% { transform:translate(-50%,-50%); } 10% { transform:translate(-48%,-50%); } 20% { transform:translate(-52%,-50%); } 30% { transform:translate(-49%,-50%); } 40% { transform:translate(-51%,-50%); } 50% { transform:translate(-50%,-50%); } }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0,
        background: ceremony === 'turn' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.7)',
        zIndex: 200,
        pointerEvents: ceremony === 'fulltime' && showResultBtn ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* ── KICK OFF ── */}
        {ceremony === 'kickoff' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-slide-up 2.5s ease-out forwards',
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              KICK OFF
            </div>
            <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8, fontWeight: 600 }}>
              1st Half
            </div>
          </div>
        )}

        {/* ── KICK OFF 2nd Half ── */}
        {ceremony === 'kickoff2nd' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-slide-up 2.5s ease-out forwards',
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              KICK OFF
            </div>
            <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8, fontWeight: 600 }}>
              2nd Half
            </div>
          </div>
        )}

        {/* ── HALF TIME ── */}
        {ceremony === 'halftime' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-scale-in 0.6s ease-out forwards',
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#FFD700', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              HALF TIME
            </div>
            <div style={{ fontSize: 28, color: '#fff', marginTop: 16, fontWeight: 700, letterSpacing: 6 }}>
              {state.scoreHome} - {state.scoreAway}
            </div>
          </div>
        )}

        {/* ── SECOND HALF ── */}
        {ceremony === 'secondhalf' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-scale-out 1.5s ease-out forwards',
          }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              SECOND HALF
            </div>
          </div>
        )}

        {/* ── FULL TIME ── */}
        {ceremony === 'fulltime' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-whistle 0.5s ease-out, fcms-scale-in 0.6s ease-out forwards',
          }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              FULL TIME
            </div>
            <div style={{ fontSize: 32, color: '#fff', marginTop: 16, fontWeight: 700, letterSpacing: 6 }}>
              {state.scoreHome} - {state.scoreAway}
            </div>
            {showResultBtn && (
              <button
                onClick={() => {
                  if (onMatchEnd) {
                    const allEvts = cumulativeEventsRef.current;
                    const stats = computeStats(allEvts, state.turn);
                    const mvp = computeMvp(allEvts);
                    // Enrich MVP with piece data
                    if (mvp) {
                      const piece = state.board.pieces.find(p => p.id === mvp.pieceId);
                      if (piece) {
                        mvp.position = piece.position;
                        mvp.cost = piece.cost;
                      }
                    }
                    onMatchEnd({
                      scoreHome: state.scoreHome,
                      scoreAway: state.scoreAway,
                      myTeam: state.myTeam,
                      reason: 'completed',
                      stats,
                      mvp,
                    });
                  } else {
                    onNavigate('result');
                  }
                }}
                style={{
                  marginTop: 24, padding: '10px 32px', borderRadius: 8, border: 'none',
                  background: '#16a34a', color: '#fff', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', pointerEvents: 'auto',
                }}
              >
                結果を見る
              </button>
            )}
          </div>
        )}

        {/* ── GOAL! ── */}
        {ceremony === 'goal' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-scale-in 0.6s ease-out forwards',
          }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: '#FFD700', letterSpacing: 4, textShadow: '0 4px 32px rgba(255,215,0,0.5), 0 2px 24px rgba(0,0,0,0.8)' }}>
              GOAL!
            </div>
            <div style={{ fontSize: 28, color: '#fff', marginTop: 16, fontWeight: 700, letterSpacing: 6 }}>
              {state.scoreHome} - {state.scoreAway}
            </div>
          </div>
        )}

        {/* ── 通常ターン切替 ── */}
        {ceremony === 'turn' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            animation: 'fcms-turn-flash 1.2s ease-out forwards',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', letterSpacing: 1, textShadow: '0 1px 12px rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}>
              Turn {state.turn}
            </div>
          </div>
        )}
      </div>
    </>
  );

  // ── ボール表示の排他制御 ──
  // FlyingBall飛行中 or freeBallHex存在時はコマのhasBallを抑制
  const displayPieces = useMemo(() => {
    if (flyingBall) {
      return state.board.pieces.map(p => p.hasBall ? { ...p, hasBall: false } : p);
    }
    return state.board.pieces;
  }, [state.board.pieces, flyingBall]);

  // ── アクションガイドテキスト ──
  const actionGuide = useMemo(() => {
    if (state.board.freeBallHex) return 'フリーボール！コマを移動させて拾いましょう';
    if (ballActionMenu) return 'パス or ドリブルを選んでください';
    if (!selectedPiece) return 'コマを選んでください';
    // パス済みコマを選択
    if (state.orders.has(selectedPiece.id)) {
      const order = state.orders.get(selectedPiece.id);
      if (order?.action === 'pass') return 'このコマはパス済みです';
      return '命令済み（取消可能）';
    }
    const hasBall = selectedPiece.hasBall;
    switch (state.actionMode) {
      case 'pass': return '味方=パス / 空きHEX=スルーパス / ゴール方向=シュート';
      case 'throughPass': return 'スルーパス先をタップ';
      case 'shoot': return 'シュート先をタップ';
      case 'dribble': return 'ドリブル先をタップ';
      case 'substitute': return '交代先のベンチを選択';
      default:
        if (hasBall) return 'コマ=ドリブル / ⚽=パス・シュート';
        return '移動先をタップ';
    }
  }, [selectedPiece, state.actionMode, state.orders, ballActionMenu, state.board.freeBallHex]);

  // ── A10: フェーズ別ラベル ──
  const phaseLabels = ['移動', '衝突判定', 'ファウル判定', 'ボール移動', 'パスカット/オフサイド'];

  // ── 実行中 / 相手待ちバナー ──
  const resolvingBannerEl = (isResolving || isWaiting) && (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      padding: '8px 0', textAlign: 'center',
      background: isResolving ? 'rgba(37,99,235,0.9)' : 'rgba(180,130,20,0.9)',
      color: '#fff', fontSize: 13, fontWeight: 600,
      zIndex: 190, pointerEvents: 'none',
    }}>
      {isResolving
        ? `実行${resolvingPhase >= 0 ? ` — ${phaseLabels[resolvingPhase] ?? ''}` : ''}`
        : '⏳ 相手の入力を待っています...'}
    </div>
  );

  // ── A7: ミニゲームオーバーレイ（共通） ──
  const miniGameEl = miniGame && (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {miniGame.type === 'fk' && (
        <FKGame
          isAttacker={miniGame.isAttacker}
          onSubmit={(data) => handleFKComplete(data)}
          isMobile={isMobile}
          countdown={miniGameCountdown}
          kickerInfo={{ position: miniGame.kickerPiece.position, cost: miniGame.kickerPiece.cost }}
          gkInfo={{ position: miniGame.gkPiece.position, cost: miniGame.gkPiece.cost }}
        />
      )}
      {miniGame.type === 'pk' && (
        <PKGame
          isKicker={miniGame.isKicker}
          isMobile={isMobile}
          onSubmit={(zone) => handlePKComplete(zone)}
          countdown={miniGameCountdown}
          kickerInfo={{ position: miniGame.kickerPiece.position, cost: miniGame.kickerPiece.cost }}
          gkInfo={{ position: miniGame.gkPiece.position, cost: miniGame.gkPiece.cost }}
        />
      )}
      {miniGame.type === 'ck' && (
        <CKGame
          isAttacker={miniGame.isAttacker}
          availablePieces={miniGame.pieces}
          onSubmit={(data) => handleCKComplete(data)}
          isMobile={isMobile}
          countdown={miniGameCountdown}
        />
      )}
    </div>
  );

  // ================================================================
  // スマホ UI（§2）
  // ================================================================
  if (isMobile) {
    const unorderedPieces = myPieces.filter((p) => !state.orders.has(p.id));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {ceremonyEl}
        {resolvingBannerEl}
        {disconnectBannerEl}
        {miniGameEl}
        {/* ヘッダー（44px）: スコア | 試合時間 | 残り時間 | 指示カウント */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          padding: '0 12px',
          background: 'rgba(20, 20, 40, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
          zIndex: 40,
        }}>
          {/* 左: スコア */}
          <span style={{ fontSize: 20, fontWeight: 'bold', letterSpacing: 1 }}>
            {state.scoreHome}<span style={{ color: '#555', margin: '0 3px' }}>-</span>{state.scoreAway}
          </span>

          {/* 中央: 試合時間（大きめ）+ 残り持ち時間（小さめ） */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 18, fontWeight: 800, letterSpacing: 1,
              color: turnInfo.isAT ? '#ff4444' : '#fff',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {turnInfo.label}
            </span>
            <Timer
              turnStartedAt={state.turnStartedAt}
              onTimeout={handleTimeout}
              isMobile={true}
              isAdditionalTime={turnInfo.isAT}
            />
          </div>

          {/* 右: 指示カウント */}
          <button
            onClick={() => setShowUnorderedList(!showUnorderedList)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#aaa',
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 'bold' }}>{orderedCount}</span>/{totalFieldPieces}
          </button>
        </div>

        {/* §2-2 未指示コマ一覧（展開時） */}
        {showUnorderedList && (
          <div style={{
            background: 'rgba(20, 20, 40, 0.98)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            padding: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            justifyContent: 'center',
            flexShrink: 0,
            zIndex: 35,
          }}>
            {unorderedPieces.length === 0 ? (
              <span style={{ fontSize: 12, color: '#666' }}>全コマ指示済み</span>
            ) : (
              unorderedPieces.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { handleSelectPiece(p.id); setShowUnorderedList(false); }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: POSITION_COLORS[p.position] }} />
                  {p.position}★{p.cost}
                </button>
              ))
            )}
          </div>
        )}

        {/* §2-1 メインエリア: HEXボード（画面の75%） */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }} ref={boardRef}>
          {/* INPUT以外のフェーズではピッチ全体を覆ってクリックをブロック + 暗転 */}
          {/* ただし試合終了/ハーフタイム/ミニゲーム中は非表示（演出UIのクリックを妨げない） */}
          {state.turnPhase !== 'INPUT' && !miniGame && state.status !== 'finished' && state.status !== 'halftime' && (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 250, cursor: 'not-allowed',
                background: 'rgba(0,0,0,0.45)',
              }}
              onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
              onClick={e => { e.stopPropagation(); e.preventDefault(); }}
            />
          )}
          <CenterOverlay queue={overlayQueue} onComplete={handleOverlayComplete} />
          <FlyingBall data={flyingBall} onComplete={handleFlyingBallComplete} />
          <HexBoard
            pieces={displayPieces}
            selectedPieceId={state.selectedPieceId}
            actionMode={state.actionMode}
            orders={state.orders}
            highlightHexes={highlightHexes}
            zocHexes={zocHexes}
            offsideLine={offsideLine}
            onSelectPiece={handleSelectPiece}
            onHexClick={handleHexClick}
            onBallClick={handleBallClick}
            chainBallPulseId={null}
            isMobile={true}
            myTeam={state.myTeam}
            flipY={state.myTeam === 'home'}
            shootRangeHexes={shootRangeHexes}
            longPassWarnings={longPassWarnings}
            phaseEffects={phaseEffects}
            ballTrails={ballTrails}
            freeBallHex={state.board.freeBallHex}
            ballActionMenu={state.turnPhase === 'INPUT' ? ballActionMenu : null}
            onActionPass={() => { dispatch({ type: 'SET_ACTION_MODE', mode: 'pass' }); setBallActionMenu(null); }}
            onActionDribble={() => { dispatch({ type: 'SET_ACTION_MODE', mode: 'dribble' }); setBallActionMenu(null); }}
            onActionCancel={() => { dispatch({ type: 'SELECT_PIECE', pieceId: null }); setBallActionMenu(null); }}
          />

          {/* A8: オフサイドライントグル削除済 */}

          {/* §2-6 クイック選択（右端の縦アイコン列） — 全未指示コマ表示 */}
          <div style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            zIndex: 30,
            maxHeight: '70%',
            overflowY: 'auto',
          }}>
            {unorderedPieces.map((piece) => (
              <button
                key={piece.id}
                onClick={(e) => { e.stopPropagation(); handleSelectPiece(piece.id); }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: `2px solid ${POSITION_COLORS[piece.position]}40`,
                  background: 'rgba(20,20,40,0.85)',
                  color: POSITION_COLORS[piece.position],
                  fontSize: 9,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                {piece.position}
              </button>
            ))}
          </div>

          {/* §2-3 相手コマ情報ポップアップ */}
          {opponentPopup && (
            <div
              onClick={() => setOpponentPopup(null)}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(30, 30, 50, 0.96)',
                borderRadius: 12,
                padding: 16,
                zIndex: 50,
                minWidth: 180,
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                textAlign: 'center',
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: POSITION_COLORS[opponentPopup.position], margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>
                {opponentPopup.position}
              </div>
              <div style={{ fontSize: 16, fontWeight: 'bold' }}>
                {opponentPopup.position} ★{opponentPopup.cost}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                ZOC: 隣接6HEX
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                タップで閉じる
              </div>
            </div>
          )}
        </div>

        {/* §2-4 アクションバー（60px）— 交代時ベンチスライドアップ付き */}
        <ActionBar
          selectedPiece={selectedPiece}
          actionMode={state.actionMode}
          hasOrders={state.orders.size > 0}
          remainingSubs={MAX_SUBSTITUTIONS}
          benchPieces={myBenchPieces}
          onUndo={() => dispatch({ type: 'UNDO_LAST_ORDER' })}
          onSetMode={handleSetMode}
          onConfirm={handleConfirm}
          onSubstitute={handleSubstitute}
        />

        {/* §2-5 情報バー（40px） — 選択状態 + アクションガイド */}
        <div style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          background: 'rgba(20, 20, 40, 0.95)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: 13,
          gap: 8,
          flexShrink: 0,
        }}>
          {selectedPiece ? (
            <>
              <span style={{ color: POSITION_COLORS[selectedPiece.position], fontWeight: 'bold' }}>
                {selectedPiece.position}★{selectedPiece.cost}
              </span>
              {selectedPiece.hasBall && <span style={{ color: '#8cf' }}>⚽</span>}
              <span style={{ color: '#64748b', fontSize: 11 }}>{actionGuide}</span>
            </>
          ) : (
            <span style={{ color: '#555' }}>{actionGuide}</span>
          )}
        </div>
      </div>
    );
  }

  // ================================================================
  // PC UI（§3）
  // ================================================================
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onContextMenu={handleContextMenu}
    >
      {ceremonyEl}
      {resolvingBannerEl}
      {disconnectBannerEl}
      {miniGameEl}

      {/* メインエリア: 左パネル + ボード + 右パネル */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* §3-4 左パネル（200px） */}
        <LeftPanel
          pieces={myPieces}
          benchPieces={myBenchPieces}
          orders={state.orders}
          selectedPieceId={state.selectedPieceId}
          onSelectPiece={handleSelectPiece}
        />

        {/* §3-1 中央ボード */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }} ref={boardRef}>
          {/* INPUT以外のフェーズではピッチ全体を覆ってクリックをブロック + 暗転 */}
          {/* ただし試合終了/ハーフタイム/ミニゲーム中は非表示（演出UIのクリックを妨げない） */}
          {state.turnPhase !== 'INPUT' && !miniGame && state.status !== 'finished' && state.status !== 'halftime' && (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 250, cursor: 'not-allowed',
                background: 'rgba(0,0,0,0.45)',
              }}
              onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
              onClick={e => { e.stopPropagation(); e.preventDefault(); }}
            />
          )}
          <CenterOverlay queue={overlayQueue} onComplete={handleOverlayComplete} />
          <FlyingBall data={flyingBall} onComplete={handleFlyingBallComplete} />
          <HexBoard
            pieces={displayPieces}
            selectedPieceId={state.selectedPieceId}
            actionMode={state.actionMode}
            orders={state.orders}
            highlightHexes={highlightHexes}
            zocHexes={zocHexes}
            offsideLine={offsideLine}
            onSelectPiece={handleSelectPiece}
            onHexClick={handleHexClick}
            onBallClick={handleBallClick}
            chainBallPulseId={null}
            isMobile={false}
            myTeam={state.myTeam}
            flipY={state.myTeam === 'home'}
            shootRangeHexes={shootRangeHexes}
            longPassWarnings={longPassWarnings}
            phaseEffects={phaseEffects}
            ballTrails={ballTrails}
            freeBallHex={state.board.freeBallHex}
            ballActionMenu={state.turnPhase === 'INPUT' ? ballActionMenu : null}
            onActionPass={() => { dispatch({ type: 'SET_ACTION_MODE', mode: 'pass' }); setBallActionMenu(null); }}
            onActionDribble={() => { dispatch({ type: 'SET_ACTION_MODE', mode: 'dribble' }); setBallActionMenu(null); }}
            onActionCancel={() => { dispatch({ type: 'SELECT_PIECE', pieceId: null }); setBallActionMenu(null); }}
          />

          {/* §3-2 右クリックコンテキストメニュー */}
          {contextMenu && (
            <div
              style={{
                position: 'fixed',
                left: contextMenu.x,
                top: contextMenu.y,
                background: 'rgba(30, 30, 50, 0.98)',
                borderRadius: 8,
                padding: 4,
                zIndex: 100,
                minWidth: 140,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {[
                { label: '移動', mode: 'move' as ActionMode, key: '' },
                { label: 'ドリブル (D)', mode: 'dribble' as ActionMode, key: 'D', needsBall: true },
                { label: 'パス (Q)', mode: 'pass' as ActionMode, key: 'Q', needsBall: true },
                { label: 'シュート (W)', mode: 'shoot' as ActionMode, key: 'W', needsBall: true },
                { label: '交代 (E)', mode: 'substitute' as ActionMode, key: 'E' },
              ].map((item) => {
                const disabled = item.needsBall && !selectedPiece?.hasBall;
                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (!disabled) dispatch({ type: 'SET_ACTION_MODE', mode: item.mode });
                      setContextMenu(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '7px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      color: disabled ? '#555' : '#ddd',
                      fontSize: 13,
                      cursor: disabled ? 'default' : 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{item.label}</span>
                    {item.key && <span style={{ fontSize: 11, color: '#666' }}>{item.key}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* §3-2 マウスオーバー相手コマツールチップ */}
          {tooltip && (
            <div
              style={{
                position: 'fixed',
                left: tooltip.x + 12,
                top: tooltip.y - 8,
                background: 'rgba(30, 30, 50, 0.95)',
                borderRadius: 6,
                padding: '6px 10px',
                zIndex: 80,
                fontSize: 12,
                color: '#ccc',
                boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                pointerEvents: 'none',
              }}
            >
              <span style={{ color: POSITION_COLORS[tooltip.piece.position], fontWeight: 'bold' }}>
                {tooltip.piece.position}
              </span>{' '}
              ★{tooltip.piece.cost}
              {tooltip.piece.hasBall && <span style={{ marginLeft: 6, color: '#8cf' }}>⚽</span>}
            </div>
          )}
        </div>

        {/* §3-5 右パネル（220px） */}
        <RightPanel
          orders={state.orders}
          pieces={state.board.pieces}
          events={events}
          turn={state.turn}
          onRemoveOrder={(pieceId) => dispatch({ type: 'REMOVE_ORDER', pieceId })}
        />
      </div>

      {/* §3-1 下部バー（40px） */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 40,
        padding: '0 16px',
        background: 'rgba(20, 20, 40, 0.95)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        gap: 16,
        flexShrink: 0,
      }}>
        {/* スコア */}
        <span style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: 1 }}>
          {state.scoreHome}<span style={{ color: '#555', margin: '0 3px' }}>-</span>{state.scoreAway}
        </span>

        {/* 試合時間（大きめ） */}
        <span style={{
          fontSize: 18, fontWeight: 800,
          color: turnInfo.isAT ? '#ff4444' : '#fff',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {turnInfo.label}
        </span>

        {/* 残り持ち時間 */}
        <Timer
          turnStartedAt={state.turnStartedAt}
          onTimeout={handleTimeout}
          isMobile={false}
          isAdditionalTime={turnInfo.isAT}
        />

        {/* 指示カウント */}
        <span style={{ fontSize: 13, color: '#aaa' }}>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{orderedCount}</span>/{totalFieldPieces} 指示済
        </span>

        {/* スペーサー */}
        <div style={{ flex: 1 }} />

        {/* アクションガイド + ショートカットヒント */}
        <span style={{ fontSize: 11, color: selectedPiece ? '#94a3b8' : '#555' }}>
          {selectedPiece ? actionGuide : 'D:ドリブル Q:パス W:シュート Z:戻す Space:確定'}
        </span>

        {/* ターン確定ボタン */}
        <button
          onClick={handleConfirm}
          disabled={isInputDisabled}
          style={{
            padding: '6px 20px',
            borderRadius: 6,
            border: 'none',
            background: isInputDisabled ? '#555' : '#44aa44',
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: isInputDisabled ? 'default' : 'pointer',
            opacity: isInputDisabled ? 0.6 : 1,
          }}
        >
          {isResolving ? '実行中...' : isWaiting ? '⏳ 相手の入力待ち' : '✓ ターン確定'}
        </button>
      </div>
    </div>
  );
}
