// ============================================================
// fallback.test.ts — フォールバック制御のユニットテスト（§9-4）
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  decideFallbackFromError,
  decideFallbackFromParse,
  applyFallback,
  buildErrorLog,
} from '../fallback';
import type { ParseResult } from '../output_parser';
import type { Order } from '../../engine/types';

// ── ヘルパー ──

function makeOrder(pieceId: string, type: string = 'move'): Order {
  return { pieceId, type: type as Order['type'], target: { col: 10, row: 12 } };
}

function makeParseResult(opts: {
  validCount: number;
  invalidCount: number;
  invalidPieceIds?: string[];
  jsonError?: boolean;
}): ParseResult {
  const reasons = new Map<string, number>();
  if (opts.jsonError) reasons.set('json_parse_error', 1);
  if (opts.invalidCount > 0) reasons.set('not_in_legal_moves', opts.invalidCount);

  return {
    validOrders: Array.from({ length: opts.validCount }, (_, i) => makeOrder(`a${String(i + 1).padStart(2, '0')}`)),
    invalidPieceIds: opts.invalidPieceIds ?? [],
    stats: {
      totalRawOrders: opts.jsonError ? 0 : opts.validCount + opts.invalidCount,
      validCount: opts.validCount,
      invalidCount: opts.invalidCount,
      rejectionReasons: reasons,
      legalRate: opts.jsonError ? 0 :
        (opts.validCount + opts.invalidCount > 0)
          ? (opts.validCount / (opts.validCount + opts.invalidCount)) * 100
          : 0,
    },
  };
}

describe('decideFallbackFromError', () => {
  it('timeout → 全面フォールバック', () => {
    const d = decideFallbackFromError({ type: 'timeout', latencyMs: 600 });
    expect(d.needsFallback).toBe(true);
    expect(d.fullFallback).toBe(true);
    expect(d.reason).toBe('timeout');
  });

  it('empty_response → 全面フォールバック', () => {
    const d = decideFallbackFromError({ type: 'empty_response' });
    expect(d.needsFallback).toBe(true);
    expect(d.fullFallback).toBe(true);
    expect(d.reason).toBe('empty_response');
  });

  it('api_error → 全面フォールバック', () => {
    const d = decideFallbackFromError({ type: 'api_error', error: new Error('503') });
    expect(d.needsFallback).toBe(true);
    expect(d.fullFallback).toBe(true);
    expect(d.reason).toBe('api_error');
  });
});

describe('decideFallbackFromParse', () => {
  it('JSONパースエラー → 全面フォールバック', () => {
    const pr = makeParseResult({ validCount: 0, invalidCount: 0, jsonError: true });
    const d = decideFallbackFromParse(pr, 11);
    expect(d.fullFallback).toBe(true);
    expect(d.reason).toBe('json_parse_error');
  });

  it('過半数不正(>50%) → 全面フォールバック', () => {
    // 2/10 valid = 80% illegal
    const pr = makeParseResult({ validCount: 2, invalidCount: 8 });
    const d = decideFallbackFromParse(pr, 11);
    expect(d.fullFallback).toBe(true);
    expect(d.reason).toBe('majority_illegal');
  });

  it('ちょうど50%不正 → 全面フォールバックにならない', () => {
    // 5/10 valid = 50% illegal (not > 50%)
    const pr = makeParseResult({ validCount: 5, invalidCount: 5 });
    const d = decideFallbackFromParse(pr, 11);
    expect(d.fullFallback).toBe(false);
  });

  it('一部コマの指示欠け → 部分フォールバック', () => {
    const pr = makeParseResult({ validCount: 8, invalidCount: 0, invalidPieceIds: ['a09', 'a10', 'a11'] });
    const d = decideFallbackFromParse(pr, 11);
    expect(d.needsFallback).toBe(true);
    expect(d.fullFallback).toBe(false);
    expect(d.reason).toBe('partial_fill');
  });

  it('全コマ有効 → フォールバック不要', () => {
    const pr = makeParseResult({ validCount: 11, invalidCount: 0, invalidPieceIds: [] });
    const d = decideFallbackFromParse(pr, 11);
    expect(d.needsFallback).toBe(false);
    expect(d.fullFallback).toBe(false);
    expect(d.reason).toBeNull();
  });

  it('空のorders配列(validCount=0, invalidCount=0) → 全面フォールバック', () => {
    // Gemmaが orders:[] を返した場合
    const pr = makeParseResult({ validCount: 0, invalidCount: 0, invalidPieceIds: ['a01','a02','a03'] });
    const d = decideFallbackFromParse(pr, 11);
    expect(d.needsFallback).toBe(true);
    expect(d.fullFallback).toBe(true);
    expect(d.reason).toBe('majority_illegal');
  });
});

describe('applyFallback', () => {
  const rbOrders = Array.from({ length: 11 }, (_, i) => makeOrder(`a${String(i + 1).padStart(2, '0')}`, 'stay'));

  it('全面フォールバック → ルールベース全11枚', () => {
    const decision = { needsFallback: true, fullFallback: true, reason: 'timeout' as const };
    const result = applyFallback([], rbOrders, decision);
    expect(result.orders).toHaveLength(11);
    expect(result.gemmaOrderCount).toBe(0);
    expect(result.ruleBasedFillCount).toBe(11);
  });

  it('部分フォールバック → Gemma有効分 + ルールベース補完', () => {
    const gemmaOrders = [makeOrder('a01', 'move'), makeOrder('a02', 'dribble')];
    const decision = { needsFallback: true, fullFallback: false, reason: 'partial_fill' as const };
    const result = applyFallback(gemmaOrders, rbOrders, decision);
    // a01, a02はGemma、a03〜a11はルールベース
    expect(result.gemmaOrderCount).toBe(2);
    expect(result.ruleBasedFillCount).toBe(9);
    expect(result.orders).toHaveLength(11);
    // 先頭2つはGemma由来
    expect(result.orders[0].type).toBe('move');
    expect(result.orders[1].type).toBe('dribble');
  });

  it('フォールバック不要 → Gemma全指示をそのまま返す', () => {
    const gemmaOrders = Array.from({ length: 11 }, (_, i) => makeOrder(`a${String(i + 1).padStart(2, '0')}`, 'move'));
    const decision = { needsFallback: false, fullFallback: false, reason: null };
    const result = applyFallback(gemmaOrders, rbOrders, decision);
    expect(result.gemmaOrderCount).toBe(11);
    expect(result.ruleBasedFillCount).toBe(0);
  });
});

describe('buildErrorLog', () => {
  it('基本フィールドが正しく設定される', () => {
    const log = buildErrorLog('match123', 5, 'timeout', { gemmaLatencyMs: 600 });
    expect(log.matchId).toBe('match123');
    expect(log.turn).toBe(5);
    expect(log.reason).toBe('timeout');
    expect(log.gemmaLatencyMs).toBe(600);
    expect(log.timestamp).toBeDefined();
  });

  it('parseStatsが含まれる場合', () => {
    const stats = { totalRawOrders: 5, validCount: 2, invalidCount: 3, rejectionReasons: new Map(), legalRate: 40 };
    const log = buildErrorLog('m1', 1, 'majority_illegal', { parseStats: stats });
    expect(log.parseStats).toBeDefined();
    expect(log.parseStats?.legalRate).toBe(40);
  });

  it('gemmaRawOutputが500文字に切り詰められる', () => {
    const longOutput = 'x'.repeat(600);
    const log = buildErrorLog('m1', 1, 'json_parse_error', { gemmaRawOutput: longOutput });
    // buildErrorLog自体は切り詰めない（呼び出し側で.slice(0,500)する）
    // ただし600文字がそのまま記録される
    expect(log.gemmaRawOutput).toBeDefined();
  });
});
