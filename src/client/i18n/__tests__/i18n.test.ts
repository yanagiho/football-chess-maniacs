// =====================================================================
// i18n.test.ts — 辞書パリティ + tn() 複数形/フォールバックの回帰テスト
// (プレイブック §5「キー数パリティ」/ 教訓1「複数形なし言語の日本語混入防止」)
// =====================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { t, tn, setLocale, getLocale, __test__ } from '../index';
import ja from '../ja';
import en from '../en';

const { DICTS, SUPPORTED_LOCALES, FALLBACK_LOCALE } = __test__;

afterEach(() => {
  __test__.setCurrent('ja'); // 他テストへ影響しないよう正本へ戻す
});

describe('辞書パリティ', () => {
  it('ja と en のキー集合が完全一致する', () => {
    const jaKeys = Object.keys(ja).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(jaKeys);
  });

  it('全 SUPPORTED_LOCALES の辞書が正本(ja)とキー一致する', () => {
    const base = Object.keys(DICTS[FALLBACK_LOCALE]).sort();
    for (const loc of SUPPORTED_LOCALES) {
      expect(Object.keys(DICTS[loc]).sort()).toEqual(base);
    }
  });

  it('複数形キーは .one と .other を必ず両方持つ', () => {
    for (const dict of [ja, en]) {
      const keys = Object.keys(dict);
      const oneKeys = keys.filter((k) => k.endsWith('.one'));
      for (const oneKey of oneKeys) {
        const base = oneKey.slice(0, -'.one'.length);
        expect(dict).toHaveProperty(`${base}.other`);
      }
    }
  });
});

describe('t() 基本動作', () => {
  it('既定は ja を返す', () => {
    expect(getLocale()).toBe('ja');
    expect(t('common.back')).toBe('戻る');
  });

  it('setLocale(en) で en を返す', () => {
    setLocale('en');
    expect(t('common.back')).toBe('Back');
  });

  it('未知キーはキー文字列をそのまま返す', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('{var} 補間が効く', () => {
    __test__.setCurrent('ja');
    expect(t('replay.turn', { current: 3, total: 36 })).toBe('ターン 3/36');
  });
});

describe('tn() 複数形', () => {
  it('en: count=1 は .one、count=2 は .other を選ぶ', () => {
    __test__.setCurrent('en');
    expect(tn('battle.opponent_disconnected', 1, { sec: 1 })).toContain('second)');
    expect(tn('battle.opponent_disconnected', 1, { sec: 1 })).not.toContain('seconds)');
    expect(tn('battle.opponent_disconnected', 2, { sec: 2 })).toContain('seconds)');
  });

  it('ja: 単複同形でも count に応じて解決し日本語を返す', () => {
    __test__.setCurrent('ja');
    expect(tn('battle.zone_wins', 1, { wins: 1 })).toBe('1/3ゾーン勝利');
    expect(tn('battle.zone_wins', 3, { wins: 3 })).toBe('3/3ゾーン勝利');
  });
});

describe('ko: 複数形なし言語の tn() が破綻しない(教訓1の実地検証)', () => {
  it('tn() が ko で日本語混入せず韓国語を返す(count=1/2 とも)', () => {
    __test__.setCurrent('ko');
    const one = tn('battle.zone_wins', 1, { wins: 1 });
    const many = tn('battle.zone_wins', 3, { wins: 3 });
    // ko は .one/.other 同一文字列。count に関わらず韓国語(=ja混入なし)
    expect(one).not.toContain('ゾーン');
    expect(many).not.toContain('ゾーン');
    expect(one).toContain('1');
    expect(many).toContain('3');
    expect(one).toBe(many.replace('3', '1')); // 単複同形(数値以外は同じ)
  });
});

describe('zh-CN: 複数形なし言語の tn() が破綻しない', () => {
  it('tn() が zh-CN で日本語混入せず中国語を返す(count=1/2 とも)', () => {
    __test__.setCurrent('zh-CN');
    const one = tn('battle.zone_wins', 1, { wins: 1 });
    const many = tn('battle.zone_wins', 3, { wins: 3 });
    expect(one).not.toContain('ゾーン');
    expect(many).not.toContain('ゾーン');
    expect(one).toContain('1');
    expect(many).toContain('3');
    expect(one).toBe(many.replace('3', '1')); // 単複同形(数値以外は同じ)
  });
});

describe('教訓1: lookupPlural の同一ロケール内フォールバック', () => {
  it('.one が無いロケールでも root/.other で解決し、正本(ja)へ流れて日本語混入しない', () => {
    // 複数形なし言語(ko/zh-CN)を模擬: .other のみ持つ辞書を一時注入
    const FAKE = 'xx' as never;
    (DICTS as Record<string, Record<string, string>>)[FAKE] = {
      'battle.zone_wins.other': '{wins}/3 존 승리', // 韓国語相当(.one 無し)
    };
    try {
      __test__.setCurrent(FAKE);
      // count=1 でも .one が無い → 同一ロケールの .other で解決(ja へ落ちない)
      const r = tn('battle.zone_wins', 1, { wins: 1 });
      expect(r).toBe('1/3 존 승리');
      expect(r).not.toContain('ゾーン'); // 日本語混入していない
    } finally {
      delete (DICTS as Record<string, Record<string, string>>)[FAKE];
    }
  });
});
