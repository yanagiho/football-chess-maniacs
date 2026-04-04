// ============================================================
// jwt_verify.ts — JWT検証ミドルウェア（§7-2）
// プラットフォームJWKSで署名検証 + 有効期限 + ユーザーID抽出
// ============================================================

import type { Context, Next } from 'hono';
import type { Env } from '../worker';

/** JWKSから取得した公開鍵のキャッシュ */
let cachedKeys: Map<string, CryptoKey> = new Map();
let cacheExpiry = 0;

interface JwtHeader {
  alg: string;
  kid: string;
}

interface JwtPayload {
  sub: string;    // ユーザーID
  exp: number;    // 有効期限 (unix seconds)
  iat: number;    // 発行時刻
  iss: string;    // 発行者
  [key: string]: unknown;
}

/** base64url → ArrayBuffer */
function base64UrlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** JWKSエンドポイントから公開鍵を取得・キャッシュ */
async function fetchJwks(jwksUrl: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (cachedKeys.size > 0 && now < cacheExpiry) {
    return cachedKeys;
  }

  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);

  const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid?: string })[] };
  const keyMap = new Map<string, CryptoKey>();

  for (const jwk of keys) {
    if (jwk.kty === 'RSA' && jwk.kid) {
      const cryptoKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      keyMap.set(jwk.kid, cryptoKey);
    }
  }

  cachedKeys = keyMap;
  cacheExpiry = now + 5 * 60 * 1000; // 5分キャッシュ
  return keyMap;
}

/** JWTを検証してペイロードを返す */
export async function verifyJwt(
  token: string,
  jwksUrl: string,
): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const headerJson = new TextDecoder().decode(base64UrlDecode(parts[0]));
  const header: JwtHeader = JSON.parse(headerJson);

  const keys = await fetchJwks(jwksUrl);
  const key = keys.get(header.kid);
  if (!key) throw new Error(`Unknown kid: ${header.kid}`);

  const signatureInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    signatureInput,
  );
  if (!valid) throw new Error('Invalid JWT signature');

  const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
  const payload: JwtPayload = JSON.parse(payloadJson);

  // 有効期限チェック
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) throw new Error('JWT expired');

  return payload;
}

/**
 * REST API用JWTミドルウェア（Bearerトークン検証）
 * 検証成功時、c.set('userId', sub) にユーザーIDをセット
 */
export function jwtMiddleware() {
  return async (c: Context<{ Bindings: Env['Bindings']; Variables: { userId: string } }>, next: Next) => {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const token = auth.slice(7);
    try {
      const payload = await verifyJwt(token, c.env.PLATFORM_JWKS_URL);
      c.set('userId', payload.sub);
    } catch (e) {
      return c.json({ error: 'Authentication failed' }, 401);
    }

    await next();
  };
}

/**
 * WebSocket upgrade時のJWT検証（§7-2）
 * URLクエリパラメータ ?token= からトークンを取得・検証
 * 最低2時間の残存期間を要求
 */
export async function verifyWebSocketToken(
  token: string,
  jwksUrl: string,
  expectedMatchPlayers?: string[],
): Promise<{ userId: string; payload: JwtPayload }> {
  const payload = await verifyJwt(token, jwksUrl);

  // 最低2時間の残存期間チェック（§7-2-b）
  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = payload.exp - now;
  const TWO_HOURS = 2 * 60 * 60;
  if (remainingSeconds < TWO_HOURS) {
    throw new Error('Token must have at least 2 hours remaining');
  }

  // マッチプレイヤーID一致確認（§7-2-c）
  if (expectedMatchPlayers && !expectedMatchPlayers.includes(payload.sub)) {
    throw new Error('User is not a participant of this match');
  }

  return { userId: payload.sub, payload };
}
