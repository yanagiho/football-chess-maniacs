// ============================================================
// ai_context.ts — AI共通コンテキスト型
//
// rule_based.ts の巨大クロージャを分割するための共有コンテキスト。
// generateRuleBasedOrders 内で作成され、
// ball_holder_ai.ts / formation_ai.ts に渡される。
// ============================================================

import type { Piece, HexCoord, Order, Team } from '../engine/types';
import type { LegalAction, PieceLegalMoves } from './legal_moves';

/** 難易度パラメータ */
export interface DiffConfig {
  shootRange: number;
  maxPressers: number;
  skipRate: number;
  useZocPassBlock: boolean;
  relayMaxDist: number;
  pickBest: boolean;
}

/** ポジション別ライン行動範囲（attackDepth） */
export interface LineRangeOverride {
  attack: { min: number; max: number };
  defense: { min: number; max: number };
}

/** チーム戦術パラメータ（プリセットチーム用） */
export interface TeamTactics {
  /** ポジション別のライン範囲オーバーライド */
  lineRanges?: Partial<Record<string, LineRangeOverride>>;
  /** DiffConfig への部分オーバーライド */
  diffOverrides?: Partial<DiffConfig>;
}

/** AI関数間の共有コンテキスト */
export interface AiContext {
  myTeam: Team;
  myPieces: Piece[];
  opponents: Piece[];
  goalRow: number;
  ownGoalRow: number;
  fwd: number;
  diffConfig: DiffConfig;
  usedTargets: Set<string>;
  legalMap: Map<string, PieceLegalMoves>;

  // 座標変換
  toAttackDepth: (row: number) => number;
  fromAttackDepth: (depth: number) => number;

  // パス遮断チェック
  isPassBlockedByBody: (from: HexCoord, to: HexCoord) => boolean;
  isPassBlockedByZoc: (from: HexCoord, to: HexCoord) => boolean;

  // ライン行動範囲
  getLineRange: (position: string, attacking: boolean) => { min: number; max: number };
  getFilteredMoves: (pm: PieceLegalMoves, attacking: boolean) => LegalAction[];

  // 方向計算
  forwardness: (from: HexCoord, to: HexCoord) => number;

  // Order追加
  addOrder: (order: Order) => void;
}
