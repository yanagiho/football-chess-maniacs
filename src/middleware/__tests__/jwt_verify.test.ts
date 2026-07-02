import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetJwksCacheForTests, verifyJwt } from '../jwt_verify';

const JWKS_URL = 'https://platform.example.test/.well-known/jwks.json';
const ISSUER = 'https://platform.example.test';
const AUDIENCE = 'football-chess-maniacs';

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createJwtFactory() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const kid = 'test-key-1';

  async function signToken({
    header = {},
    payload = {},
  }: {
    header?: Record<string, unknown>;
    payload?: Record<string, unknown>;
  } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const tokenHeader = { alg: 'RS256', kid, typ: 'JWT', ...header };
    const tokenPayload = {
      sub: 'user-1',
      iss: ISSUER,
      aud: AUDIENCE,
      iat: now,
      exp: now + 3600,
      ...payload,
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(tokenHeader));
    const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlEncode(signature)}`;
  }

  return {
    kid,
    publicJwk: { ...publicJwk, kid, alg: 'RS256', use: 'sig' },
    signToken,
  };
}

describe('verifyJwt', () => {
  beforeEach(() => {
    resetJwksCacheForTests();
    vi.restoreAllMocks();
  });

  async function setup() {
    const factory = await createJwtFactory();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ keys: [factory.publicJwk] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    return factory;
  }

  const options = {
    issuer: ISSUER,
    audience: AUDIENCE,
    clockSkewSeconds: 60,
  };

  it('alg が RS256 なら通る', async () => {
    const { signToken } = await setup();
    const payload = await verifyJwt(await signToken(), JWKS_URL, options);
    expect(payload.sub).toBe('user-1');
  });

  it('alg が none / HS256 なら落ちる', async () => {
    const { signToken } = await setup();
    await expect(verifyJwt(await signToken({ header: { alg: 'none' } }), JWKS_URL, options))
      .rejects.toThrow('Unsupported JWT alg');
    await expect(verifyJwt(await signToken({ header: { alg: 'HS256' } }), JWKS_URL, options))
      .rejects.toThrow('Unsupported JWT alg');
  });

  it('iss 不一致で落ちる', async () => {
    const { signToken } = await setup();
    await expect(verifyJwt(await signToken({ payload: { iss: 'https://evil.example' } }), JWKS_URL, options))
      .rejects.toThrow('Invalid JWT issuer');
  });

  it('aud 不一致で落ちる', async () => {
    const { signToken } = await setup();
    await expect(verifyJwt(await signToken({ payload: { aud: 'other-game' } }), JWKS_URL, options))
      .rejects.toThrow('Invalid JWT audience');
  });

  it('aud 配列に期待値が含まれる場合は通る', async () => {
    const { signToken } = await setup();
    const payload = await verifyJwt(
      await signToken({ payload: { aud: ['other-game', AUDIENCE] } }),
      JWKS_URL,
      options,
    );
    expect(payload.aud).toEqual(['other-game', AUDIENCE]);
  });

  it('exp 期限切れで落ちる', async () => {
    const { signToken } = await setup();
    const now = Math.floor(Date.now() / 1000);
    await expect(verifyJwt(await signToken({ payload: { exp: now - 61 } }), JWKS_URL, options))
      .rejects.toThrow('JWT expired');
  });

  it('nbf が未来すぎる場合は落ちる', async () => {
    const { signToken } = await setup();
    const now = Math.floor(Date.now() / 1000);
    // clockSkew(60s)+1秒 だと署名〜検証の間に秒境界を跨ぐと成立しなくなりフレーキーだったため、
    // skew を余裕を持って超える値にする
    await expect(verifyJwt(await signToken({ payload: { nbf: now + 120 } }), JWKS_URL, options))
      .rejects.toThrow('JWT not active yet');
  });

  it('未知のkidはキャッシュを無視して再フェッチする（鍵ローテーション対応）', async () => {
    // 1本目の鍵でキャッシュを温める
    const first = await createJwtFactory();
    // 2本目の鍵（ローテーション後の新しい鍵）
    const second = await createJwtFactory();
    const secondJwk = { ...second.publicJwk, kid: 'test-key-2' };

    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      // 1回目は旧鍵のみ、2回目以降は両方の鍵を返す（ローテーションを模擬）
      const keys = call === 1 ? [first.publicJwk] : [first.publicJwk, secondJwk];
      return new Response(JSON.stringify({ keys }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }));

    // 旧鍵で検証してキャッシュを作る
    await verifyJwt(await first.signToken(), JWKS_URL, options);
    expect(call).toBe(1);

    // 新kidのトークン → キャッシュに無い → 強制再フェッチで成功する
    // （旧実装は5分キャッシュを盲信して Unknown kid で落ちていた）
    const newKidToken = await second.signToken({ header: { kid: 'test-key-2' } });
    await expect(verifyJwt(newKidToken, JWKS_URL, options)).resolves.toMatchObject({ sub: 'user-1' });
    expect(call).toBe(2);
  });

  it('sub 欠落で落ちる', async () => {
    const { signToken } = await setup();
    await expect(verifyJwt(await signToken({ payload: { sub: undefined } }), JWKS_URL, options))
      .rejects.toThrow('Invalid JWT subject');
  });
});
