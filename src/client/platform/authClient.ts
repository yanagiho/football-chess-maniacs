// ============================================================
// authClient.ts — Universo Futbol Platform API 認証クライアント
// ブラウザから fc-platform-api を直接叩く（CORS全開放、GRFと同一パターン）。
// GrassrootsFootball (threejs-client/src/auth/platformClient.js) を移植。
// ============================================================

import { getPlatformApiUrl } from './config';
import { saveTokens, getAccessToken, getRefreshToken, clearTokens } from './tokenStore';

const API_PREFIX = '/v1';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  [key: string]: unknown;
}

type AuthResult =
  | { ok: true; data: TokenResponse }
  | { ok: false; error: string };

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function getApiError(data: unknown, status: number): string {
  const d = data as { error?: string; error_code?: string; message?: string } | null;
  return d?.error || d?.error_code || d?.message || `HTTP ${status}`;
}

// ── 認証状態の変更通知（React側はuseAuthフックがこれを購読する） ──
type AuthChangeListener = (loggedIn: boolean) => void;
const authChangeListeners: AuthChangeListener[] = [];

export function onAuthChange(callback: AuthChangeListener): () => void {
  authChangeListeners.push(callback);
  return () => {
    const idx = authChangeListeners.indexOf(callback);
    if (idx >= 0) authChangeListeners.splice(idx, 1);
  };
}

function notifyAuthChange(loggedIn: boolean): void {
  for (const cb of authChangeListeners) {
    try { cb(loggedIn); } catch (e) { console.error('[authClient] onAuthChange callback error:', e); }
  }
}

/** メール + パスワードでログイン */
export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${getPlatformApiUrl()}${API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createIdempotencyKey() },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null) as TokenResponse | null;
  if (!res.ok || !data) return { ok: false, error: getApiError(data, res.status) };

  saveTokens(data.access_token, data.refresh_token);
  notifyAuthChange(true);
  return { ok: true, data };
}

/** メール + パスワードで新規登録 */
export async function register(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${getPlatformApiUrl()}${API_PREFIX}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createIdempotencyKey() },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null) as TokenResponse | null;
  if (!res.ok || !data) return { ok: false, error: getApiError(data, res.status) };

  saveTokens(data.access_token, data.refresh_token);
  notifyAuthChange(true);
  return { ok: true, data };
}

// リフレッシュの同時実行を1本化（複数箇所で同時401→複数refreshを防ぐ）
let refreshPromise: Promise<boolean> | null = null;

/** リフレッシュトークンでアクセストークンを更新する */
export async function refresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const rt = getRefreshToken();
    if (!rt) {
      clearTokens();
      notifyAuthChange(false);
      return false;
    }
    try {
      const res = await fetch(`${getPlatformApiUrl()}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': createIdempotencyKey() },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) {
        clearTokens();
        notifyAuthChange(false);
        return false;
      }
      const data = await res.json() as TokenResponse;
      saveTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      // ネットワークエラーはトークンを消さない（オフライン耐性）
      return false;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export function logout(): void {
  clearTokens();
  notifyAuthChange(false);
}

/**
 * 認証付きfetch。Bearerトークンを自動付与し、401時は1回だけrefreshしてリトライする。
 * @param path /v1 以降のパス（例: '/users/me'）
 */
export async function authFetch(path: string, options: RequestInit = {}, _isRetry = false): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${getPlatformApiUrl()}${API_PREFIX}${path}`, { ...options, headers });

  if (res.status === 401 && !_isRetry) {
    const refreshed = await refresh();
    if (refreshed) return authFetch(path, options, true);
  }
  return res;
}
