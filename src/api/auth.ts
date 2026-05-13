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
 * プラットフォームAPIを呼び出す共通ヘルパー
 * P3 game server token (gfp_...) Bearer認証
 */
export async function callPlatformApi<T>(
  env: Env['Bindings'],
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${env.PLATFORM_API_BASE}${path}`;
  const token = env.PLATFORM_GAME_SERVER_TOKEN;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Platform API error: ${res.status} ${res.statusText}`);
  }

  const body = await res.text();
  return JSON.parse(body) as T;
}

/**
 * 所持コマ取得（KVキャッシュ付き、§8-2）
 * TTL 1時間。プラットフォーム障害時はキャッシュフォールバック。
 */
export interface OwnedPiece {
  piece_master_id: string;
  position: string;
  cost: number;
  rarity: string;
}

export async function getOwnedPieces(
  env: Env['Bindings'],
  userId: string,
): Promise<{ pieces: OwnedPiece[]; fromCache: boolean }> {
  const cacheKey = `owned_pieces:${userId}`;

  // キャッシュ確認
  const cached = await env.KV.get(cacheKey, 'json') as OwnedPiece[] | null;

  try {
    const pieces = await callPlatformApi<{ items: OwnedPiece[] }>(
      env,
      `/users/${userId}/entitlements?game=fcms`,
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

// NOTE: Legacy /purchase webhook endpoint removed.
// Entitlement webhooks are handled by webhooks.ts POST /webhook/purchase.

export default auth;
