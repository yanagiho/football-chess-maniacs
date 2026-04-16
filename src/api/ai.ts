// ============================================================
// ai.ts — AI テスト用APIエンドポイント
//
// POST /api/ai/test  — ComAiパイプライン全体を実行してデバッグ情報を返す
// POST /api/ai/turn  — COM対戦のAIターン（Battle.tsxから呼び出し）
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';
import { ComAi } from '../ai/com_ai';
import { generateRuleBasedOrders } from '../ai/rule_based';
import { wrapAiBinding } from '../ai/gemma_client';
import type { Difficulty, Era } from '../ai/prompt_builder';
import type { Piece, Team, Board, Order } from '../engine/types';

const aiRoutes = new Hono<Env>();

// ================================================================
// POST /api/ai/test — Gemma AIパイプラインのテスト
// ================================================================
//
// Body:
// {
//   pieces: Piece[],           // 全22枚のフィールドコマ
//   myTeam: "home" | "away",
//   scoreHome: number,
//   scoreAway: number,
//   turn: number,
//   maxTurn?: number,          // default 36
//   difficulty: "beginner" | "regular" | "maniac",
//   era: "現代" | ... ,
//   remainingSubs?: number,    // default 3
//   benchPieces?: Piece[],
//   maxFieldCost?: number,     // default 16
// }
//
// Response:
// {
//   usedGemma: boolean,
//   gemmaLatencyMs: number | null,
//   fallbackReason: string | null,
//   gemmaOrderCount: number,
//   ruleBasedFillCount: number,
//   parseStats: {...} | null,
//   evaluation: {...},
//   strategy: string,
//   orders: Order[],
//   errorLog: {...} | null,
// }

aiRoutes.post('/test', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    pieces,
    myTeam = 'away',
    scoreHome = 0,
    scoreAway = 0,
    turn = 1,
    maxTurn = 36,
    difficulty = 'regular',
    era = '現代',
    remainingSubs = 3,
    benchPieces = [],
    maxFieldCost = 16,
  } = body as {
    pieces?: Piece[];
    myTeam?: Team;
    scoreHome?: number;
    scoreAway?: number;
    turn?: number;
    maxTurn?: number;
    difficulty?: Difficulty;
    era?: Era;
    remainingSubs?: number;
    benchPieces?: Piece[];
    maxFieldCost?: number;
  };

  // pieces が渡された場合は配列チェック
  if (pieces !== undefined && (!Array.isArray(pieces) || pieces.length === 0)) {
    return c.json({ error: 'pieces must be a non-empty array' }, 400);
  }

  // デフォルト盤面: 初期4-4-2
  const boardPieces = pieces ?? createDefaultBoard();

  const ai = new ComAi({
    ai: wrapAiBinding(c.env.AI),
    modelId: c.env.AI_MODEL_ID,
    timeoutMs: 5000, // テスト用に5秒に緩和
  });

  const startTotal = Date.now();

  const result = await ai.generateOrders({
    pieces: boardPieces,
    myTeam,
    scoreHome,
    scoreAway,
    turn,
    maxTurn,
    remainingSubs,
    benchPieces,
    maxFieldCost,
    difficulty,
    era,
    matchId: 'ai-test',
  });

  const totalLatencyMs = Date.now() - startTotal;

  // parseStatsのMapをJSONシリアライズ可能に変換
  const parseStats = result.parseStats
    ? {
        ...result.parseStats,
        rejectionReasons: Object.fromEntries(result.parseStats.rejectionReasons),
      }
    : null;

  return c.json({
    usedGemma: result.usedGemma,
    gemmaLatencyMs: result.gemmaLatencyMs,
    totalLatencyMs,
    fallbackReason: result.fallbackReason,
    gemmaOrderCount: result.gemmaOrderCount,
    ruleBasedFillCount: result.ruleBasedFillCount,
    parseStats,
    evaluation: result.evaluation,
    strategy: result.strategy,
    orderCount: result.orders.length,
    orders: result.orders,
    errorLog: result.errorLog,
  });
});

// ================================================================
// POST /api/ai/turn — COM対戦のAIターン生成
// ================================================================
//
// Battle.tsxからfetch()で呼び出し、Gemma推論結果を返す。
// フォールバック時はルールベース結果を返す。
//
// Body:
// {
//   pieces: Piece[],           // 全フィールドコマ
//   myTeam: "away",
//   scoreHome: number,
//   scoreAway: number,
//   turn: number,
//   maxTurn: number,
//   difficulty: Difficulty,
//   era: Era,
//   remainingSubs?: number,
//   benchPieces?: Piece[],
//   maxFieldCost?: number,
// }
//
// Response:
// {
//   orders: Order[],
//   usedGemma: boolean,
//   gemmaLatencyMs: number | null,
//   fallbackReason: string | null,
// }

aiRoutes.post('/turn', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const {
    pieces,
    myTeam = 'away',
    scoreHome = 0,
    scoreAway = 0,
    turn = 1,
    maxTurn = 36,
    difficulty = 'regular',
    era = '現代',
    remainingSubs = 3,
    benchPieces = [],
    maxFieldCost = 16,
  } = body as {
    pieces: Piece[];
    myTeam: Team;
    scoreHome: number;
    scoreAway: number;
    turn: number;
    maxTurn: number;
    difficulty: Difficulty;
    era: Era;
    remainingSubs?: number;
    benchPieces?: Piece[];
    maxFieldCost?: number;
  };

  if (!pieces || !Array.isArray(pieces) || pieces.length === 0) {
    return c.json({ error: 'pieces array is required' }, 400);
  }

  const ai = new ComAi({
    ai: wrapAiBinding(c.env.AI),
    modelId: c.env.AI_MODEL_ID,
    timeoutMs: 2000, // 実戦用: 2秒
  });

  const result = await ai.generateOrders({
    pieces,
    myTeam,
    scoreHome,
    scoreAway,
    turn,
    maxTurn,
    remainingSubs,
    benchPieces,
    maxFieldCost,
    difficulty,
    era,
    matchId: `com-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });

  // エラーログがあればR2に保存
  if (result.errorLog) {
    try {
      const logKey = `ai-errors/${result.errorLog.matchId}/${result.errorLog.turn}.json`;
      await c.env.R2.put(logKey, JSON.stringify(result.errorLog));
    } catch {
      // R2保存失敗は無視
    }
  }

  return c.json({
    orders: result.orders,
    usedGemma: result.usedGemma,
    gemmaLatencyMs: result.gemmaLatencyMs,
    fallbackReason: result.fallbackReason,
  });
});

// ================================================================
// デフォルト盤面（テスト用初期4-4-2）
// ================================================================

function createDefaultBoard(): Piece[] {
  const formation = [
    { pos: 'GK' as const, cost: 1 as const,   col: 10, row: 1 },
    { pos: 'DF' as const, cost: 1 as const,   col: 7,  row: 5 },
    { pos: 'DF' as const, cost: 1.5 as const, col: 13, row: 5 },
    { pos: 'SB' as const, cost: 1 as const,   col: 4,  row: 6 },
    { pos: 'SB' as const, cost: 1.5 as const, col: 16, row: 6 },
    { pos: 'VO' as const, cost: 2 as const,   col: 10, row: 9 },
    { pos: 'MF' as const, cost: 1 as const,   col: 7,  row: 12 },
    { pos: 'MF' as const, cost: 1.5 as const, col: 13, row: 12 },
    { pos: 'OM' as const, cost: 2 as const,   col: 10, row: 15 },
    { pos: 'WG' as const, cost: 1.5 as const, col: 4,  row: 17 },
    { pos: 'FW' as const, cost: 2.5 as const, col: 10, row: 19 },
  ];

  const pieces: Piece[] = [];
  for (let i = 0; i < formation.length; i++) {
    const f = formation[i];
    pieces.push({
      id: `h${String(i + 1).padStart(2, '0')}`,
      team: 'home',
      position: f.pos,
      cost: f.cost,
      coord: { col: f.col, row: f.row },
      hasBall: false,
    });
    pieces.push({
      id: `a${String(i + 1).padStart(2, '0')}`,
      team: 'away',
      position: f.pos,
      cost: f.cost,
      coord: { col: f.col, row: 33 - f.row },
      hasBall: false,
    });
  }
  // awayのFWにボール（away視点のテスト）
  const fw = pieces.find(p => p.team === 'away' && p.position === 'FW');
  if (fw) fw.hasBall = true;
  return pieces;
}

export default aiRoutes;
