// @vitest-environment jsdom
// ============================================================
// tokenStore.test.ts — Platform JWT永続化のユニットテスト
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { saveTokens, getAccessToken, getRefreshToken, getUserId, clearTokens, isLoggedIn } from '../tokenStore';

function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'RS256' })}.${b64url(payload)}.signature`;
}

describe('tokenStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveTokens: access/refreshトークンを保存する', () => {
    saveTokens('access-abc', 'refresh-xyz');
    expect(getAccessToken()).toBe('access-abc');
    expect(getRefreshToken()).toBe('refresh-xyz');
  });

  it('saveTokens: refreshToken省略時は既存refreshTokenを消す', () => {
    saveTokens('access-1', 'refresh-1');
    saveTokens('access-2');
    expect(getAccessToken()).toBe('access-2');
    expect(getRefreshToken()).toBeNull();
  });

  it('saveTokens: JWTのsubからuserIdをキャッシュする', () => {
    const jwt = makeJwt({ sub: 'user-123', exp: 9999999999 });
    saveTokens(jwt);
    expect(getUserId()).toBe('user-123');
  });

  it('saveTokens: sub不在のJWTではuserIdを消す', () => {
    saveTokens(makeJwt({ sub: 'user-1' }));
    expect(getUserId()).toBe('user-1');
    saveTokens('not-a-valid-jwt');
    expect(getUserId()).toBeNull();
  });

  it('isLoggedIn: アクセストークンの有無で判定する', () => {
    expect(isLoggedIn()).toBe(false);
    saveTokens('access-1');
    expect(isLoggedIn()).toBe(true);
  });

  it('clearTokens: 全キーを消す', () => {
    saveTokens(makeJwt({ sub: 'user-9' }), 'refresh-9');
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getUserId()).toBeNull();
    expect(isLoggedIn()).toBe(false);
  });
});
