// ============================================================
// worker.ts — Cloudflare Workers エントリポイント（Hono）
// ============================================================

import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import teamRoutes from './api/team';
import matchRoutes from './api/match';
import replayRoutes from './api/replay';
import aiRoutes from './api/ai';
import piecesRoutes from './api/pieces';
import rankingRoutes from './api/ranking';
import shopRoutes from './api/shop';
import webhookRoutes from './api/webhooks';
import { jwtMiddleware, verifyJwt } from './middleware/jwt_verify';
import { rateLimitMiddleware, RATE_LIMITS } from './middleware/rate_limit';
import { persistRatings, isRatedMatch } from './server/rating';

// ── Durable Objects 再エクスポート ──
export { GameSession } from './durable/game_session';
export { Matchmaking } from './durable/matchmaking';

// ── 環境バインディング型定義 ──
export interface Env {
  Bindings: {
    // Durable Objects
    GAME_SESSION: DurableObjectNamespace;
    MATCHMAKING: DurableObjectNamespace;
    // D1
    DB: D1Database;
    // KV
    KV: KVNamespace;
    // R2
    R2: R2Bucket;
    // Queues
    MATCH_RESULT_QUEUE: Queue;
    // Workers AI
    AI: Ai;
    // Service Bindings
    PLATFORM?: Fetcher;
    // Vars
    CORS_ORIGIN: string;
    PLATFORM_API_BASE: string;
    PLATFORM_GAME_ID: string;
    GAME_CLIENT_URL?: string;
    PLATFORM_CHECKOUT_RETURN_URL?: string;
    AI_MODEL_ID: string;
    // Secrets
    PLATFORM_JWKS_URL: string;
    PLATFORM_GAME_SERVER_TOKEN: string;
    /** Internal debug/service key. Kept separate from Platform auth. */
    PLATFORM_SERVICE_API_KEY?: string;
    PLATFORM_HMAC_SECRET: string;
    PLATFORM_JWT_ISSUER: string;
    PLATFORM_JWT_AUDIENCE: string;
    /** 開発時のみ http://localhost Platform API を許可 */
    ALLOW_INSECURE_PLATFORM_API?: string;
  };
  Variables: {
    userId: string;
  };
}

const app = new Hono<Env>();
const CLIENT_ASSET_ORIGIN = 'https://football-chess-maniacs.pages.dev';

function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveRequestOrigin(requestOrigin: string | undefined, allowedOrigins: string[]): string | undefined {
  if (allowedOrigins.length === 0) return undefined;
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) return requestOrigin;
  return allowedOrigins[0];
}

function getClientUrl(env: Env['Bindings']): string {
  return env.GAME_CLIENT_URL || 'https://football-chess-maniacs.pages.dev';
}

function redirectToClient(c: Context<Env>, path = ''): Response {
  const target = new URL(path || '/', getClientUrl(c.env));
  const source = new URL(c.req.url);
  source.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  return c.redirect(target.toString(), 302);
}

async function proxyClientAsset(c: Context<Env>): Promise<Response> {
  const source = new URL(c.req.url);
  if (source.hostname === 'www.footballchess.io') {
    source.hostname = 'footballchess.io';
    return Response.redirect(source.toString(), 301);
  }

  const target = new URL(source.pathname + source.search, CLIENT_ASSET_ORIGIN);
  const headers = new Headers(c.req.raw.headers);
  headers.delete('host');
  return fetch(target.toString(), {
    method: c.req.method,
    headers,
    redirect: 'manual',
  });
}

// ── グローバルミドルウェア ──

// CORS（§7-1: ゲームオリジンのみ許可）
// WebSocket upgradeはCORS不要（ブラウザはWS upgradeにCORSを適用しない）
app.use('*', async (c, next) => {
  if (c.req.header('Upgrade')?.toLowerCase() === 'websocket') {
    return next();
  }
  const allowedOrigins = parseAllowedOrigins(c.env.CORS_ORIGIN);
  const corsMiddleware = cors({
    origin: (origin) => resolveRequestOrigin(origin, allowedOrigins) ?? origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    maxAge: 86400,
  });
  return corsMiddleware(c, next);
});

// セキュリティヘッダー（§7-1: HSTS, CSP等）
// WebSocket upgradeレスポンス(101)はヘッダーがimmutableなのでスキップ
app.use('*', async (c, next) => {
  if (c.req.header('Upgrade')?.toLowerCase() === 'websocket') {
    return next();
  }
  return secureHeaders({
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: [
        "'self'",
        'https://footballchess.io',
        'https://www.footballchess.io',
        'https://football-chess-maniacs.pages.dev',
        'https://football-chess-maniacs.yanagiho.workers.dev',
        'wss://football-chess-maniacs.yanagiho.workers.dev',
      ],
      // Reactインラインスタイル + index.html/App.tsxのインライン<style>があるため'unsafe-inline'必須
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
  })(c, next);
});

// ── ヘルスチェック ──
app.get('/', (c) => proxyClientAsset(c));
app.get('/purchase/success', (c) => redirectToClient(c, '/?purchase=success'));
app.get('/purchase/cancel', (c) => redirectToClient(c, '/?purchase=cancel'));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// ── Webhook（認証不要、独自署名検証） ──
app.route('/webhook', webhookRoutes);

// ── WebSocket エンドポイント（JWT検証はDO内で実行） ──
// REST API（非WebSocket）パスにはJWT認証を適用
app.use('/match/*', async (c, next) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() === 'websocket') {
    // WebSocket upgradeはDO内でJWT検証するのでスキップ
    return next();
  }
  // COM対戦セッション作成は認証不要（ログインなしでCOM対戦可能）
  // 専用レート制限のみ適用（DO大量生成の防止）
  if (c.req.path === '/match/com' && c.req.method === 'POST') {
    return rateLimitMiddleware(RATE_LIMITS.comSessionCreateMinute)(c, async () => {
      await rateLimitMiddleware(RATE_LIMITS.comSessionCreateHour)(c, next);
    });
  }
  // フレンド対戦の作成/参加は認証必須 + レート制限（ルーム/DO大量生成の防止）
  if (c.req.path === '/match/friend/create' || c.req.path === '/match/friend/join') {
    return jwtMiddleware()(c, async () => {
      await rateLimitMiddleware(RATE_LIMITS.matching)(c, next);
    });
  }
  // REST APIパスにはJWT認証を適用
  return jwtMiddleware()(c, next);
});
app.route('/match', matchRoutes);

// ── Shop エンドポイント（カタログ閲覧は公開、購入はJWT必要） ──
// JWT認証の外に配置。catalogはログイン不要で閲覧可能。
// purchaseはshop.ts内でuserIdチェック。
// 注意: /api/shop は /api より先にマウント（Honoはマウント順でマッチする）
const shopApp = new Hono<Env>();
shopApp.use('*', rateLimitMiddleware(RATE_LIMITS.restApi));
// JWT optional: Bearer トークンがあれば検証してuserId設定、なくても通過
shopApp.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const payload = await verifyJwt(token, c.env.PLATFORM_JWKS_URL, {
        issuer: c.env.PLATFORM_JWT_ISSUER,
        audience: c.env.PLATFORM_JWT_AUDIENCE,
        clockSkewSeconds: 60,
      });
      c.set('userId', payload.sub);
    } catch {
      // JWT検証失敗でもカタログ閲覧は許可（userIdなし）
    }
  }
  return next();
});
shopApp.route('/', shopRoutes);
app.route('/api/shop', shopApp);

// ── AI エンドポイント ──
// /turn はログイン不要COM対戦用にレート制限のみ。
// /test は api/ai.ts 内でサービスキー必須。
const aiApp = new Hono<Env>();
aiApp.use('*', rateLimitMiddleware(RATE_LIMITS.restApi));
aiApp.route('/', aiRoutes);
app.route('/api/ai', aiApp);

// ── REST API（JWT認証 + レート制限が必要なルート） ──
const api = new Hono<Env>();
api.use('*', jwtMiddleware());
api.use('*', rateLimitMiddleware(RATE_LIMITS.restApi));

api.route('/teams', teamRoutes);
api.route('/replays', replayRoutes);
api.route('/pieces', piecesRoutes);
api.route('/ranking', rankingRoutes);

app.route('/api', api);

// ── Client fallback ──
// footballchess.io はWorker Custom Domainで受け、API以外の静的アセット/SPAルートはPages本体へプロキシする。
app.get('*', (c) => proxyClientAsset(c));

// ── Queues Consumer（試合結果の非同期永続化 §5-2） ──

export default {
  fetch: app.fetch,

  /** Queues Consumer: 試合結果をD1/R2に永続化 */
  async queue(
    batch: MessageBatch,
    env: Env['Bindings'],
  ): Promise<void> {
    for (const msg of batch.messages) {
      const data = msg.body as {
        matchId: string;
        homeUserId: string;
        awayUserId: string;
        scoreHome: number;
        scoreAway: number;
        reason: string;
        disconnectLoser?: string;
        turnLog: unknown[];
        finishedAt: string;
      };

      try {
        // D1: 試合サマリ更新（disconnectは status を分けて記録）
        const matchStatus = data.reason === 'disconnect' ? 'disconnect' : 'completed';
        await env.DB.prepare(
          'UPDATE matches SET status = ?, score_home = ?, score_away = ?, finished_at = ? WHERE id = ?',
        )
          .bind(matchStatus, data.scoreHome, data.scoreAway, data.finishedAt, data.matchId)
          .run();

        // D1: レーティング更新（COM/フレンド戦は対象外）
        if (isRatedMatch(data.matchId, data.homeUserId, data.awayUserId)) {
          let scoreHome: 0 | 0.5 | 1;
          if (data.reason === 'disconnect' && data.disconnectLoser) {
            scoreHome = data.disconnectLoser === 'home' ? 0 : 1;
          } else {
            scoreHome = data.scoreHome > data.scoreAway ? 1
              : data.scoreHome < data.scoreAway ? 0 : 0.5;
          }
          await persistRatings(env.DB, data.homeUserId, data.awayUserId, scoreHome, data.finishedAt);
        }

        // R2: 詳細ログ（棋譜）保存
        const logData = JSON.stringify({
          matchId: data.matchId,
          homeUserId: data.homeUserId,
          awayUserId: data.awayUserId,
          turns: data.turnLog,
          finishedAt: data.finishedAt,
        });

        // gzip圧縮してR2に保存
        const compressed = await compressGzip(logData);
        await env.R2.put(`replays/${data.matchId}.json.gz`, compressed, {
          customMetadata: {
            matchId: data.matchId,
            finishedAt: data.finishedAt,
          },
        });

        msg.ack();
      } catch (e) {
        console.error(`Failed to persist match ${data.matchId}:`, e);
        msg.retry();
      }
    }
  },
};

/** テキストをgzip圧縮 */
async function compressGzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream();
  const compressed = stream.pipeThrough(new CompressionStream('gzip'));
  return new Response(compressed).arrayBuffer();
}
