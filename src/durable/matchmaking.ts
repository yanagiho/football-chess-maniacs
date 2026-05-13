// ============================================================
// matchmaking.ts — マッチメイキング Durable Object（§4-2 シャード構成）
// リージョンごとに独立DOとして動作。
// ============================================================

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../worker';
import { verifyWebSocketToken } from '../middleware/jwt_verify';
import { WebSocketRateLimiter } from '../middleware/rate_limit';

/** 待機プレイヤー */
interface WaitingPlayer {
  userId: string;
  rating: number;
  teamId: string;
  joinedAt: number;
  region: string;
}

/** WebSocketにアタッチするメタデータ */
interface MmAttachment {
  userId: string;
  region: string;
}

const PHASE_1_MS = 10_000;   // 0~10秒: ±200
const PHASE_2_MS = 20_000;   // 10~20秒: ±400
const PHASE_3_MS = 30_000;   // 20~30秒: クロスリージョン
const COM_TIMEOUT_MS = 30_000; // 30秒超: COM提案
const MATCH_CHECK_INTERVAL_MS = 2_000;

export class Matchmaking extends DurableObject<Env['Bindings']> {
  private waitingPlayers = new Map<string, WaitingPlayer>();
  private rateLimiters = new Map<string, WebSocketRateLimiter>();

  // ── HTTP fetch ハンドラ（WebSocket upgrade） ──
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      // 内部API: Coordinatorからのクロスリージョン照会
      if (url.pathname === '/cross-region-query') {
        return this.handleCrossRegionQuery(request);
      }
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // §7-2: upgradeハンドラでJWT検証
    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('Missing token', { status: 401 });
    }

    let userId: string;
    try {
      const result = await verifyWebSocketToken(
        token,
        this.env.PLATFORM_JWKS_URL,
        undefined,
        this.env.PLATFORM_JWT_PUBLIC_KEY_PEM,
      );
      userId = result.userId;
    } catch (e) {
      return new Response(`Authentication failed: ${(e as Error).message}`, { status: 401 });
    }

    const region = url.searchParams.get('region') ?? 'europe';

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, region } satisfies MmAttachment);

    // マッチング開始のメッセージ送信を待つ
    server.send(JSON.stringify({ type: 'MATCHMAKING_CONNECTED', region }));

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── WebSocket Hibernation ハンドラ ──

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as MmAttachment;
    const userId = attachment.userId;

    // レート制限
    if (!this.rateLimiters.has(userId)) {
      this.rateLimiters.set(userId, new WebSocketRateLimiter());
    }
    const rateCheck = this.rateLimiters.get(userId)!.check();
    if (!rateCheck.allowed) return;

    if (typeof message !== 'string') return;

    let parsed: { type: string; [key: string]: unknown };
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    switch (parsed.type) {
      case 'JOIN_QUEUE':
        await this.handleJoinQueue(ws, attachment, parsed as unknown as {
          type: string;
          rating: number;
          teamId: string;
        });
        break;
      case 'LEAVE_QUEUE':
        this.handleLeaveQueue(userId);
        break;
      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG' }));
        break;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as MmAttachment;
    this.handleLeaveQueue(attachment.userId);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as MmAttachment;
    this.handleLeaveQueue(attachment.userId);
  }

  // ── キュー参加 ──

  private async handleJoinQueue(
    ws: WebSocket,
    attachment: MmAttachment,
    data: { rating: number; teamId: string },
  ): Promise<void> {
    const player: WaitingPlayer = {
      userId: attachment.userId,
      rating: data.rating,
      teamId: data.teamId,
      joinedAt: Date.now(),
      region: attachment.region,
    };

    this.waitingPlayers.set(attachment.userId, player);

    ws.send(JSON.stringify({
      type: 'QUEUE_JOINED',
      position: this.waitingPlayers.size,
    }));

    // KVにキュー状態を保存（Coordinator障害時のリストア用）
    await this.env.KV.put(
      `mm_queue:${attachment.region}`,
      JSON.stringify([...this.waitingPlayers.values()]),
      { expirationTtl: 120 },
    );

    // マッチング試行アラーム設定
    await this.ctx.storage.setAlarm(Date.now() + MATCH_CHECK_INTERVAL_MS);
  }

  // ── キュー離脱 ──

  private handleLeaveQueue(userId: string): void {
    this.waitingPlayers.delete(userId);
    this.rateLimiters.delete(userId);
  }

  // ── 定期マッチング試行（alarm） ──

  async alarm(): Promise<void> {
    if (this.waitingPlayers.size < 2) {
      // COM提案チェック
      for (const [userId, player] of this.waitingPlayers) {
        const waitTime = Date.now() - player.joinedAt;
        if (waitTime > COM_TIMEOUT_MS) {
          this.sendToPlayer(userId, {
            type: 'COM_SUGGESTED',
            message: 'No opponent found. Play against COM?',
            waitTimeSeconds: Math.floor(waitTime / 1000),
          });
        }
      }

      if (this.waitingPlayers.size > 0) {
        await this.ctx.storage.setAlarm(Date.now() + MATCH_CHECK_INTERVAL_MS);
      }
      return;
    }

    const players = [...this.waitingPlayers.values()];
    const matched: [WaitingPlayer, WaitingPlayer][] = [];
    const matchedIds = new Set<string>();

    // フェーズ別マッチング
    for (let i = 0; i < players.length; i++) {
      if (matchedIds.has(players[i].userId)) continue;

      const waitTime = Date.now() - players[i].joinedAt;
      const ratingRange = waitTime < PHASE_1_MS ? 200
        : waitTime < PHASE_2_MS ? 400
        : 1000; // フェーズ3以降は広範囲

      for (let j = i + 1; j < players.length; j++) {
        if (matchedIds.has(players[j].userId)) continue;

        const ratingDiff = Math.abs(players[i].rating - players[j].rating);
        if (ratingDiff <= ratingRange) {
          matched.push([players[i], players[j]]);
          matchedIds.add(players[i].userId);
          matchedIds.add(players[j].userId);
          break;
        }
      }
    }

    // マッチ成立処理
    for (const [p1, p2] of matched) {
      const matchId = `m_${crypto.randomUUID()}`;

      // GameSession DOを作成
      const doId = this.env.GAME_SESSION.idFromName(matchId);
      const stub = this.env.GAME_SESSION.get(doId);

      // 初期化リクエスト送信
      await stub.fetch(new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({
          matchId,
          homeUserId: p1.userId,
          awayUserId: p2.userId,
          homeTeamId: p1.teamId,
          awayTeamId: p2.teamId,
        }),
      }));

      // D1に試合サマリ作成
      await this.env.DB.prepare(
        'INSERT INTO matches (id, home_user_id, away_user_id, status, score_home, score_away, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)',
      )
        .bind(matchId, p1.userId, p2.userId, 'playing', new Date().toISOString())
        .run();

      // 両プレイヤーに通知
      const matchInfo = { type: 'MATCH_FOUND', matchId, opponent: '' };

      matchInfo.opponent = p2.userId;
      this.sendToPlayer(p1.userId, matchInfo);

      matchInfo.opponent = p1.userId;
      this.sendToPlayer(p2.userId, matchInfo);

      // キューから除去
      this.waitingPlayers.delete(p1.userId);
      this.waitingPlayers.delete(p2.userId);
    }

    // まだ待機中のプレイヤーがいれば次のアラーム
    if (this.waitingPlayers.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + MATCH_CHECK_INTERVAL_MS);
    }
  }

  // ── クロスリージョン照会（Coordinatorから） ──

  private async handleCrossRegionQuery(request: Request): Promise<Response> {
    const { rating, ratingRange } = (await request.json()) as { rating: number; ratingRange: number };

    const candidates = [...this.waitingPlayers.values()]
      .filter((p) => Math.abs(p.rating - rating) <= ratingRange)
      .sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating));

    return new Response(JSON.stringify({ candidates: candidates.slice(0, 5) }));
  }

  // ── ヘルパー ──

  private sendToPlayer(userId: string, data: unknown): void {
    for (const ws of this.ctx.getWebSockets(userId)) {
      try {
        ws.send(JSON.stringify(data));
      } catch {
        // 送信失敗は無視
      }
    }
  }
}
