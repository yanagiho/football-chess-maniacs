// ============================================================
// evaluator.ts — 局面評価（§4 盤面スコアリング）
// ルールベース安全層が盤面を数値化する。
// Gemmaへの構造化データ提供 & フォールバック時の指示優先順位に使用。
// ============================================================

import type { Piece, Team, HexCoord, Zone, BoardContext } from '../engine/types';
import {
  hexKey,
  getNeighbors,
  buildZocMap,
} from '../engine/movement';
import hexMapData from '../data/hex_map.json';

// ── hex_map.json からゾーン情報を構築 ──

interface HexEntry {
  col: number;
  row: number;
  x: number;
  y: number;
  zone: string;
  lane: string;
}

const hexMap = hexMapData as HexEntry[];

const zoneByHex = new Map<string, Zone>();
for (const h of hexMap) {
  zoneByHex.set(`${h.col},${h.row}`, h.zone as Zone);
}

/** ゾーン→HEXキー一覧 */
const hexesByZone = new Map<Zone, Set<string>>();
for (const h of hexMap) {
  const z = h.zone as Zone;
  if (!hexesByZone.has(z)) hexesByZone.set(z, new Set());
  hexesByZone.get(z)!.add(`${h.col},${h.row}`);
}

/** ミドルサード全HEX（ZOC支配率計算用） */
const middleThirdHexes = new Set<string>();
for (const z of ['ミドルサードD', 'ミドルサードA'] as Zone[]) {
  const hexes = hexesByZone.get(z);
  if (hexes) for (const k of hexes) middleThirdHexes.add(k);
}

// ── ゾーン方向マッピング（home視点: row小=攻撃方向） ──
// away 視点ではゾーンが反転するため、ゾーン名を正規化する

/** home視点でのゾーン攻撃度スコア */
const ZONE_ATTACK_DIRECTION: Record<Zone, number> = {
  'ファイナルサード': 5,
  'アタッキングサード': 4,
  'ミドルサードA': 3,
  'ミドルサードD': 2,
  'ディフェンシブサード': 1,
  'ディフェンシブGサード': 0,
};

/**
 * ゾーンを自チーム攻撃方向に正規化。
 *
 * hex_map.json のゾーン名は絶対座標:
 *   row 0-5 = ディフェンシブGサード, row 28-33 = ファイナルサード
 *
 * home は row 33 方向に攻撃 → ファイナルサードが「攻撃最前線」→ そのまま
 * away は row 0 方向に攻撃 → ディフェンシブGサードが「攻撃最前線」→ 反転が必要
 */
function normalizeZone(zone: Zone, team: Team): Zone {
  if (team === 'home') return zone;
  // away はゾーン名を反転して「自チーム視点の攻撃度」に変換
  const flip: Record<Zone, Zone> = {
    'ファイナルサード': 'ディフェンシブGサード',
    'アタッキングサード': 'ディフェンシブサード',
    'ミドルサードA': 'ミドルサードD',
    'ミドルサードD': 'ミドルサードA',
    'ディフェンシブサード': 'アタッキングサード',
    'ディフェンシブGサード': 'ファイナルサード',
  };
  return flip[zone];
}

function getHexZone(coord: HexCoord): Zone {
  return zoneByHex.get(`${coord.col},${coord.row}`) ?? 'ミドルサードD';
}

// ── PA判定（GK評価用） ──

function isInsidePA(coord: HexCoord, team: Team): boolean {
  const { col, row } = coord;
  if (team === 'home') return col >= 7 && col <= 14 && row <= 4;
  return col >= 7 && col <= 14 && row >= 29;
}

// ================================================================
// §4-1 評価関数
// ================================================================

export interface EvaluationResult {
  /** 合計スコア */
  total: number;
  /** §4-2 ボール位置スコア */
  ballPosition: number;
  /** §4-3 コマ配置スコア */
  piecePlacement: number;
  /** §4-4 ZOC支配スコア */
  zocControl: number;
  /** §4-5 得点差・残りターンスコア */
  situational: number;
}

/**
 * §4 局面評価
 *
 * 自チーム視点で盤面を評価してスコアを返す。
 * 正の値が有利、負の値が不利。
 *
 * @param pieces     全コマ
 * @param myTeam     評価するチーム
 * @param scoreHome  ホームの得点
 * @param scoreAway  アウェイの得点
 * @param turn       現在のターン
 * @param maxTurn    最大ターン数
 */
export function evaluateBoard(
  pieces: Piece[],
  myTeam: Team,
  scoreHome: number,
  scoreAway: number,
  turn: number,
  maxTurn: number = 90,
): EvaluationResult {
  const opponentTeam: Team = myTeam === 'home' ? 'away' : 'home';

  const ballPosition = calcBallPositionScore(pieces, myTeam);
  const piecePlacement = calcPiecePlacementScore(pieces, myTeam);
  const zocControl = calcZocControlScore(pieces, myTeam, opponentTeam);
  const situational = calcSituationalScore(
    myTeam === 'home' ? scoreHome - scoreAway : scoreAway - scoreHome,
    turn,
    maxTurn,
  );

  return {
    total: ballPosition + piecePlacement + zocControl + situational,
    ballPosition,
    piecePlacement,
    zocControl,
    situational,
  };
}

// ================================================================
// §4-2 ボール位置スコア
// ================================================================

const BALL_ZONE_SCORE: Record<Zone, number> = {
  'ファイナルサード': 50,
  'アタッキングサード': 30,
  'ミドルサードA': 10,
  'ミドルサードD': -10,
  'ディフェンシブサード': -30,
  'ディフェンシブGサード': -50,
};

function calcBallPositionScore(pieces: Piece[], myTeam: Team): number {
  const ballHolder = pieces.find((p) => p.hasBall);
  if (!ballHolder) return 0;

  const rawZone = getHexZone(ballHolder.coord);
  const normalizedZone = normalizeZone(rawZone, ballHolder.team);

  // 自チーム保持ならそのままのスコア、相手保持なら反転
  const score = BALL_ZONE_SCORE[normalizedZone] ?? 0;
  return ballHolder.team === myTeam ? score : -score;
}

// ================================================================
// §4-3 コマ配置スコア
// ================================================================

/** ゾーンボーナス対象ポジションの判定マップ */
const ZONE_BONUS_POSITIONS: Record<string, Set<string>> = {
  'ファイナルサード': new Set(['FW', 'WG', 'OM']),
  'アタッキングサード': new Set(['FW', 'WG', 'OM']),
  'ディフェンシブサード': new Set(['DF', 'SB', 'VO']),
  'ディフェンシブGサード': new Set(['DF', 'SB', 'VO', 'GK']),
};

function calcPiecePlacementScore(pieces: Piece[], myTeam: Team): number {
  let score = 0;

  for (const piece of pieces) {
    if (piece.team !== myTeam) continue;

    const rawZone = getHexZone(piece.coord);
    const zone = normalizeZone(rawZone, myTeam);

    // §4-3: コマが自分のゾーンボーナス対象ゾーンにいる → +5
    // （簡易実装: 攻撃陣が前方、守備陣が後方にいれば+5）
    if (ZONE_BONUS_POSITIONS[zone]?.has(piece.position)) {
      score += 5;
    }

    // §4-3: FW/WG/OMがアタッキングサード以上 → +8
    if (
      (piece.position === 'FW' || piece.position === 'WG' || piece.position === 'OM') &&
      ZONE_ATTACK_DIRECTION[zone] >= ZONE_ATTACK_DIRECTION['アタッキングサード']
    ) {
      score += 8;
    }

    // §4-3: DF/SB/VOがディフェンシブサード以下 → +5
    if (
      (piece.position === 'DF' || piece.position === 'SB' || piece.position === 'VO') &&
      ZONE_ATTACK_DIRECTION[zone] <= ZONE_ATTACK_DIRECTION['ディフェンシブサード']
    ) {
      score += 5;
    }

    // §4-3: GK判定
    if (piece.position === 'GK') {
      if (isInsidePA(piece.coord, myTeam)) {
        score += 20;
      } else {
        score -= 30;
      }
    }
  }

  return score;
}

// ================================================================
// §4-4 ZOC支配スコア
// ================================================================

function calcZocControlScore(pieces: Piece[], myTeam: Team, opponentTeam: Team): number {
  // ミドルサード内の自チームZOCが覆うHEX数をカウント
  const myZocMap = buildZocMap(pieces, myTeam);
  const opZocMap = buildZocMap(pieces, opponentTeam);

  let myMiddleZocCount = 0;
  let opMiddleZocCount = 0;

  for (const hk of middleThirdHexes) {
    if (myZocMap.has(hk)) myMiddleZocCount++;
    if (opZocMap.has(hk)) opMiddleZocCount++;
  }

  const total = middleThirdHexes.size;
  if (total === 0) return 0;

  // §4-4: ZOC支配率 = 自チームのZOCが覆うミドルサードHEX数 / ミドルサード全HEX数
  const myRate = myMiddleZocCount / total;
  // §4-4: ZOC支配スコア = (ZOC支配率 − 0.5) × 40
  return (myRate - 0.5) * 40;
}

// ================================================================
// §4-5 得点差・残りターンスコア
// ================================================================

function calcSituationalScore(
  goalDiff: number,
  turn: number,
  maxTurn: number,
): number {
  let score = 0;
  const remainingTurns = maxTurn - turn;

  // §4-5: リード → 守備ボーナス+20 / ビハインド → 攻撃ボーナス+20
  if (goalDiff > 0) score += 20;
  else if (goalDiff < 0) score += 20;
  // 同点 → 中立（0）

  // §4-5: 残り10ターン以下でビハインド → 追加攻撃+20
  if (remainingTurns <= 10 && goalDiff < 0) score += 20;

  // §4-5: 残り5ターン以下でリード → 追加守備+20
  if (remainingTurns <= 5 && goalDiff > 0) score += 20;

  return score;
}

// ================================================================
// 戦略タイプ判定（ルールベースAI用）
// ================================================================

export type Strategy = 'attack' | 'defend' | 'balanced' | 'desperate_attack';

/**
 * 現在の局面から推奨戦略を返す
 */
export function recommendStrategy(
  goalDiff: number,
  turn: number,
  maxTurn: number,
): Strategy {
  const remaining = maxTurn - turn;

  if (goalDiff < 0 && remaining <= 10) return 'desperate_attack';
  if (goalDiff < 0) return 'attack';
  if (goalDiff > 0 && remaining <= 10) return 'defend';
  if (goalDiff > 0) return 'balanced';
  return 'balanced';
}
