// ============================================================
// auth.ts — プラットフォーム認証検証API（§2-2, §7-5）
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';

const auth = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();

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
 * ユーザー向け Platform API を呼び出す（User JWT Bearer認証）
 * /v1/commerce/*, /v1/entitlements/*, /v1/inventory/*, /v1/users/* 等
 */
export async function callPlatformUserApi<T>(
  env: Env['Bindings'],
  path: string,
  userJwt: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${env.PLATFORM_API_BASE}${path}`;
  const merged: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${userJwt}`,
  };
  // POST に Idempotency-Key を自動付与（caller が未指定の場合）
  const incomingHeaders = options?.headers as Record<string, string> | undefined;
  if (options?.method === 'POST' && !incomingHeaders?.['Idempotency-Key']) {
    merged['Idempotency-Key'] = crypto.randomUUID();
  }
  Object.assign(merged, incomingHeaders);

  const request = new Request(url, {
    ...options,
    headers: merged,
  });
  const res = env.PLATFORM_API
    ? await env.PLATFORM_API.fetch(request)
    : await fetch(request);

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Platform API error: ${res.status} ${res.statusText} ${path} ${errorBody.slice(0, 500)}`);
  }

  const body = await res.text();
  return JSON.parse(body) as T;
}

/**
 * ゲームサーバー → Platform API を呼び出す（gfp_ game server token Bearer認証）
 * /v1/game/* ルート専用（gameAuthMiddleware が適用されるエンドポイント）
 */
export async function callPlatformGameApi<T>(
  env: Env['Bindings'],
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${env.PLATFORM_API_BASE}${path}`;
  const token = env.PLATFORM_GAME_SERVER_TOKEN;
  const request = new Request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options?.headers,
    },
  });
  const res = env.PLATFORM_API
    ? await env.PLATFORM_API.fetch(request)
    : await fetch(request);

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Platform API error: ${res.status} ${res.statusText} ${path} ${errorBody.slice(0, 500)}`);
  }

  const body = await res.text();
  return JSON.parse(body) as T;
}

// NOTE: Legacy getOwnedPieces / /purchase endpoint removed.
// Piece ownership is managed via user_pieces_v2 (D1) + Platform webhooks (webhooks.ts).
// Polling sync uses callPlatformUserApi in pieces.ts.

export default auth;
