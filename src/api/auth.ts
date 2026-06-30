// ============================================================
// auth.ts — プラットフォーム認証検証API（§2-2, §7-5）
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';

const auth = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();
const DEFAULT_PLATFORM_API_TIMEOUT_MS = 15_000;
const DEFAULT_PLATFORM_GAME_ID = 'football_chess_maniacs';

export type PlatformAuthMode = 'game' | 'user' | 'none';

export interface PlatformApiOptions extends RequestInit {
  timeoutMs?: number;
  authMode?: PlatformAuthMode;
  userToken?: string;
  idempotencyKey?: string;
}

export class PlatformApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, statusText: string, body: string) {
    super(`Platform API error: ${status} ${statusText}`);
    this.status = status;
    this.body = body;
  }
}

export function getPlatformGameId(env: Env['Bindings']): string {
  return env.PLATFORM_GAME_ID || DEFAULT_PLATFORM_GAME_ID;
}

export function getBearerToken(authorization: string | undefined | null): string | null {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * HMAC-SHA256署名を検証（§7-5）
 */
export async function verifyHmacSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sigBytes = hexToBytes(signature);
  return crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(body));
}

function hexToBytes(hex: string): ArrayBuffer {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * プラットフォームAPIを呼び出す共通ヘルパー
 * 現行Platform仕様:
 * - User操作は Authorization: Bearer <Platform JWT>
 * - Game server操作は Authorization: Bearer <gfp_...>
 * - POSTは Idempotency-Key 必須
 * - Platform APIレスポンスはHMAC署名しない（WebhookのみHMAC検証）
 */
export async function callPlatformApi<T>(
  env: Env['Bindings'],
  path: string,
  options?: PlatformApiOptions,
): Promise<T> {
  const url = buildPlatformApiUrl(env, path);
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PLATFORM_API_TIMEOUT_MS;
  let externalAbortHandler: (() => void) | undefined;
  const timeoutId = setTimeout(() => controller.abort('Platform API timeout'), timeoutMs);

  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      externalAbortHandler = () => controller.abort(options.signal?.reason);
      options.signal.addEventListener('abort', externalAbortHandler, { once: true });
    }
  }

  const { timeoutMs: _timeoutMs, authMode = 'game', userToken, idempotencyKey, ...fetchOptions } = options ?? {};
  const headers = new Headers(fetchOptions.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (fetchOptions.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (authMode === 'user') {
    if (!userToken) throw new Error('Platform user token is required');
    headers.set('Authorization', `Bearer ${userToken}`);
  } else if (authMode === 'game') {
    if (!env.PLATFORM_GAME_SERVER_TOKEN) throw new Error('PLATFORM_GAME_SERVER_TOKEN is not configured');
    headers.set('Authorization', `Bearer ${env.PLATFORM_GAME_SERVER_TOKEN}`);
  }

  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers,
    });
  } catch (e) {
    if (controller.signal.aborted && controller.signal.reason === 'Platform API timeout') {
      throw new Error('Platform API timeout');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
    if (options?.signal && externalAbortHandler) {
      options.signal.removeEventListener('abort', externalAbortHandler);
    }
  }

  const body = await res.text();
  if (!res.ok) {
    throw new PlatformApiError(res.status, res.statusText, body);
  }

  return (body ? JSON.parse(body) : {}) as T;
}

function buildPlatformApiUrl(env: Env['Bindings'], path: string): string {
  let base: URL;
  try {
    base = new URL(env.PLATFORM_API_BASE);
  } catch {
    throw new Error('Invalid PLATFORM_API_BASE');
  }

  const allowInsecureLocal = env.ALLOW_INSECURE_PLATFORM_API === 'true';
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(allowInsecureLocal && isLocalhost)) {
    throw new Error('PLATFORM_API_BASE must use https');
  }

  try {
    new URL(path);
    throw new Error('Platform API path must be relative');
  } catch (e) {
    if (e instanceof Error && e.message === 'Platform API path must be relative') throw e;
  }

  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  const relativePath = path.startsWith('/') ? path.slice(1) : path;
  base.pathname = basePath;
  return new URL(relativePath, base).toString();
}

/**
 * 所持コマ取得（KVキャッシュ付き、§8-2）
 * TTL 1時間。プラットフォーム障害時はキャッシュフォールバック。
 */
export interface OwnedPiece {
  sku?: string;
  piece_master_id: string;
  position: string;
  cost: number;
  rarity: string;
}

export async function getOwnedPieces(
  env: Env['Bindings'],
  userId: string,
  userToken?: string,
): Promise<{ pieces: OwnedPiece[]; fromCache: boolean }> {
  const cacheKey = `owned_pieces:${userId}`;

  // キャッシュ確認
  const cached = await env.KV.get(cacheKey, 'json') as OwnedPiece[] | null;

  try {
    if (!userToken) throw new Error('Missing Platform user token');
    const pieces = await callPlatformApi<{ items: OwnedPiece[] }>(
      env,
      `/v1/entitlements?game_id=${encodeURIComponent(getPlatformGameId(env))}&tag=fcms_piece`,
      { authMode: 'user', userToken },
    );

    // ビジネスロジック整合性チェック（§7-5）
    if (pieces.items.length > 200) {
      throw new Error('Too many pieces returned from platform API');
    }
    const validated = pieces.items.filter(
      (p) => p.cost >= 1 && p.cost <= 3,
    );

    // キャッシュ更新
    await env.KV.put(cacheKey, JSON.stringify(validated), { expirationTtl: 3600 });

    return { pieces: validated, fromCache: false };
  } catch {
    // プラットフォーム障害時のフォールバック（§8-2）
    if (cached) {
      return { pieces: cached, fromCache: true };
    }
    throw new Error('Platform API unavailable and no cache available');
  }
}

// ── Webhookエンドポイント（キャッシュ即時無効化）──
auth.post('/purchase', async (c) => {
  const signature = c.req.header('X-HMAC-Signature');
  if (!signature) {
    return c.json({ error: 'Missing signature' }, 401);
  }

  const body = await c.req.text();
  const valid = await verifyHmacSignature(body, signature, c.env.PLATFORM_HMAC_SECRET);
  if (!valid) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  let data: { user_id: string; event: string };
  try {
    data = JSON.parse(body) as { user_id: string; event: string };
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!data.user_id || typeof data.user_id !== 'string') {
    return c.json({ error: 'Missing user_id' }, 400);
  }

  if (data.event === 'purchase_complete') {
    await c.env.KV.delete(`owned_pieces:${data.user_id}`);
  }

  return c.json({ ok: true });
});

export default auth;
