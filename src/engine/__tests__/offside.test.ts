// ============================================================
// offside.test.ts — オフサイド判定（§9-5）テスト
// ============================================================
//
// 検証項目:
//   - getOffsideLine: GK除外、ハーフライン制約、ボール位置制約
//   - resolveOffside: 確定オフサイド / グレーゾーン / オンサイド
//   - 攻撃方向（home=row増加 / away=row減少）
//   - スナップショット位置での判定（移動後ではなく移動前）
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as diceModule from '../dice';
import { getOffsideLine, resolveOffside } from '../offside';
import type { Piece, Position } from '../types';

vi.mock('../dice', async () => {
  const actual = await vi.importActual<typeof import('../dice')>('../dice');
  return { ...actual, judge: vi.fn() };
});
const mockJudge = vi.mocked(diceModule.judge);

type JR = { success: boolean; probability: number; roll: number };
const ok = (p = 50): JR => ({ success: true,  probability: p, roll: 0 });
const ng = (p = 50): JR => ({ success: false, probability: p, roll: 99 });

function makePiece(id: string, team: 'home' | 'away', row: number, position: Position = 'DF'): Piece {
  return {
    id, team, position, cost: 1,
    coord: { col: 10, row },
    hasBall: false,
  };
}

beforeEach(() => mockJudge.mockReset());

// ============================================================
// getOffsideLine
// ============================================================
describe('getOffsideLine', () => {
  // defenderGoalIsLowRow=false → defender=away(goal row=33), attacker=home(attacks toward row=33)
  // home自陣=row 0-16 → offside line ≥ 16
  // line = max(secondLastRow, ballRow) then max(16, ...)
  describe('away守備（defenderGoalIsLowRow=false）— home攻撃 toward high row', () => {
    it('GK(row=33)とDF2枚: GK除外→DFの最後方がライン', () => {
      const defenders = [
        makePiece('gk', 'away', 33, 'GK'),
        makePiece('d1', 'away', 30),
        makePiece('d2', 'away', 25),
      ];
      // GK除外→DF:[30,25]。降順最後方=row30。max(16,30)=30
      expect(getOffsideLine(defenders, false)).toBe(30);
    });

    it('DF全員がハーフライン内→ハーフラインがライン', () => {
      const defenders = [
        makePiece('gk', 'away', 33, 'GK'),
        makePiece('d1', 'away', 10),
        makePiece('d2', 'away', 8),
      ];
      // GK除外→DF:[10,8]。降順最後方=row10。max(16,10)=16
      expect(getOffsideLine(defenders, false)).toBe(16);
    });

    it('ボール位置がDFより前→ボール位置がライン', () => {
      const defenders = [
        makePiece('gk', 'away', 33, 'GK'),
        makePiece('d1', 'away', 25),
        makePiece('d2', 'away', 20),
      ];
      // GK除外→最後方=25。ボールrow=28>25→max(25,28)=28。max(16,28)=28
      expect(getOffsideLine(defenders, false, 28)).toBe(28);
    });

    it('ボール位置がDFより後ろ→DF位置がライン', () => {
      const defenders = [
        makePiece('gk', 'away', 33, 'GK'),
        makePiece('d1', 'away', 25),
        makePiece('d2', 'away', 20),
      ];
      // GK除外→最後方=25。ボールrow=22<25→max(25,22)=25。max(16,25)=25
      expect(getOffsideLine(defenders, false, 22)).toBe(25);
    });
  });

  // defenderGoalIsLowRow=true → defender=home(goal row=0), attacker=away(attacks toward row=0)
  // away自陣=row 17-33 → offside line ≤ 16
  // line = min(secondLastRow, ballRow) then min(16, ...)
  describe('home守備（defenderGoalIsLowRow=true）— away攻撃 toward low row', () => {
    it('GK(row=0)とDF: GK除外→DFの最後方がライン', () => {
      const defenders = [
        makePiece('gk', 'home', 0, 'GK'),
        makePiece('d1', 'home', 6),
        makePiece('d2', 'home', 12),
      ];
      // GK除外→DF:[6,12]。昇順最後方=row6。min(16,6)=6
      expect(getOffsideLine(defenders, true)).toBe(6);
    });

    it('DF全員がハーフライン超→ハーフラインがライン', () => {
      const defenders = [
        makePiece('gk', 'home', 0, 'GK'),
        makePiece('d1', 'home', 20),
        makePiece('d2', 'home', 25),
      ];
      // GK除外→DF:[20,25]。昇順最後方=row20。min(16,20)=16
      expect(getOffsideLine(defenders, true)).toBe(16);
    });

    it('ボール位置がDFより前（小さいrow）→ボール位置がライン', () => {
      const defenders = [
        makePiece('gk', 'home', 0, 'GK'),
        makePiece('d1', 'home', 6),
        makePiece('d2', 'home', 12),
      ];
      // 最後方=6。ボールrow=4<6→min(6,4)=4。min(16,4)=4
      expect(getOffsideLine(defenders, true, 4)).toBe(4);
    });

    it('ボール位置がDFより後ろ（大きいrow）→DF位置がライン', () => {
      const defenders = [
        makePiece('gk', 'home', 0, 'GK'),
        makePiece('d1', 'home', 6),
        makePiece('d2', 'home', 12),
      ];
      // 最後方=6。ボールrow=10>6→min(6,10)=6。min(16,6)=6
      expect(getOffsideLine(defenders, true, 10)).toBe(6);
    });
  });

  describe('端ケース', () => {
    it('コマが1枚: away守備→ゴールライン(33)', () => {
      const defenders = [makePiece('gk', 'away', 30, 'GK')];
      expect(getOffsideLine(defenders, false)).toBe(33);
    });

    it('コマが1枚: home守備→ゴールライン(0)', () => {
      const defenders = [makePiece('gk', 'home', 5, 'GK')];
      expect(getOffsideLine(defenders, true)).toBe(0);
    });

    it('コマが0枚: away守備→33', () => {
      expect(getOffsideLine([], false)).toBe(33);
    });

    it('GKなし（全員DF）→最後方DF + ハーフライン制約', () => {
      const defenders = [
        makePiece('d1', 'away', 25),
        makePiece('d2', 'away', 20),
      ];
      // GKなし→全員候補。降順最後方=row25。max(16,25)=25
      expect(getOffsideLine(defenders, false)).toBe(25);
    });
  });
});

// ============================================================
// resolveOffside
// ============================================================
describe('resolveOffside', () => {
  describe('home攻撃（attackIsHighRow=true）: rowが大きい=敵陣', () => {
    it('diff ≥ 2 → 確定オフサイド', () => {
      const result = resolveOffside({
        receiverSnapshot: makePiece('fw', 'home', 22),
        offsideLine: 20,
        attackIsHighRow: true,
      });
      expect(result.isOffside).toBe(true);
      expect(result.isGrayZone).toBe(false);
    });

    it('diff = 1 + ジャッジ成功 → オフサイド（グレーゾーン）', () => {
      mockJudge.mockReturnValue(ok(50));
      const result = resolveOffside({
        receiverSnapshot: makePiece('fw', 'home', 21),
        offsideLine: 20,
        attackIsHighRow: true,
      });
      expect(result.isOffside).toBe(true);
      expect(result.isGrayZone).toBe(true);
    });

    it('diff = 1 + ジャッジ失敗 → オンサイド（グレーゾーン）', () => {
      mockJudge.mockReturnValue(ng(50));
      const result = resolveOffside({
        receiverSnapshot: makePiece('fw', 'home', 21),
        offsideLine: 20,
        attackIsHighRow: true,
      });
      expect(result.isOffside).toBe(false);
      expect(result.isGrayZone).toBe(true);
    });

    it('diff ≤ 0 → オンサイド', () => {
      const result = resolveOffside({
        receiverSnapshot: makePiece('fw', 'home', 20),
        offsideLine: 20,
        attackIsHighRow: true,
      });
      expect(result.isOffside).toBe(false);
      expect(result.isGrayZone).toBe(false);
    });

    it('受け手が自陣側（diff = -3）→ オンサイド', () => {
      const result = resolveOffside({
        receiverSnapshot: makePiece('fw', 'home', 17),
        offsideLine: 20,
        attackIsHighRow: true,
      });
      expect(result.isOffside).toBe(false);
      expect(result.isGrayZone).toBe(false);
    });
  });

  describe('away攻撃（attackIsHighRow=false）: rowが小さい=敵陣', () => {
    it('diff ≥ 2 → 確定オフサイド', () => {
      const result = resolveOffside({
        receiverSnapshot: makePiece('fw', 'away', 8),
        offsideLine: 10,
        attackIsHighRow: false,
      });
      expect(result.isOffside).toBe(true);
      expect(result.isGrayZone).toBe(false);
    });

    it('diff = 1 → グレーゾーン', () => {
      mockJudge.mockReturnValue(ok(50));
      const result = resolveOffside({
        receiverSnapshot: makePiece('fw', 'away', 9),
        offsideLine: 10,
        attackIsHighRow: false,
      });
      expect(result.isOffside).toBe(true);
      expect(result.isGrayZone).toBe(true);
    });

    it('diff ≤ 0 → オンサイド', () => {
      const result = resolveOffside({
        receiverSnapshot: makePiece('fw', 'away', 10),
        offsideLine: 10,
        attackIsHighRow: false,
      });
      expect(result.isOffside).toBe(false);
      expect(result.isGrayZone).toBe(false);
    });
  });
});
