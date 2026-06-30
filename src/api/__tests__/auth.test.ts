import { afterEach, describe, expect, it, vi } from 'vitest';
import { callPlatformApi } from '../auth';
import type { Env } from '../../worker';

function env(overrides: Partial<Env['Bindings']> = {}): Env['Bindings'] {
  return {
    PLATFORM_API_BASE: 'https://platform.example.test/api',
    PLATFORM_GAME_SERVER_TOKEN: 'gfp-token',
    PLATFORM_HMAC_SECRET: 'secret',
    ...overrides,
  } as Env['Bindings'];
}

describe('callPlatformApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('URL APIでbase/pathを結合しGame Server Tokenで呼び出す', async () => {
    const body = JSON.stringify({ ok: true });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body, {
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await callPlatformApi<{ ok: boolean }>(env(), '/users/u1');
    expect(result).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://platform.example.test/api/users/u1');
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer gfp-token');
  });

  it('user authとIdempotency-Keyを付けてPOSTできる', async () => {
    const body = JSON.stringify({ ok: true });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await callPlatformApi(env(), '/v1/commerce/purchase', {
      method: 'POST',
      authMode: 'user',
      userToken: 'user-jwt',
      idempotencyKey: 'idem-1',
      body: JSON.stringify({ product_id: 'p1' }),
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://platform.example.test/api/v1/commerce/purchase');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer user-jwt');
    expect(headers.get('Idempotency-Key')).toBe('idem-1');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('http base URL を拒否する', async () => {
    await expect(callPlatformApi(env({ PLATFORM_API_BASE: 'http://platform.example.test' }), '/users/u1'))
      .rejects.toThrow('PLATFORM_API_BASE must use https');
  });

  it('localhost http は明示フラグがある場合だけ許可する', async () => {
    const body = JSON.stringify({ ok: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status: 200,
    })));

    await expect(callPlatformApi(env({
      PLATFORM_API_BASE: 'http://localhost:8787',
      ALLOW_INSECURE_PLATFORM_API: 'true',
    }), '/health', { authMode: 'none' })).resolves.toEqual({ ok: true });
  });

  it('絶対URL pathを拒否する', async () => {
    await expect(callPlatformApi(env(), 'https://evil.example/steal'))
      .rejects.toThrow('Platform API path must be relative');
  });

  it('timeout時はPlatform API timeoutを投げる', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));

    await expect(callPlatformApi(env(), '/slow', { timeoutMs: 1 }))
      .rejects.toThrow('Platform API timeout');
  });
});
