// ============================================================
// crypto_utils.test.ts — timingSafeEqual / MATCH_ID_PATTERN テスト
// ============================================================

import { describe, it, expect } from 'vitest';
import { timingSafeEqual, MATCH_ID_PATTERN } from '../crypto_utils';

// ============================================================
// timingSafeEqual
// ============================================================
describe('timingSafeEqual', () => {
  it('同一文字列でtrueを返す', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
  });

  it('空文字列同士でtrueを返す', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('UUID形式の同一トークンでtrueを返す', () => {
    const token = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(timingSafeEqual(token, token)).toBe(true);
  });

  it('異なる文字列でfalseを返す', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
  });

  it('長さが異なる文字列でfalseを返す', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('空文字列と非空文字列でfalseを返す', () => {
    expect(timingSafeEqual('', 'a')).toBe(false);
  });

  it('1文字だけ異なる場合にfalseを返す', () => {
    expect(timingSafeEqual(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
    )).toBe(false);
  });

  it('日本語文字列の比較が正しい', () => {
    expect(timingSafeEqual('テスト', 'テスト')).toBe(true);
    expect(timingSafeEqual('テスト', 'テスタ')).toBe(false);
  });

  it('prefix一致でも全体が異なればfalse', () => {
    expect(timingSafeEqual('abcdef', 'abcxyz')).toBe(false);
  });
});

// ============================================================
// MATCH_ID_PATTERN
// ============================================================
describe('MATCH_ID_PATTERN', () => {
  it('通常のmatchIdを受理する', () => {
    expect(MATCH_ID_PATTERN.test('com_1713780000000')).toBe(true);
    expect(MATCH_ID_PATTERN.test('gemma_com_1713780000000_a1b2c3d4e5f6')).toBe(true);
    expect(MATCH_ID_PATTERN.test('match_abc-123')).toBe(true);
  });

  it('英数字・アンダースコア・ハイフンのみ許可', () => {
    expect(MATCH_ID_PATTERN.test('abc123')).toBe(true);
    expect(MATCH_ID_PATTERN.test('a-b_c')).toBe(true);
    expect(MATCH_ID_PATTERN.test('ABC')).toBe(true);
  });

  it('パストラバーサル文字を拒否する', () => {
    expect(MATCH_ID_PATTERN.test('../../../etc/passwd')).toBe(false);
    expect(MATCH_ID_PATTERN.test('replays/../secret')).toBe(false);
    expect(MATCH_ID_PATTERN.test('match/../../')).toBe(false);
  });

  it('特殊文字を拒否する', () => {
    expect(MATCH_ID_PATTERN.test('match id')).toBe(false);  // スペース
    expect(MATCH_ID_PATTERN.test('match\nid')).toBe(false);  // 改行
    expect(MATCH_ID_PATTERN.test('match;DROP TABLE')).toBe(false);
    expect(MATCH_ID_PATTERN.test('')).toBe(false);  // 空文字列
  });

  it('ドットを拒否する', () => {
    expect(MATCH_ID_PATTERN.test('match.json')).toBe(false);
    expect(MATCH_ID_PATTERN.test('.hidden')).toBe(false);
  });
});
