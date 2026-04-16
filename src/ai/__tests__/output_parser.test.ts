// ============================================================
// output_parser.test.ts — Gemma出力パーサーのユニットテスト
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseGemmaOutput } from '../output_parser';
import type { PieceLegalMoves, LegalAction } from '../legal_moves';

// ── ヘルパー ──

function makeLegalMoves(pieces: Array<{
  id: string;
  actions: Array<{ action: string; targetHex?: [number, number]; targetPieceId?: string; shootZone?: string; benchPieceId?: string }>;
}>): PieceLegalMoves[] {
  return pieces.map(p => ({
    pieceId: p.id,
    position: 'MF',
    cost: 1,
    currentHex: { col: 10, row: 10 },
    hasBall: false,
    legalActions: [
      ...p.actions.map((a, i) => ({
        id: `a${i + 1}`,
        action: a.action as LegalAction['action'],
        targetHex: a.targetHex ? { col: a.targetHex[0], row: a.targetHex[1] } : undefined,
        targetPieceId: a.targetPieceId,
        shootZone: a.shootZone as LegalAction['shootZone'],
        benchPieceId: a.benchPieceId,
        note: '',
      })),
      // stayは常に合法
      { id: 'stay', action: 'stay' as const, note: '静止' },
    ],
  }));
}

describe('parseGemmaOutput', () => {
  // ================================================================
  // JSON抽出テスト
  // ================================================================

  describe('JSONパース', () => {
    const legalMoves = makeLegalMoves([
      { id: 'a01', actions: [{ action: 'move', targetHex: [10, 12] }] },
    ]);

    it('正しいJSONをパースできる', () => {
      const raw = '{"orders":[{"piece_id":"a01","action":"move","target_hex":[10,12]}]}';
      const result = parseGemmaOutput(raw, legalMoves);
      expect(result.validOrders).toHaveLength(1);
      expect(result.validOrders[0].pieceId).toBe('a01');
      expect(result.validOrders[0].type).toBe('move');
      expect(result.stats.legalRate).toBe(100);
    });

    it('```json ... ``` ブロックから抽出できる', () => {
      const raw = 'Here is my response:\n```json\n{"orders":[{"piece_id":"a01","action":"move","target_hex":[10,12]}]}\n```';
      const result = parseGemmaOutput(raw, legalMoves);
      expect(result.validOrders).toHaveLength(1);
      expect(result.stats.validCount).toBe(1);
    });

    it('テキスト混在のJSON（ブレース抽出）', () => {
      const raw = 'I will move the piece.\n{"orders":[{"piece_id":"a01","action":"move","target_hex":[10,12]}]}\nDone!';
      const result = parseGemmaOutput(raw, legalMoves);
      expect(result.validOrders).toHaveLength(1);
    });

    it('完全に壊れたJSONはjson_parse_errorを返す', () => {
      const raw = 'This is not JSON at all';
      const result = parseGemmaOutput(raw, legalMoves);
      expect(result.validOrders).toHaveLength(0);
      expect(result.stats.rejectionReasons.has('json_parse_error')).toBe(true);
      expect(result.stats.legalRate).toBe(0);
    });

    it('ordersキーがないJSONはjson_parse_errorを返す', () => {
      const raw = '{"moves":[]}';
      const result = parseGemmaOutput(raw, legalMoves);
      expect(result.validOrders).toHaveLength(0);
      expect(result.stats.rejectionReasons.has('json_parse_error')).toBe(true);
    });

    it('空のorders配列はvalidOrders=0で正常終了', () => {
      const raw = '{"orders":[]}';
      const result = parseGemmaOutput(raw, legalMoves);
      expect(result.validOrders).toHaveLength(0);
      expect(result.stats.totalRawOrders).toBe(0);
      // 全コマがinvalidPieceIdsに入る
      expect(result.invalidPieceIds).toContain('a01');
    });
  });

  // ================================================================
  // 合法手マッチングテスト
  // ================================================================

  describe('合法手マッチング', () => {
    it('move: target_hexが合法手に含まれる場合は有効', () => {
      const lm = makeLegalMoves([
        { id: 'a01', actions: [{ action: 'move', targetHex: [10, 12] }, { action: 'move', targetHex: [11, 12] }] },
      ]);
      const raw = '{"orders":[{"piece_id":"a01","action":"move","target_hex":[11,12]}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(1);
      expect(result.validOrders[0].target).toEqual({ col: 11, row: 12 });
    });

    it('move: target_hexが合法手にない場合はnot_in_legal_moves', () => {
      const lm = makeLegalMoves([
        { id: 'a01', actions: [{ action: 'move', targetHex: [10, 12] }] },
      ]);
      const raw = '{"orders":[{"piece_id":"a01","action":"move","target_hex":[99,99]}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(0);
      expect(result.stats.rejectionReasons.get('not_in_legal_moves')).toBe(1);
    });

    it('pass: target_pieceが一致する場合は有効', () => {
      const lm = makeLegalMoves([
        { id: 'a05', actions: [{ action: 'pass', targetPieceId: 'a11' }] },
      ]);
      const raw = '{"orders":[{"piece_id":"a05","action":"pass","target_piece":"a11"}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(1);
      expect(result.validOrders[0].targetPieceId).toBe('a11');
    });

    it('shoot: zoneが一致する場合は有効', () => {
      const lm = makeLegalMoves([
        { id: 'a09', actions: [{ action: 'shoot', shootZone: 'top_left' }, { action: 'shoot', shootZone: 'bottom_right' }] },
      ]);
      const raw = '{"orders":[{"piece_id":"a09","action":"shoot","zone":"top_left"}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(1);
    });

    it('shoot: zone のみ(target_hexなし)でも合法手のtargetHexが補完される', () => {
      const lm = makeLegalMoves([
        { id: 'a09', actions: [{ action: 'shoot', shootZone: 'top_left', targetHex: [10, 0] }] },
      ]);
      // Gemmaがzoneのみ出力（target_hexなし）
      const raw = '{"orders":[{"piece_id":"a09","action":"shoot","zone":"top_left"}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(1);
      // 合法手のtargetHex(ゴール座標)がOrderのtargetに補完される
      expect(result.validOrders[0].target).toEqual({ col: 10, row: 0 });
    });

    it('stay: 常に有効', () => {
      const lm = makeLegalMoves([
        { id: 'a01', actions: [] },
      ]);
      const raw = '{"orders":[{"piece_id":"a01","action":"stay"}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(1);
      expect(result.validOrders[0].type).toBe('stay');
    });

    it('substitute: bench_pieceが一致する場合は有効', () => {
      const lm = makeLegalMoves([
        { id: 'a01', actions: [{ action: 'substitute', benchPieceId: 'b01' }] },
      ]);
      const raw = '{"orders":[{"piece_id":"a01","action":"substitute","bench_piece":"b01"}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(1);
    });
  });

  // ================================================================
  // バリデーションエラーテスト
  // ================================================================

  describe('バリデーションエラー', () => {
    const lm = makeLegalMoves([
      { id: 'a01', actions: [{ action: 'move', targetHex: [10, 12] }] },
      { id: 'a02', actions: [{ action: 'move', targetHex: [11, 12] }] },
    ]);

    it('unknown_piece_id: 存在しないpiece_idは除外', () => {
      const raw = '{"orders":[{"piece_id":"x99","action":"move","target_hex":[10,12]}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(0);
      expect(result.stats.rejectionReasons.get('unknown_piece_id')).toBe(1);
    });

    it('duplicate_piece_id: 同一piece_idの重複は2つ目を除外', () => {
      const raw = '{"orders":[{"piece_id":"a01","action":"move","target_hex":[10,12]},{"piece_id":"a01","action":"stay"}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(1);
      expect(result.stats.rejectionReasons.get('duplicate_piece_id')).toBe(1);
    });

    it('invalid_action: 存在しないアクション名は除外', () => {
      const raw = '{"orders":[{"piece_id":"a01","action":"fly","target_hex":[10,12]}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(0);
      expect(result.stats.rejectionReasons.get('invalid_action')).toBe(1);
    });

    it('invalidPieceIds: 指示がなかったコマのIDが含まれる', () => {
      const raw = '{"orders":[{"piece_id":"a01","action":"move","target_hex":[10,12]}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.validOrders).toHaveLength(1);
      expect(result.invalidPieceIds).toContain('a02');
      expect(result.invalidPieceIds).not.toContain('a01');
    });
  });

  // ================================================================
  // 統計テスト
  // ================================================================

  describe('統計情報', () => {
    it('legalRateが正しく計算される', () => {
      const lm = makeLegalMoves([
        { id: 'a01', actions: [{ action: 'move', targetHex: [10, 12] }] },
        { id: 'a02', actions: [{ action: 'move', targetHex: [11, 12] }] },
      ]);
      // a01: 有効, a02: 不正なtarget
      const raw = '{"orders":[{"piece_id":"a01","action":"move","target_hex":[10,12]},{"piece_id":"a02","action":"move","target_hex":[99,99]}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.stats.totalRawOrders).toBe(2);
      expect(result.stats.validCount).toBe(1);
      expect(result.stats.invalidCount).toBe(1);
      expect(result.stats.legalRate).toBe(50);
    });

    it('複数コマの正常パースで全数一致', () => {
      const lm = makeLegalMoves([
        { id: 'a01', actions: [{ action: 'move', targetHex: [10, 12] }] },
        { id: 'a02', actions: [{ action: 'move', targetHex: [11, 12] }] },
        { id: 'a03', actions: [] }, // stayのみ
      ]);
      const raw = '{"orders":[{"piece_id":"a01","action":"move","target_hex":[10,12]},{"piece_id":"a02","action":"move","target_hex":[11,12]},{"piece_id":"a03","action":"stay"}]}';
      const result = parseGemmaOutput(raw, lm);
      expect(result.stats.validCount).toBe(3);
      expect(result.stats.invalidCount).toBe(0);
      expect(result.stats.legalRate).toBe(100);
      expect(result.invalidPieceIds).toHaveLength(0);
    });
  });
});
