// ============================================================
// offside.test.ts — オフサイド判定（§9-5）テスト
// ============================================================
//
// 検証項目:
//   - getOffsideLine: home守備 / away守備 / コマ1枚以下の端ケース
//   - resolveOffside: 確定オフサイド / グレーゾーン / オンサイド
//   - 攻撃方向（home=row増加 / away=row減少）
//   - スナップショット位置での判定（移動後ではなく移動前）
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as diceModule from '../dice';
import { getOffsideLine, resolveOffside } from '../offside';
import type { Piece } from '../types';

vi.mock('../dice', async () => {
  const actual = await vi.importActual<typeof import('../dice')>('../dice');
  return { ...actual, judge: vi.fn() };
});
const mockJudge = vi.mocked(diceModule.judge);

type JR = { success: boolean; probability: number; roll: number };
const ok = (p = 50): JR => ({ success: true,  probability: p, roll: 0 });
const ng = (p = 50): JR => ({ success: false, probability: p, roll: 99 });

function makePiece(id: string, team: 'home' | 'away', row: number): Piece {
  return {
    id, team, position: 'DF', cost: 1,
    coord: { col: 10, row },
    hasBall: false,
  };
}

beforeEach(() => mockJudge.mockReset());

// ============================================================
// getOffsideLine
// ============================================================
describe('getOffsideLine', () => {
  describe('away守備（defenderGoalIsLowRow=false）: 降順ソート → row大きい方が"後方"', () => {
    it('守備コマが2枚: 2番目のrow', () => {
      const defenders = [
        makePiece('d1', 'away', 25),
        makePiece('d2', 'away', 30),
      ];
      // 降順: [30, 25] → 2番目は row=25
      expect(getOffsideLine(defenders, false)).toBe(25);
    });

    it('守備コマが多数: 後方から2番目（降順2番目）', () => {
      const defenders = [
        makePiece('d1', 'away', 16),
        makePiece('d2', 'away', 25),
        makePiece('d3', 'away', 30),
        makePiece('d4', 'away', 20),
        makePiece('gk', 'away', 33),
      ];
      // 降順: [33, 30, 25, 20, 16] → 2番目は row=30
      expect(getOffsideLine(defenders, false)).toBe(30);
    });

    it('GK(row=33)と最終DF(row=28): ライン=28', () => {
      const defenders = [
        makePiece('gk', 'away', 33),
        makePiece('d1', 'away', 28),
      ];
      expect(getOffsideLine(defenders, false)).toBe(28);
    });
  });

  describe('home守備（defenderGoalIsLowRow=true）: 昇順ソート → row小さい方が"後方"', () => {
    it('守備コマ2枚', () => {
      const defenders = [
        makePiece('d1', 'home', 5),
        makePiece('d2', 'home', 10),
      ];
      // 昇順: [5, 10] → 2番目は row=10
      expect(getOffsideLine(defenders, true)).toBe(10);
    });

    it('GK(row=0)と最終DF(row=6): ライン=6', () => {
      const defenders = [
        makePiece('gk', 'home', 0),
        makePiece('d1', 'home', 6),
        makePiece('d2', 'home', 12),
      ];
      // 昇順: [0, 6, 12] → 2番目は row=6
      expect(getOffsideLine(defenders, true)).toBe(6);
    });
  });

  describe('端ケース', () => {
    it('コマが1枚: away守備 → ゴールライン(33)を返す', () => {
      const defenders = [makePiece('gk', 'away', 30)];
      expect(getOffsideLine(defenders, false)).toBe(33);
    });

    it('コマが1枚: home守備 → ゴールライン(0)を返す', () => {
      const defenders = [makePiece('gk', 'home', 5)];
      expect(getOffsideLine(defenders, true)).toBe(0);
    });

    it('コマが0枚: away守備 → 33', () => {
      expect(getOffsideLine([], false)).toBe(33);
    });
  });
});

// ============================================================
// resolveOffside
// ============================================================
describe('resolveOffside', () => {
  // home チームが row 増加方向に攻撃（attackIsHighRow=true）
  // offsideLine = 25（away守備の後方2番目）

  describe('home攻撃（attackIsHighRow=true）', () => {
    const LINE = 25;

    it('確定オフサイド: 受け手がライン+2以上（row=27）', () => {
      const receiver = makePiece('fw', 'home', 27);
      const result = resolveOffside({
        receiverSnapshot: receiver,
        offsideLine: LINE,
        attackIsHighRow: true,
      });
      expect(result.isOffside).toBe(true);
      expect(result.isGrayZone).toBe(false);
      expect(mockJudge).not.toHaveBeenCalled();
    });

    it('確定オフサイド: ライン+3（row=28）', () => {
      const receiver = makePiece('fw', 'home', 28);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: true });
      expect(result.isOffside).toBe(true);
      expect(result.isGrayZone).toBe(false);
    });

    it('グレーゾーン（50%）: ライン+1（row=26）→ judge成功でオフサイド', () => {
      mockJudge.mockReturnValue(ok(50));
      const receiver = makePiece('fw', 'home', 26);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: true });
      expect(result.isGrayZone).toBe(true);
      expect(result.isOffside).toBe(true);
      expect(mockJudge).toHaveBeenCalledWith(50);
    });

    it('グレーゾーン（50%）: ライン+1 → judge失敗でオンサイド', () => {
      mockJudge.mockReturnValue(ng(50));
      const receiver = makePiece('fw', 'home', 26);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: true });
      expect(result.isGrayZone).toBe(true);
      expect(result.isOffside).toBe(false);
    });

    it('オンサイド: ライン同列（row=25）', () => {
      const receiver = makePiece('fw', 'home', 25);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: true });
      expect(result.isOffside).toBe(false);
      expect(result.isGrayZone).toBe(false);
      expect(mockJudge).not.toHaveBeenCalled();
    });

    it('オンサイド: ライン自陣寄り（row=22）', () => {
      const receiver = makePiece('fw', 'home', 22);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: true });
      expect(result.isOffside).toBe(false);
    });

    it('オンサイド: ライン大幅自陣（row=10）', () => {
      const receiver = makePiece('fw', 'home', 10);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: true });
      expect(result.isOffside).toBe(false);
    });
  });

  describe('away攻撃（attackIsHighRow=false）: row減少方向に攻撃', () => {
    // offsideLine = 8（home守備の後方2番目）
    const LINE = 8;

    it('確定オフサイド: ライン-2以上（row=6）', () => {
      const receiver = makePiece('fw', 'away', 6);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: false });
      expect(result.isOffside).toBe(true);
      expect(result.isGrayZone).toBe(false);
    });

    it('グレーゾーン: ライン-1（row=7）', () => {
      mockJudge.mockReturnValue(ok(50));
      const receiver = makePiece('fw', 'away', 7);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: false });
      expect(result.isGrayZone).toBe(true);
      expect(result.isOffside).toBe(true);
    });

    it('オンサイド: ライン同列（row=8）', () => {
      const receiver = makePiece('fw', 'away', 8);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: false });
      expect(result.isOffside).toBe(false);
    });

    it('オンサイド: ライン+寄り（row=12）', () => {
      const receiver = makePiece('fw', 'away', 12);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: LINE, attackIsHighRow: false });
      expect(result.isOffside).toBe(false);
    });
  });

  describe('グレーゾーン: roll 値が返される', () => {
    it('grayZoneRoll が result に含まれる', () => {
      mockJudge.mockReturnValue({ success: true, probability: 50, roll: 30 });
      const receiver = makePiece('fw', 'home', 26);
      const result = resolveOffside({ receiverSnapshot: receiver, offsideLine: 25, attackIsHighRow: true });
      expect(result.grayZoneRoll).toBe(30);
    });
  });
});
