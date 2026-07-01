// @vitest-environment jsdom
// ============================================================
// ssoFragment.test.ts — #uf_sso= フラグメント消費のユニットテスト
// GrassrootsFootball の consumeUniversoSsoFromHash と同一契約であることを検証する。
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { consumeUniversoSsoFromHash } from '../ssoFragment';
import { getAccessToken, getRefreshToken, clearTokens } from '../tokenStore';

function encodeSso(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('consumeUniversoSsoFromHash', () => {
  beforeEach(() => {
    clearTokens();
    window.history.replaceState(null, '', '/');
  });

  it('#uf_sso=<base64url JSON> からaccess_token/refresh_tokenを保存する', () => {
    const encoded = encodeSso({ access_token: 'acc-1', refresh_token: 'ref-1' });
    window.history.replaceState(null, '', `/#uf_sso=${encoded}`);

    const result = consumeUniversoSsoFromHash();

    expect(result).toBe(true);
    expect(getAccessToken()).toBe('acc-1');
    expect(getRefreshToken()).toBe('ref-1');
  });

  it('消費後はfragmentを可視URLから除去する', () => {
    const encoded = encodeSso({ access_token: 'acc-2' });
    window.history.replaceState(null, '', `/#uf_sso=${encoded}`);

    consumeUniversoSsoFromHash();

    expect(window.location.hash).toBe('');
  });

  it('他のfragmentパラメータは保持したままuf_ssoだけ除去する', () => {
    const encoded = encodeSso({ access_token: 'acc-3' });
    window.history.replaceState(null, '', `/#foo=bar&uf_sso=${encoded}`);

    consumeUniversoSsoFromHash();

    expect(window.location.hash).toBe('#foo=bar');
  });

  it('fragmentが無ければfalseを返しトークンも保存しない', () => {
    window.history.replaceState(null, '', '/');
    expect(consumeUniversoSsoFromHash()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('uf_ssoキーが無ければfalseを返す', () => {
    window.history.replaceState(null, '', '/#other=value');
    expect(consumeUniversoSsoFromHash()).toBe(false);
  });

  it('access_tokenが無い/不正なpayloadはfalseを返す', () => {
    const encoded = encodeSso({ refresh_token: 'only-refresh' });
    window.history.replaceState(null, '', `/#uf_sso=${encoded}`);
    expect(consumeUniversoSsoFromHash()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });
});
