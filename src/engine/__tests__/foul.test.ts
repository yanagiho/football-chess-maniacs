import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isAttackingThird, isInsidePA, resolveFoul } from '../foul';
import { judge } from '../dice';

vi.mock('../dice', async () => {
  const actual = await vi.importActual<typeof import('../dice')>('../dice');
  return { ...actual, judge: vi.fn() };
});

const mockedJudge = judge as ReturnType<typeof vi.fn>;

describe('foul', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── isAttackingThird ───────────────────────────────────────
  describe('isAttackingThird', () => {
    // ホームチームのテスト
    it('home: アタッキングサード → true', () => {
      expect(isAttackingThird('アタッキングサード', 'home')).toBe(true);
    });

    it('home: ファイナルサード → true', () => {
      expect(isAttackingThird('ファイナルサード', 'home')).toBe(true);
    });

    it('home: ミドルサードA → false', () => {
      expect(isAttackingThird('ミドルサードA', 'home')).toBe(false);
    });

    it('home: ディフェンシブサード → false', () => {
      expect(isAttackingThird('ディフェンシブサード', 'home')).toBe(false);
    });

    // アウェイチームのテスト
    it('away: ディフェンシブサード → true', () => {
      expect(isAttackingThird('ディフェンシブサード', 'away')).toBe(true);
    });

    it('away: ディフェンシブGサード → true', () => {
      expect(isAttackingThird('ディフェンシブGサード', 'away')).toBe(true);
    });

    it('away: アタッキングサード → false', () => {
      expect(isAttackingThird('アタッキングサード', 'away')).toBe(false);
    });

    it('away: ミドルサードD → false', () => {
      expect(isAttackingThird('ミドルサードD', 'away')).toBe(false);
    });
  });

  // ─── isInsidePA ─────────────────────────────────────────────
  describe('isInsidePA', () => {
    // ホームチームのテスト
    it('home: ファイナルサード col=10 → true', () => {
      expect(isInsidePA('ファイナルサード', 10, 'home')).toBe(true);
    });

    it('home: ファイナルサード col=3 → false（列範囲外）', () => {
      expect(isInsidePA('ファイナルサード', 3, 'home')).toBe(false);
    });

    it('home: ファイナルサード col=18 → false（列範囲外）', () => {
      expect(isInsidePA('ファイナルサード', 18, 'home')).toBe(false);
    });

    it('home: アタッキングサード col=10 → false（ゾーン不一致）', () => {
      expect(isInsidePA('アタッキングサード', 10, 'home')).toBe(false);
    });

    // アウェイチームのテスト
    it('away: ディフェンシブGサード col=10 → true', () => {
      expect(isInsidePA('ディフェンシブGサード', 10, 'away')).toBe(true);
    });

    it('away: ディフェンシブGサード col=3 → false（列範囲外）', () => {
      expect(isInsidePA('ディフェンシブGサード', 3, 'away')).toBe(false);
    });

    // 境界値テスト
    it('境界値: col=4 → true', () => {
      expect(isInsidePA('ファイナルサード', 4, 'home')).toBe(true);
    });

    it('境界値: col=17 → true', () => {
      expect(isInsidePA('ファイナルサード', 17, 'home')).toBe(true);
    });
  });

  // ─── resolveFoul ────────────────────────────────────────────
  describe('resolveFoul', () => {
    it('ミドルサードAゾーン → ファウルなし', () => {
      const result = resolveFoul({ zone: 'ミドルサードA', col: 10, attackingTeam: 'home' });
      expect(result.occurred).toBe(false);
      expect(result.isPA).toBe(false);
      expect(result.outcome).toBe('none');
    });

    it('PA内 + forceFoul → 常にPK', () => {
      const result = resolveFoul({
        zone: 'ファイナルサード',
        col: 10,
        attackingTeam: 'home',
        forceFoul: true,
      });
      expect(result.occurred).toBe(true);
      expect(result.isPA).toBe(true);
      expect(result.outcome).toBe('pk');
    });

    it('PA内 + judge成功 → PK', () => {
      mockedJudge.mockReturnValue({ success: true, probability: 25, roll: 0 });
      const result = resolveFoul({
        zone: 'ファイナルサード',
        col: 10,
        attackingTeam: 'home',
      });
      expect(result.occurred).toBe(true);
      expect(result.isPA).toBe(true);
      expect(result.outcome).toBe('pk');
      expect(mockedJudge).toHaveBeenCalledWith(25);
    });

    it('PA内 + judge失敗 → ファウルなし', () => {
      mockedJudge.mockReturnValue({ success: false, probability: 25, roll: 99 });
      const result = resolveFoul({
        zone: 'ファイナルサード',
        col: 10,
        attackingTeam: 'home',
      });
      expect(result.occurred).toBe(false);
    });

    it('アタッキングサード（PA外） + judge成功 → FK', () => {
      mockedJudge.mockReturnValue({ success: true, probability: 25, roll: 0 });
      const result = resolveFoul({
        zone: 'アタッキングサード',
        col: 10,
        attackingTeam: 'home',
      });
      expect(result.occurred).toBe(true);
      expect(result.isPA).toBe(false);
      expect(result.outcome).toBe('fk');
    });

    it('アタッキングサード（PA外） + judge失敗 → ファウルなし', () => {
      mockedJudge.mockReturnValue({ success: false, probability: 25, roll: 99 });
      const result = resolveFoul({
        zone: 'アタッキングサード',
        col: 10,
        attackingTeam: 'home',
      });
      expect(result.occurred).toBe(false);
    });

    it('アウェイチーム: ディフェンシブGサード → PA/FK判定が正しい', () => {
      mockedJudge.mockReturnValue({ success: true, probability: 25, roll: 0 });
      const result = resolveFoul({
        zone: 'ディフェンシブGサード',
        col: 10,
        attackingTeam: 'away',
      });
      expect(result.occurred).toBe(true);
      expect(result.isPA).toBe(true);
      expect(result.outcome).toBe('pk');
    });
  });
});
