// ============================================================
// auto_play.ts — ルールベースAI同士の自動対戦（§3-1 Phase 1）
//
// 1試合90ターン×50ms/ターン ≈ 4.5秒/試合。
// ゲームエンジン (processTurn) + ルールベースAI (generateRuleBasedOrders)
// を組み合わせて完全な試合を自動実行する。
// ============================================================

import type {
  Piece, Board, Order, BoardContext, HexCoord, Zone, Lane,
  Team, Cost, Position, GameEvent, TurnResult,
} from '../../engine/types';
import { processTurn } from '../../engine/turn_processor';
import { generateRuleBasedOrders, type RuleBasedInput } from '../rule_based';
import hexMapData from '../../data/hex_map.json';

// ================================================================
// hex_map.json ベースの BoardContext
// ================================================================

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

const boardContext: BoardContext = {
  getZone(coord: HexCoord): Zone {
    return (hexLookup.get(`${coord.col},${coord.row}`)?.zone as Zone) ?? 'ミドルサードD';
  },
  getLane(coord: HexCoord): Lane {
    return (hexLookup.get(`${coord.col},${coord.row}`)?.lane as Lane) ?? 'センターレーン';
  },
  isValidHex({ col, row }: HexCoord): boolean {
    return col >= 0 && col <= 21 && row >= 0 && row <= 33;
  },
};

// ================================================================
// 初期フォーメーション（4-4-2）
// ================================================================

function createInitialPieces(): Piece[] {
  const home: Array<{ pos: Position; cost: Cost; col: number; row: number }> = [
    { pos: 'GK', cost: 1,   col: 10, row: 32 },
    { pos: 'DF', cost: 1,   col: 7,  row: 28 },
    { pos: 'DF', cost: 1.5, col: 13, row: 28 },
    { pos: 'SB', cost: 1,   col: 4,  row: 27 },
    { pos: 'SB', cost: 1.5, col: 16, row: 27 },
    { pos: 'VO', cost: 2,   col: 10, row: 24 },
    { pos: 'MF', cost: 1,   col: 7,  row: 21 },
    { pos: 'MF', cost: 1.5, col: 13, row: 21 },
    { pos: 'OM', cost: 2,   col: 10, row: 18 },
    { pos: 'WG', cost: 1.5, col: 4,  row: 16 },
    { pos: 'FW', cost: 2.5, col: 10, row: 14 },
  ];

  // away は盤面反転: row → 33 - row
  const pieces: Piece[] = [];

  for (let i = 0; i < home.length; i++) {
    const h = home[i];
    pieces.push({
      id: `h${String(i + 1).padStart(2, '0')}`,
      team: 'home',
      position: h.pos,
      cost: h.cost,
      coord: { col: h.col, row: h.row },
      hasBall: false,
    });
    pieces.push({
      id: `a${String(i + 1).padStart(2, '0')}`,
      team: 'away',
      position: h.pos,
      cost: h.cost,
      coord: { col: h.col, row: 33 - h.row },
      hasBall: false,
    });
  }

  // ボールをhome FWに付与（キックオフ）
  const homeFW = pieces.find((p) => p.team === 'home' && p.position === 'FW');
  if (homeFW) homeFW.hasBall = true;

  return pieces;
}

// ================================================================
// 試合結果の型
// ================================================================

export interface MatchResult {
  matchId: string;
  scoreHome: number;
  scoreAway: number;
  totalTurns: number;
  winner: 'home' | 'away' | 'draw';
  /** 全ターンの記録 */
  turnRecords: TurnRecord[];
  durationMs: number;
}

export interface TurnRecord {
  turn: number;
  /** ターン開始時のボード状態 */
  boardBefore: Piece[];
  /** home の指示 */
  homeOrders: Order[];
  /** away の指示 */
  awayOrders: Order[];
  /** ターン実行後のイベント */
  events: GameEvent[];
  /** ターン実行後のボード状態 */
  boardAfter: Piece[];
  scoreHome: number;
  scoreAway: number;
}

// ================================================================
// 自動対戦メイン
// ================================================================

const MAX_TURNS = 90;
const MAX_SUBS = 3;
const MAX_FIELD_COST = 16;

/**
 * §3-1 Phase 1: ルールベースAI同士の1試合を自動実行する。
 *
 * @param matchId  試合識別子
 * @returns 試合結果（全ターンの盤面→指示ペア含む）
 */
export function playMatch(matchId: string): MatchResult {
  const start = Date.now();

  let pieces = createInitialPieces();
  let board: Board = { pieces, snapshot: [] };
  let scoreHome = 0;
  let scoreAway = 0;
  let homeSubsRemaining = MAX_SUBS;
  let awaySubsRemaining = MAX_SUBS;

  const turnRecords: TurnRecord[] = [];

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const boardBefore = pieces.map((p) => ({ ...p }));

    // ── home AI ──
    const homeInput: RuleBasedInput = {
      pieces,
      myTeam: 'home',
      scoreHome,
      scoreAway,
      turn,
      maxTurn: MAX_TURNS,
      remainingSubs: homeSubsRemaining,
      benchPieces: [], // 簡略: ベンチなし（Phase 1 ではフル11枚で対戦）
      maxFieldCost: MAX_FIELD_COST,
    };
    const homeResult = generateRuleBasedOrders(homeInput);

    // ── away AI ──
    const awayInput: RuleBasedInput = {
      pieces,
      myTeam: 'away',
      scoreHome,
      scoreAway,
      turn,
      maxTurn: MAX_TURNS,
      remainingSubs: awaySubsRemaining,
      benchPieces: [],
      maxFieldCost: MAX_FIELD_COST,
    };
    const awayResult = generateRuleBasedOrders(awayInput);

    // ── ターン実行 ──
    const turnResult: TurnResult = processTurn(
      board,
      homeResult.orders,
      awayResult.orders,
      boardContext,
    );

    // ── 得点チェック ──
    for (const event of turnResult.events) {
      if (event.type === 'SHOOT') {
        if (event.result.outcome === 'goal') {
          const shooter = boardBefore.find((p) => p.id === event.shooterId);
          if (shooter?.team === 'home') scoreHome++;
          else scoreAway++;
        }
      }
    }

    // ボード更新
    pieces = turnResult.board.pieces;
    board = turnResult.board;

    turnRecords.push({
      turn,
      boardBefore,
      homeOrders: homeResult.orders,
      awayOrders: awayResult.orders,
      events: turnResult.events,
      boardAfter: pieces.map((p) => ({ ...p })),
      scoreHome,
      scoreAway,
    });

    // ボール消失チェック: 誰もボールを持っていない場合はhome GKに付与
    if (!pieces.some((p) => p.hasBall)) {
      const gk = pieces.find((p) => p.team === 'home' && p.position === 'GK');
      if (gk) gk.hasBall = true;
    }
  }

  const durationMs = Date.now() - start;

  return {
    matchId,
    scoreHome,
    scoreAway,
    totalTurns: MAX_TURNS,
    winner: scoreHome > scoreAway ? 'home' : scoreAway > scoreHome ? 'away' : 'draw',
    turnRecords,
    durationMs,
  };
}
