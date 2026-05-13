// ============================================================
// worker.ts — Cloudflare Workers エントリポイント（Hono）
// ============================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

import authRoutes from './api/auth';
import teamRoutes from './api/team';
import matchRoutes from './api/match';
import replayRoutes from './api/replay';
import aiRoutes from './api/ai';
import piecesRoutes from './api/pieces';
import shopRoutes from './api/shop';
import webhookRoutes from './api/webhooks';
import { jwtMiddleware, verifyJwt } from './middleware/jwt_verify';
import { rateLimitMiddleware, RATE_LIMITS } from './middleware/rate_limit';

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
    // Service bindings
    PLATFORM_API?: Fetcher;
    // Vars
    CORS_ORIGIN: string;
    PLATFORM_API_BASE: string;
    AI_MODEL_ID: string;
    // Secrets
    PLATFORM_JWKS_URL: string;
    /** @deprecated Use PLATFORM_GAME_SERVER_TOKEN (gfp_ Bearer token). Kept for rollback. */
    PLATFORM_SERVICE_API_KEY: string;
    PLATFORM_HMAC_SECRET: string;
    /** Game server token issued by Platform P3 Admin API (gfp_xxxx...) */
    PLATFORM_GAME_SERVER_TOKEN: string;
    /** Platform JWT public key fallback used when JWKS fetch is unavailable. */
    PLATFORM_JWT_PUBLIC_KEY_PEM?: string;
    /** game_id registered in Platform games table */
    PLATFORM_GAME_ID: string;
  };
  Variables: {
    userId: string;
  };
}

const app = new Hono<Env>();

// ── グローバルミドルウェア ──

// CORS（§7-1: ゲームオリジンのみ許可）
// WebSocket upgradeはCORS不要（ブラウザはWS upgradeにCORSを適用しない）
app.use('*', async (c, next) => {
  if (c.req.header('Upgrade')?.toLowerCase() === 'websocket') {
    return next();
  }
  const corsMiddleware = cors({
    origin: c.env.CORS_ORIGIN,
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
      connectSrc: ["'self'", 'wss://football-chess-maniacs.yanagiho.workers.dev', 'https://fc-platform-api.yanagiho.workers.dev'],
      imgSrc: ["'self'", 'https://r2.example.com'],
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
  })(c, next);
});

// ── ヘルスチェック ──
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
  // レート制限のみ適用（DO大量生成の防止）
  if (c.req.path === '/match/com' && c.req.method === 'POST') {
    return rateLimitMiddleware(RATE_LIMITS.restApi)(c, next);
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
      const payload = await verifyJwt(token, c.env.PLATFORM_JWKS_URL, c.env.PLATFORM_JWT_PUBLIC_KEY_PEM);
      c.set('userId', payload.sub);
    } catch (e) {
      console.warn('[shop] Optional JWT verification failed:', e instanceof Error ? e.message : 'Unknown error');
      // JWT検証失敗でもカタログ閲覧は許可（userIdなし）
    }
  }
  return next();
});
shopApp.route('/', shopRoutes);
app.route('/api/shop', shopApp);

// ── AI エンドポイント（認証なし: COM対戦 + テスト用） ──
// JWT認証の外に配置。COM対戦はログイン不要で動作する必要がある。
// レート制限のみ適用。
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

app.route('/api', api);

// ── Queues Consumer（試合結果の非同期永続化 §5-2） ──

export default {
  fetch: app.fetch,

  /** Queues Consumer: 試合結果をD1/R2に永続化 + Platform match finish API送信 */
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
        // D1: 試合サマリ更新
        await env.DB.prepare(
          'UPDATE matches SET status = ?, score_home = ?, score_away = ?, finished_at = ? WHERE id = ?',
        )
          .bind('completed', data.scoreHome, data.scoreAway, data.finishedAt, data.matchId)
          .run();

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

        // Platform match finish API 送信 (P6)
        // COM対戦の away (AI) は user_id null で送信
        if (env.PLATFORM_GAME_SERVER_TOKEN && env.PLATFORM_API_BASE) {
          try {
            const isComMatch = !data.awayUserId || data.awayUserId.startsWith('com_');
            const participants: { user_id?: string | null; side: string; stats: Record<string, number> }[] = [
              {
                user_id: data.homeUserId,
                side: 'home',
                stats: { goals: data.scoreHome },
              },
            ];
            if (isComMatch) {
              participants.push({
                user_id: null,
                side: 'away',
                stats: { goals: data.scoreAway },
              });
            } else {
              participants.push({
                user_id: data.awayUserId,
                side: 'away',
                stats: { goals: data.scoreAway },
              });
            }

            const winnerSide = data.scoreHome > data.scoreAway ? 'home'
              : data.scoreAway > data.scoreHome ? 'away'
              : null;

            const finishRes = await fetch(`${env.PLATFORM_API_BASE}/v1/game/matches/finish`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.PLATFORM_GAME_SERVER_TOKEN}`,
              },
              body: JSON.stringify({
                external_match_id: data.matchId,
                mode: isComMatch ? 'com' : 'pvp',
                ended_at: data.finishedAt,
                winner_side: winnerSide,
                score: { home: data.scoreHome, away: data.scoreAway },
                participants,
              }),
            });

            // 200 = duplicate (idempotent), 201 = created — both are success
            if (!finishRes.ok && finishRes.status !== 200) {
              console.error(`[queue] Platform match finish failed: ${finishRes.status} ${finishRes.statusText}`);
            }
          } catch (platformErr) {
            // Platform failure should not block D1/R2 persistence — log and continue
            console.error('[queue] Platform match finish error:', platformErr);
          }
        }

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
