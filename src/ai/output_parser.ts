// ============================================================
// output_parser.ts — Gemma出力のパース＋検証（§9-3）
//
// 1. JSONパース（コードブロック除去対応）
// 2. 各orderの合法性チェック
// 3. 統計情報（検証層の品質計測用）
// ============================================================

import type { Order, OrderType } from '../engine/types';
import type { PieceLegalMoves, LegalAction } from './legal_moves';

// ================================================================
// 型定義
// ================================================================

/** Gemmaが出力する生のorder（§5-2 フォーマット） */
export interface RawGemmaOrder {
  piece_id: string;
  action: string;
  target_hex?: [number, number];
  target_piece?: string;
  zone?: string;
  bench_piece?: string;
}

export interface ParseResult {
  /** 検証を通過したorder */
  validOrders: Order[];
  /** 不正だったorder（ルールベースで置換が必要） */
  invalidPieceIds: string[];
  /** パース統計 */
  stats: ParseStats;
}

export interface ParseStats {
  /** Gemmaが返したorder総数 */
  totalRawOrders: number;
  /** 検証通過数 */
  validCount: number;
  /** 不正で除外された数 */
  invalidCount: number;
  /** 不正の内訳 */
  rejectionReasons: Map<string, number>;
  /** 合法手出力率 (%) — §10-3 品質指標 */
  legalRate: number;
}

// ================================================================
// メイン: パース＋検証
// ================================================================

/**
 * §9-3 Gemma出力をパース・検証する。
 *
 * @param raw         Gemmaの生テキスト出力
 * @param legalMoves  全コマの合法手リスト
 * @returns ParseResult（validOrders + 統計）
 */
export function parseGemmaOutput(
  raw: string,
  legalMoves: PieceLegalMoves[],
): ParseResult {
  const reasons = new Map<string, number>();
  const addReason = (r: string) => reasons.set(r, (reasons.get(r) ?? 0) + 1);

  // §9-3 Step 1: JSONパース
  const parsed = extractJson(raw);
  if (!parsed || !Array.isArray(parsed.orders)) {
    return {
      validOrders: [],
      invalidPieceIds: legalMoves.map((lm) => lm.pieceId),
      stats: {
        totalRawOrders: 0,
        validCount: 0,
        invalidCount: 0,
        rejectionReasons: new Map([['json_parse_error', 1]]),
        legalRate: 0,
      },
    };
  }

  const rawOrders = parsed.orders as RawGemmaOrder[];
  const legalMap = new Map(legalMoves.map((lm) => [lm.pieceId, lm]));

  // §9-3 Step 2: 各orderを検証
  const validOrders: Order[] = [];
  const usedPieceIds = new Set<string>();

  for (const rawOrder of rawOrders) {
    // piece_idが自チームのフィールドコマか
    if (!legalMap.has(rawOrder.piece_id)) {
      addReason('unknown_piece_id');
      continue;
    }

    // 同一piece_idの重複チェック
    if (usedPieceIds.has(rawOrder.piece_id)) {
      addReason('duplicate_piece_id');
      continue;
    }

    // actionが有効な文字列か
    if (!isValidAction(rawOrder.action)) {
      addReason('invalid_action');
      continue;
    }

    // actionが合法手リスト内に存在するか
    const pieceMoves = legalMap.get(rawOrder.piece_id)!;
    const matchedAction = findMatchingLegalAction(rawOrder, pieceMoves.legalActions);
    if (!matchedAction) {
      addReason('not_in_legal_moves');
      continue;
    }

    // 検証通過
    const order: Order = {
      pieceId: rawOrder.piece_id,
      type: rawOrder.action as OrderType,
      target: rawOrder.target_hex
        ? { col: rawOrder.target_hex[0], row: rawOrder.target_hex[1] }
        : undefined,
      targetPieceId: rawOrder.target_piece,
    };
    validOrders.push(order);
    usedPieceIds.add(rawOrder.piece_id);
  }

  // 指示がなかったコマのIDを収集
  const invalidPieceIds = legalMoves
    .filter((lm) => !usedPieceIds.has(lm.pieceId))
    .map((lm) => lm.pieceId);

  const totalRaw = rawOrders.length;
  const validCount = validOrders.length;
  const invalidCount = totalRaw - validCount;

  return {
    validOrders,
    invalidPieceIds,
    stats: {
      totalRawOrders: totalRaw,
      validCount,
      invalidCount,
      rejectionReasons: reasons,
      legalRate: totalRaw > 0 ? (validCount / totalRaw) * 100 : 0,
    },
  };
}

// ================================================================
// JSON抽出（コードブロック除去対応）
// ================================================================

function extractJson(raw: string): { orders: unknown[] } | null {
  try {
    // そのままパースを試みる
    return JSON.parse(raw);
  } catch {
    // ```json ... ``` ブロックを除去して再試行
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch {
        // fall through
      }
    }

    // { から最後の } までを抽出して再試行
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // fall through
      }
    }

    return null;
  }
}

// ================================================================
// 合法手マッチング
// ================================================================

const VALID_ACTIONS = new Set<string>(['move', 'dribble', 'pass', 'shoot', 'substitute', 'stay']);

function isValidAction(action: string): boolean {
  return VALID_ACTIONS.has(action);
}

/**
 * Gemmaのorderが合法手リスト内の手と一致するか検索
 */
function findMatchingLegalAction(
  rawOrder: RawGemmaOrder,
  legalActions: LegalAction[],
): LegalAction | null {
  for (const la of legalActions) {
    if (la.action !== rawOrder.action) continue;

    // move / dribble: target_hex の一致
    if ((rawOrder.action === 'move' || rawOrder.action === 'dribble') && rawOrder.target_hex && la.targetHex) {
      if (la.targetHex.col === rawOrder.target_hex[0] && la.targetHex.row === rawOrder.target_hex[1]) {
        return la;
      }
      continue;
    }

    // pass: target_piece の一致
    if (rawOrder.action === 'pass' && rawOrder.target_piece && la.targetPieceId) {
      if (la.targetPieceId === rawOrder.target_piece) return la;
      continue;
    }

    // shoot: zone の一致
    if (rawOrder.action === 'shoot' && rawOrder.zone && la.shootZone) {
      if (la.shootZone === rawOrder.zone) return la;
      continue;
    }

    // substitute: bench_piece の一致
    if (rawOrder.action === 'substitute' && rawOrder.bench_piece && la.benchPieceId) {
      if (la.benchPieceId === rawOrder.bench_piece) return la;
      continue;
    }

    // stay: 無条件マッチ
    if (rawOrder.action === 'stay' && la.action === 'stay') {
      return la;
    }
  }

  return null;
}
