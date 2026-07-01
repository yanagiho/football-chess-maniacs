// ============================================================
// ssoFragment.ts — Universo Futbol からの SSO ハンドオフ受信
// URL fragment `#uf_sso=<base64url JSON>` を消費してトークンを保存する。
// GrassrootsFootball (threejs-client/src/auth/tokenStore.js の
// consumeUniversoSsoFromHash) とキー名・エンコード方式が完全一致する実装。
// 2026-07-01時点でuniverso-frontpage側はこのfragmentを生成していない
// （将来ポータル側が対応した際にそのまま機能する想定のdormant実装）。
// ============================================================

import { saveTokens } from './tokenStore';

const SSO_HASH_KEY = 'uf_sso';

function decodeBase64UrlJson(value: string): unknown {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function removeSsoHashParam(): void {
  if (typeof window === 'undefined') return;
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return;
  const params = new URLSearchParams(raw);
  if (!params.has(SSO_HASH_KEY)) return;
  params.delete(SSO_HASH_KEY);
  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`;
  window.history.replaceState(null, '', nextUrl);
}

/**
 * Universo Futbol からの SSO payload を URL fragment から消費する。
 * 成功時は即座にトークンを保存し、fragment を可視URLから除去する。
 * @returns トークンを保存できたら true
 */
export function consumeUniversoSsoFromHash(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return false;

  const params = new URLSearchParams(raw);
  const encoded = params.get(SSO_HASH_KEY);
  if (!encoded) return false;

  try {
    const payload = decodeBase64UrlJson(encoded) as { access_token?: unknown; refresh_token?: unknown };
    if (!payload || typeof payload.access_token !== 'string' || payload.access_token.length === 0) return false;
    saveTokens(
      payload.access_token,
      typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined,
    );
    return true;
  } catch (err) {
    console.warn('[auth] failed to consume Universo SSO payload:', err);
    return false;
  } finally {
    removeSsoHashParam();
  }
}
