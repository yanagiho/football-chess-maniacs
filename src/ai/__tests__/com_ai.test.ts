// ============================================================
// com_ai.test.ts — 統合COM AIパイプラインのユニットテスト
// ============================================================
//
// callGemmaをモックして、安全層→判断層→検証層の全パイプラインをテスト。
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComAi } from '../com_ai';
import type { AiBinding, AiResponse } from '../gemma_client';
import type { Piece } from '../../engine/types';

// ── テスト用盤面 ──

function makeTestPieces(): Piece[] {
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
  // awayのFWにボール
  const fw = pieces.find(p => p.team === 'away' && p.position === 'FW');
  if (fw) fw.hasBall = true;
  return pieces;
}

// ── モックAiBinding ──

function createMockAi(response: string | null, delayMs = 0): AiBinding {
  return {
    run: vi.fn().mockImplementation(async () => {
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      if (response === null) throw new Error('API error');
      return { response } as AiResponse;
    }),
  };
}

// ── 有効なGemma出力を作る（全11枚stayの最小出力） ──

function makeValidGemmaOutput(): string {
  const orders = Array.from({ length: 11 }, (_, i) => ({
    piece_id: `a${String(i + 1).padStart(2, '0')}`,
    action: 'stay',
  }));
  return JSON.stringify({ orders });
}

describe('ComAi', () => {
  const baseInput = {
    pieces: makeTestPieces(),
    myTeam: 'away' as const,
    scoreHome: 0,
    scoreAway: 0,
    turn: 1,
    maxTurn: 36,
    remainingSubs: 3,
    benchPieces: [] as Piece[],
    maxFieldCost: 16,
    difficulty: 'regular' as const,
    era: '現代' as const,
    matchId: 'test-match',
  };

  // ================================================================
  // Gemma成功パターン
  // ================================================================

  describe('Gemma成功', () => {
    it('全11枚stayの有効出力 → usedGemma=true, フォールバックなし', async () => {
      const mockAi = createMockAi(makeValidGemmaOutput());
      const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 5000 });

      const result = await ai.generateOrders(baseInput);

      expect(result.usedGemma).toBe(true);
      expect(result.fallbackReason).toBeNull();
      expect(result.orders.length).toBeGreaterThanOrEqual(11);
      expect(result.gemmaLatencyMs).not.toBeNull();
      expect(result.evaluation).toBeDefined();
      expect(result.strategy).toBeDefined();
      expect(result.errorLog).toBeNull();
    });

    it('evaluationとstrategyが返される', async () => {
      const mockAi = createMockAi(makeValidGemmaOutput());
      const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 5000 });

      const result = await ai.generateOrders(baseInput);

      expect(result.evaluation.total).toBeDefined();
      expect(result.evaluation.ballPosition).toBeDefined();
      expect(result.evaluation.piecePlacement).toBeDefined();
      expect(result.evaluation.zocControl).toBeDefined();
      expect(['attack', 'defend', 'balanced', 'desperate_attack']).toContain(result.strategy);
    });
  });

  // ================================================================
  // Gemmaエラー → フォールバック
  // ================================================================

  describe('Gemmaエラー → フォールバック', () => {
    it('API例外 → 全面フォールバック（ルールベース）', async () => {
      const mockAi = createMockAi(null); // throw error
      const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 5000 });

      const result = await ai.generateOrders(baseInput);

      expect(result.usedGemma).toBe(false);
      expect(result.fallbackReason).toBe('api_error');
      expect(result.orders.length).toBeGreaterThanOrEqual(1);
      expect(result.ruleBasedFillCount).toBeGreaterThan(0);
      expect(result.errorLog).not.toBeNull();
      expect(result.errorLog?.reason).toBe('api_error');
    });

    it('空レスポンス → 全面フォールバック', async () => {
      const mockAi = createMockAi('');
      const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 5000 });

      const result = await ai.generateOrders(baseInput);

      expect(result.usedGemma).toBe(false);
      expect(result.fallbackReason).toBe('empty_response');
      expect(result.orders.length).toBeGreaterThanOrEqual(1);
    });

    it('タイムアウト → 全面フォールバック', async () => {
      const mockAi = createMockAi('{"orders":[]}', 200); // 200ms遅延
      const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 50 }); // 50msタイムアウト

      const result = await ai.generateOrders(baseInput);

      expect(result.usedGemma).toBe(false);
      expect(result.fallbackReason).toBe('timeout');
      expect(result.orders.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ================================================================
  // パースエラー → フォールバック
  // ================================================================

  describe('パースエラー → フォールバック', () => {
    it('壊れたJSON → 全面フォールバック（json_parse_error）', async () => {
      const mockAi = createMockAi('This is not JSON at all!!!');
      const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 5000 });

      const result = await ai.generateOrders(baseInput);

      expect(result.usedGemma).toBe(false);
      expect(result.fallbackReason).toBe('json_parse_error');
      expect(result.orders.length).toBeGreaterThanOrEqual(1);
      expect(result.parseStats?.rejectionReasons.has('json_parse_error')).toBe(true);
    });

    it('全コマ不正なorder → 全面フォールバック（majority_illegal）', async () => {
      const badOrders = Array.from({ length: 11 }, (_, i) => ({
        piece_id: `a${String(i + 1).padStart(2, '0')}`,
        action: 'move',
        target_hex: [99, 99], // 不正な座標
      }));
      const mockAi = createMockAi(JSON.stringify({ orders: badOrders }));
      const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 5000 });

      const result = await ai.generateOrders(baseInput);

      expect(result.usedGemma).toBe(false);
      expect(result.fallbackReason).toBe('majority_illegal');
      expect(result.orders.length).toBeGreaterThanOrEqual(1);
    });

    it('一部コマのみ有効 → 部分フォールバック', async () => {
      // 6枚stay（有効）+ 2枚不正 = 25%不正 → partial_fill
      const orders = [
        { piece_id: 'a01', action: 'stay' },
        { piece_id: 'a02', action: 'stay' },
        { piece_id: 'a03', action: 'stay' },
        { piece_id: 'a04', action: 'stay' },
        { piece_id: 'a05', action: 'stay' },
        { piece_id: 'a06', action: 'stay' },
        { piece_id: 'a07', action: 'move', target_hex: [99, 99] },
        { piece_id: 'a08', action: 'move', target_hex: [99, 99] },
      ];
      const mockAi = createMockAi(JSON.stringify({ orders }));
      const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 5000 });

      const result = await ai.generateOrders(baseInput);

      // 2/8 = 25% invalid → 過半数以下なのでpartial_fill
      expect(result.usedGemma).toBe(true);
      expect(result.fallbackReason).toBe('partial_fill');
      expect(result.gemmaOrderCount).toBeGreaterThanOrEqual(1);
      expect(result.ruleBasedFillCount).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // 難易度別テスト
  // ================================================================

  describe('難易度別', () => {
    for (const difficulty of ['beginner', 'regular', 'maniac'] as const) {
      it(`${difficulty}: ordersが返される`, async () => {
        const mockAi = createMockAi(makeValidGemmaOutput());
        const ai = new ComAi({ ai: mockAi, modelId: 'test-model', timeoutMs: 5000 });

        const result = await ai.generateOrders({ ...baseInput, difficulty });

        expect(result.orders.length).toBeGreaterThanOrEqual(1);
        // プロンプトがAIに渡されたことを確認
        expect(mockAi.run).toHaveBeenCalledTimes(1);
        const callArgs = (mockAi.run as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[0]).toBe('test-model');
        expect(callArgs[1].messages).toHaveLength(2);
      });
    }
  });
});
