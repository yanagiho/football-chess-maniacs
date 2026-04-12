// ============================================================
// auto_play.ts — ルールベースAI同士の自動対戦（§3-1 Phase 1）
//
// 1試合30-36ターン（前後半15+AT各1-3） ≈ 2秒/試合。
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
  // home は row 33 方向に攻撃（ball.ts: GOAL_ROW.home = 33）
  // GK は自陣ゴール（row 0-1）付近、FWは中盤〜敵陣（row 19）付近
  const home: Array<{ pos: Position; cost: Cost; col: number; row: number }> = [
    { pos: 'GK', cost: 1,   col: 10, row: 1 },
    { pos: 'DF', cost: 1,   col: 7,  row: 5 },
    { pos: 'DF', cost: 1.5, col: 13, row: 5 },
    { pos: 'SB', cost: 1,   col: 4,  row: 6 },
    { pos: 'SB', cost: 1.5, col: 16, row: 6 },
    { pos: 'VO', cost: 2,   col: 10, row: 9 },
    { pos: 'MF', cost: 1,   col: 7,  row: 12 },
    { pos: 'MF', cost: 1.5, col: 13, row: 12 },
    { pos: 'OM', cost: 2,   col: 10, row: 15 },
    { pos: 'WG', cost: 1.5, col: 4,  row: 17 },
    { pos: 'FW', cost: 2.5, col: 10, row: 19 },
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

  // ボールは playMatch 側で giveBallTo で付与
  return pieces;
}

/** 指定チームの指定ポジションにボールを付与（全コマのhasBallをリセット後） */
function giveBallTo(pieces: Piece[], team: Team, position: Position): void {
  for (const p of pieces) p.hasBall = false;
  const target = pieces.find((p) => p.team === team && p.position === position);
  if (target) {
    target.hasBall = true;
  } else {
    // フォールバック: チーム内で誰かに付与
    const any = pieces.find((p) => p.team === team);
    if (any) any.hasBall = true;
  }
}

// ================================================================
// 試合結果の型
// ================================================================

/** 軽量サマリ（メモリに蓄積しても安全） */
export interface MatchSummary {
  matchId: string;
  scoreHome: number;
  scoreAway: number;
  totalTurns: number;
  winner: 'home' | 'away' | 'draw';
  durationMs: number;
}

/** 1ターンの記録 */
export interface TurnRecord {
  turn: number;
  boardBefore: Piece[];
  homeOrders: Order[];
  awayOrders: Order[];
  events: GameEvent[];
  boardAfter: Piece[];
  scoreHome: number;
  scoreAway: number;
}

/**
 * ターン毎のコールバック。
 * メモリに蓄積せず、1ターンずつストリーミング処理するために使う。
 */
export type TurnCallback = (record: TurnRecord, summary: MatchSummary) => void;

// ================================================================
// 自動対戦メイン
// ================================================================

/** 前半15ターン + AT最大3 + 後半15ターン + AT最大3 = 最大36ターン */
const TURNS_PER_HALF = 15;
const MAX_AT = 3;
const MAX_TURNS = (TURNS_PER_HALF + MAX_AT) * 2; // 36
const MAX_SUBS = 3;
const MAX_FIELD_COST = 16;

/**
 * §3-1 Phase 1: ルールベースAI同士の1試合を自動実行する。
 *
 * @param matchId         試合識別子
 * @param onTurn          ターン毎のコールバック
 * @param firstKickoff    前半キックオフ側（デフォルト'home'。交互にすることで公平性を確保）
 * @returns 試合サマリ
 */
export function playMatch(matchId: string, onTurn?: TurnCallback, firstKickoff: Team = 'home'): MatchSummary {
  const start = Date.now();
  const secondKickoff: Team = firstKickoff === 'home' ? 'away' : 'home';

  let pieces = createInitialPieces();
  giveBallTo(pieces, firstKickoff, 'FW');
  let board: Board = { pieces, snapshot: [] };
  let scoreHome = 0;
  let scoreAway = 0;

  // ボール所有権追跡（消失時のリカバリ用）
  let lastBallTeam: Team = firstKickoff;

  // 前半AT（1-3ターン、ランダム）
  const firstHalfAT = Math.floor(Math.random() * MAX_AT) + 1;
  const halfTimeTurn = TURNS_PER_HALF + firstHalfAT + 1; // 後半開始ターン
  // 後半AT
  const secondHalfAT = Math.floor(Math.random() * MAX_AT) + 1;
  const totalTurns = TURNS_PER_HALF + firstHalfAT + TURNS_PER_HALF + secondHalfAT;

  for (let turn = 1; turn <= totalTurns; turn++) {
    // ── ハーフタイム: 初期配置リセット + 後半キックオフ ──
    if (turn === halfTimeTurn) {
      pieces = createInitialPieces();
      giveBallTo(pieces, secondKickoff, 'FW');
      board = { pieces, snapshot: [] };
      lastBallTeam = secondKickoff;
    }

    const boardBefore = pieces.map((p) => ({ ...p }));

    // ── home AI ──
    const homeResult = generateRuleBasedOrders({
      pieces,
      myTeam: 'home',
      scoreHome,
      scoreAway,
      turn,
      maxTurn: totalTurns,
      remainingSubs: MAX_SUBS,
      benchPieces: [],
      maxFieldCost: MAX_FIELD_COST,
    });

    // ── away AI ──
    const awayResult = generateRuleBasedOrders({
      pieces,
      myTeam: 'away',
      scoreHome,
      scoreAway,
      turn,
      maxTurn: totalTurns,
      remainingSubs: MAX_SUBS,
      benchPieces: [],
      maxFieldCost: MAX_FIELD_COST,
    });

    // ── ターン実行 ──
    const turnResult: TurnResult = processTurn(
      board,
      homeResult.orders,
      awayResult.orders,
      boardContext,
    );

    // ── 得点チェック + 得点後キックオフ ──
    let goalScoredBy: Team | null = null;
    for (const event of turnResult.events) {
      if (event.type === 'SHOOT') {
        if (event.result.outcome === 'goal') {
          const shooter = boardBefore.find((p) => p.id === event.shooterId);
          if (shooter?.team === 'home') {
            scoreHome++;
            goalScoredBy = 'home';
          } else {
            scoreAway++;
            goalScoredBy = 'away';
          }
        }
      }
    }

    // ボード更新
    pieces = turnResult.board.pieces;
    board = turnResult.board;

    // ── 得点後: 初期配置リセット + 失点側キックオフ ──
    if (goalScoredBy) {
      const kickoffTeam: Team = goalScoredBy === 'home' ? 'away' : 'home';
      pieces = createInitialPieces();
      giveBallTo(pieces, kickoffTeam, 'FW');
      board = { pieces, snapshot: [] };
      lastBallTeam = kickoffTeam;
    }

    // ── ボール消失チェック: 直前にボールを持っていたチームの相手GKに付与（ゴールキック相当） ──
    if (!pieces.some((p) => p.hasBall)) {
      const recoveryTeam: Team = lastBallTeam === 'home' ? 'away' : 'home';
      giveBallTo(pieces, recoveryTeam, 'GK');
      lastBallTeam = recoveryTeam;
    } else {
      const holder = pieces.find((p) => p.hasBall);
      if (holder) lastBallTeam = holder.team;
    }

    // コールバック（ストリーミング処理）
    if (onTurn) {
      const summary: MatchSummary = {
        matchId, scoreHome, scoreAway, totalTurns: turn,
        winner: scoreHome > scoreAway ? 'home' : scoreAway > scoreHome ? 'away' : 'draw',
        durationMs: Date.now() - start,
      };
      onTurn(
        {
          turn,
          boardBefore,
          homeOrders: homeResult.orders,
          awayOrders: awayResult.orders,
          events: turnResult.events,
          boardAfter: pieces.map((p) => ({ ...p })),
          scoreHome,
          scoreAway,
        },
        summary,
      );
    }
  }

  return {
    matchId,
    scoreHome,
    scoreAway,
    totalTurns: totalTurns,
    winner: scoreHome > scoreAway ? 'home' : scoreAway > scoreHome ? 'away' : 'draw',
    durationMs: Date.now() - start,
  };
}
