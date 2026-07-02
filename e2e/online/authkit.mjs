// ============================================================
// authkit.mjs — ローカルE2E検証用のJWT発行基盤
// テスト用RSA鍵ペアを実行時に生成し、JWKSをローカルHTTPで配信、
// その秘密鍵でRS256 JWTを署名する。本番の認証情報は一切使わない。
// wrangler dev 側は src/.dev.vars の PLATFORM_JWKS_URL=http://127.0.0.1:8790/jwks.json
// を参照する（issuer/audienceも .dev.vars と一致させること）。
// ============================================================

import { generateKeyPairSync, createPrivateKey, createSign, randomUUID } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// 鍵をファイルに永続化して kid を安定させる（テスト専用鍵。gitignore対象）
const KEY_FILE = fileURLToPath(new URL('./.authkit-key.json', import.meta.url));

function loadOrCreateKey() {
  try {
    const saved = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    return {
      privateKey: createPrivateKey({ key: saved.privateJwk, format: 'jwk' }),
      publicJwk: saved.publicJwk,
      kid: saved.kid,
    };
  } catch {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = `e2e-${randomUUID().slice(0, 8)}`;
    const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
    const privateJwk = privateKey.export({ format: 'jwk' });
    fs.writeFileSync(KEY_FILE, JSON.stringify({ kid, publicJwk, privateJwk }));
    return { privateKey, publicJwk, kid };
  }
}

export const E2E_ISSUER = 'https://fcms-e2e.local';
export const E2E_AUDIENCE = 'football-chess-maniacs';
export const JWKS_PORT = 8790;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function startAuthKit(port = JWKS_PORT) {
  const { privateKey, publicJwk: jwk, kid } = loadOrCreateKey();

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/jwks.json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(port, '127.0.0.1');

  /** sub のユーザー向けJWTを署名（exp は残2時間チェックを満たす3時間後） */
  const signToken = (sub, overrides = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT', kid };
    const payload = {
      iss: E2E_ISSUER, aud: E2E_AUDIENCE, sub,
      iat: now, exp: now + 3 * 60 * 60,
      ...overrides,
    };
    const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signer = createSign('RSA-SHA256');
    signer.update(input);
    const sig = signer.sign(privateKey);
    return `${input}.${b64url(sig)}`;
  };

  return { signToken, kid, stop: () => server.close() };
}
