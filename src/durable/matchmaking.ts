// ============================================================
// matchmaking.ts — マッチメイキング Durable Object（§4-2 シャード構成）
// リージョンごとに独立DOとして動作。
// ============================================================

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../worker';
import { verifyWebSocketToken } from '../middleware/jwt_verify';
import { WebSocketRateLimiter } from '../middleware/rate_limit';
import { getRating } from '../server/rating';

/** 待機プレイヤー */
interface WaitingPlayer {
  userId: string;
  rating: number;
  teamId: string;
  joinedAt: number;
  region: string;
  /** マッチングプールはモード別に分離（ranked同士/casual同士のみ）。casualはレーティング対象外 */
  mode: 'ranked' | 'casual';
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
      const result = await verifyWebSocketToken(token, this.env.PLATFORM_JWKS_URL, {
        issuer: this.env.PLATFORM_JWT_ISSUER,
        audience: this.env.PLATFORM_JWT_AUDIENCE,
        clockSkewSeconds: 60,
      });
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
    data: { rating: number; teamId: string; mode?: string },
  ): Promise<void> {
    // レーティングはクライアント申告を信用せず、D1 のサーバー権威値を使う（詐称防止）
    const rating = await getRating(this.env.DB, attachment.userId);
    const player: WaitingPlayer = {
      userId: attachment.userId,
      rating,
      teamId: data.teamId,
      joinedAt: Date.now(),
      region: attachment.region,
      // 未指定（旧クライアント）はranked扱い
      mode: data.mode === 'casual' ? 'casual' : 'ranked',
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
      // COM_TIMEOUT_MS超過 → Botで補完（人が見つからなくても一定時間内に試合を開始する）
      const overdue = [...this.waitingPlayers.values()].filter(
        (player) => Date.now() - player.joinedAt > COM_TIMEOUT_MS,
      );
      for (const player of overdue) {
        await this.assignBotMatch(player);
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
        // モード別プール: ranked同士/casual同士のみマッチさせる
        // （分けないと「相手はランク戦のつもり、自分はカジュアル」の非対称が生まれる）
        if (players[i].mode !== players[j].mode) continue;

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
      // カジュアルは casual_ プレフィックス（isRatedMatch がレーティング対象外として認識する。
      // friend_/com_ と同じプレフィックス方式でモードをマッチレコード(matches.id)に保存）
      const matchId = p1.mode === 'casual' ? `casual_${crypto.randomUUID()}` : `m_${crypto.randomUUID()}`;

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

      // 両プレイヤーに通知（p1=home / p2=away。GameSession /init の割当と一致させる）
      // teamを送らないと両クライアントが'home'にフォールバックし、away側が
      // 自分のコマを操作できなくなる（E2E検証で発見したバグの修正）
      this.sendToPlayer(p1.userId, { type: 'MATCH_FOUND', matchId, opponent: p2.userId, team: 'home' });
      this.sendToPlayer(p2.userId, { type: 'MATCH_FOUND', matchId, opponent: p1.userId, team: 'away' });

      // キューから除去
      this.waitingPlayers.delete(p1.userId);
      this.waitingPlayers.delete(p2.userId);
    }

    // まだ待機中のプレイヤーがいれば次のアラーム
    if (this.waitingPlayers.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + MATCH_CHECK_INTERVAL_MS);
    }
  }

  // ── Botで補完（一定時間、対戦相手が見つからない場合のフォールバック） ──

  private async assignBotMatch(player: WaitingPlayer): Promise<void> {
    // Bot補完は両モードで有効。matchIdプレフィックスはモードに従う
    // （Bot戦はもともと awayUserId='com_ai' によりレーティング対象外）
    const matchId = player.mode === 'casual' ? `casual_${crypto.randomUUID()}` : `m_${crypto.randomUUID()}`;
    // 'com_ai' は既存の isRatedMatch（src/server/rating.ts）がレーティング対象外として
    // 認識する予約IDのため、Bot補完マッチはそのままレーティング/ランキング対象から除外される。
    const botUserId = 'com_ai';

    // GameSession DOを isComMatch=true で作成（DO側がaway命令を自動生成する）
    const doId = this.env.GAME_SESSION.idFromName(matchId);
    const stub = this.env.GAME_SESSION.get(doId);
    await stub.fetch(new Request('https://internal/init', {
      method: 'POST',
      body: JSON.stringify({
        matchId,
        homeUserId: player.userId,
        awayUserId: botUserId,
        homeTeamId: player.teamId,
        awayTeamId: 'default',
        isComMatch: true,
      }),
    }));

    // D1に試合サマリ作成
    await this.env.DB.prepare(
      'INSERT INTO matches (id, home_user_id, away_user_id, status, score_home, score_away, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)',
    )
      .bind(matchId, player.userId, botUserId, 'playing', new Date().toISOString())
      .run();

    this.sendToPlayer(player.userId, { type: 'MATCH_FOUND', matchId, opponent: botUserId, team: 'home' });

    this.waitingPlayers.delete(player.userId);
    this.rateLimiters.delete(player.userId);
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
