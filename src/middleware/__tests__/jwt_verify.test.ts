import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyJwt } from '../jwt_verify';

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('verifyJwt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('paddingなしbase64urlのPlatform JWTを検証できる', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = `test-${crypto.randomUUID()}`;
    const publicJwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }],
    }))));

    const now = Math.floor(Date.now() / 1000);
    const header = encodeJson({ alg: 'RS256', typ: 'JWT', kid });
    const payload = encodeJson({
      sub: 'user-123',
      iat: now,
      exp: now + 60,
      iss: 'football-century',
      type: 'access',
    });
    const signingInput = `${header}.${payload}`;
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');

    const verified = await verifyJwt(`${signingInput}.${signature}`, 'https://example.com/jwks.json');

    expect(verified.sub).toBe('user-123');
  });

  it('JWKS取得失敗時は公開鍵PEMフォールバックで検証できる', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = `test-${crypto.randomUUID()}`;
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));

    const now = Math.floor(Date.now() / 1000);
    const header = encodeJson({ alg: 'RS256', typ: 'JWT', kid });
    const payload = encodeJson({
      sub: 'user-456',
      iat: now,
      exp: now + 60,
      iss: 'football-century',
      type: 'access',
    });
    const signingInput = `${header}.${payload}`;
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');

    const verified = await verifyJwt(`${signingInput}.${signature}`, 'https://example.com/jwks.json', publicPem);

    expect(verified.sub).toBe('user-456');
  });
});
