// ============================================================
// game_session.ts — ゲームセッション Durable Object（§4-3, §4-4）
// 1試合 = 1DO。WebSocket Hibernation API対応。
// ============================================================

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../worker';
import { verifyWebSocketToken } from '../middleware/jwt_verify';
import { validateTurnInput, type TurnInput, type PieceInfo } from '../middleware/validation';
import { WebSocketRateLimiter } from '../middleware/rate_limit';

/** ゲーム状態（DO永続ストレージに保存） */
interface GameState {
  matchId: string;
  homeUserId: string;
  awayUserId: string;
  turn: number;
  /** ボード状態（engine/types.ts のBoard互換） */
  board: unknown;
  scoreHome: number;
  scoreAway: number;
  status: 'waiting' | 'playing' | 'finished';
  /** ターンタイマー開始時刻 */
  turnStartedAt: number | null;
  /** 各プレイヤーの最終sequence */
  lastSequences: Record<string, number>;
  /** 使用済みnonce（直近100件） */
  usedNonces: string[];
  /** 残り交代回数 */
  remainingSubs: Record<string, number>;
  /** 切断中のプレイヤー */
  disconnectedPlayers: Record<string, number>;
  /** ターンログ（R2永続化キュー経由で書き込み） */
  turnLog: unknown[];
}

/** WebSocketにアタッチするメタデータ */
interface WsAttachment {
  userId: string;
  team: 'home' | 'away';
}

const TURN_TIMEOUT_MS = 60_000;       // 1分
const DISCONNECT_GRACE_MS = 30_000;   // 30秒
const MAX_NONCE_HISTORY = 200;

export class GameSession extends DurableObject<Env['Bindings']> {
  private rateLimiters = new Map<string, WebSocketRateLimiter>();
  private turnInputs = new Map<string, TurnInput>();

  // ── HTTP fetch ハンドラ ──
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // /init: Matchmaking DOからゲーム状態を初期化する
    if (url.pathname.endsWith('/init') && request.method === 'POST') {
      return this.handleInit(request);
    }

    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // §7-2: upgradeハンドラでJWT検証 → 未認証接続は一切存在しない
    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('Missing token', { status: 401 });
    }

    let userId: string;
    try {
      const state = await this.getGameState();
      const players = state ? [state.homeUserId, state.awayUserId] : undefined;
      const result = await verifyWebSocketToken(
        token,
        this.env.PLATFORM_JWKS_URL,
        players,
      );
      userId = result.userId;
    } catch (e) {
      // 検証失敗 → upgradeを拒否（HTTP 401）
      return new Response(`Authentication failed: ${(e as Error).message}`, { status: 401 });
    }

    // WebSocket Hibernation API でペアを作成
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const state = await this.getGameState();
    const team = state?.homeUserId === userId ? 'home' : 'away';

    // サーバー側WebSocketにメタデータをアタッチ
    this.ctx.acceptWebSocket(server, [userId]);

    // アタッチメント情報を保存
    server.serializeAttachment({ userId, team } satisfies WsAttachment);

    // 切断復帰処理
    if (state?.disconnectedPlayers[userId]) {
      delete state.disconnectedPlayers[userId];
      await this.ctx.storage.put('gameState', state);

      // 現在のゲーム状態を送信
      server.send(JSON.stringify({
        type: 'RECONNECT',
        state: {
          turn: state.turn,
          board: state.board,
          scoreHome: state.scoreHome,
          scoreAway: state.scoreAway,
        },
      }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── ゲーム初期化（Matchmaking DOから呼ばれる） ──
  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as {
      matchId: string;
      homeUserId: string;
      awayUserId: string;
    };

    const existingState = await this.getGameState();
    if (existingState) {
      return new Response(JSON.stringify({ error: 'Already initialized' }), { status: 409 });
    }

    const state: GameState = {
      matchId: body.matchId,
      homeUserId: body.homeUserId,
      awayUserId: body.awayUserId,
      turn: 1,
      board: null,
      scoreHome: 0,
      scoreAway: 0,
      status: 'playing',
      turnStartedAt: Date.now(),
      lastSequences: {},
      usedNonces: [],
      remainingSubs: { [body.homeUserId]: 3, [body.awayUserId]: 3 },
      disconnectedPlayers: {},
      turnLog: [],
    };

    await this.ctx.storage.put('gameState', state);

    // ターンタイマー設定
    await this.ctx.storage.setAlarm(Date.now() + TURN_TIMEOUT_MS);

    return new Response(JSON.stringify({ ok: true, matchId: body.matchId }), { status: 200 });
  }

  // ── WebSocket Hibernation ハンドラ ──

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment;
    const userId = attachment.userId;

    // レート制限チェック（§7-4: 10msg/秒）
    if (!this.rateLimiters.has(userId)) {
      this.rateLimiters.set(userId, new WebSocketRateLimiter());
    }
    const rateCheck = this.rateLimiters.get(userId)!.check();
    if (!rateCheck.allowed) {
      if (rateCheck.warn) {
        ws.send(JSON.stringify({ type: 'RATE_LIMIT_WARNING' }));
      }
      return; // メッセージ破棄
    }

    if (typeof message !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
      return;
    }

    const msg = parsed as { type: string; [key: string]: unknown };

    switch (msg.type) {
      case 'TURN_INPUT':
        await this.handleTurnInput(ws, attachment, msg as unknown as TurnInput);
        break;
      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        break;
      default:
        ws.send(JSON.stringify({ type: 'ERROR', message: `Unknown message type: ${msg.type}` }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment;
    await this.handleDisconnect(attachment.userId);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment;
    await this.handleDisconnect(attachment.userId);
  }

  // ── ターン入力処理 ──

  private async handleTurnInput(ws: WebSocket, attachment: WsAttachment, input: TurnInput): Promise<void> {
    const state = await this.getGameState();
    if (!state || state.status !== 'playing') {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not in progress' }));
      return;
    }

    // §7-3 入力バリデーション
    const pieces: PieceInfo[] = []; // TODO: boardからPieceInfoに変換
    const lastSeqMap = new Map(Object.entries(state.lastSequences).map(([k, v]) => [k, v]));
    const usedNonces = new Set(state.usedNonces);

    const validation = validateTurnInput(
      input,
      state.matchId,
      [state.homeUserId, state.awayUserId],
      lastSeqMap,
      usedNonces,
      pieces,
      attachment.team,
      state.remainingSubs[attachment.userId] ?? 3,
    );

    if (validation.rejected) {
      ws.send(JSON.stringify({
        type: 'INPUT_REJECTED',
        violations: validation.violations,
      }));
      return;
    }

    // sequence/nonce更新
    state.lastSequences[input.player_id] = input.sequence;
    state.usedNonces.push(input.nonce);
    if (state.usedNonces.length > MAX_NONCE_HISTORY) {
      state.usedNonces = state.usedNonces.slice(-MAX_NONCE_HISTORY);
    }

    // ターン入力をバッファに保存
    this.turnInputs.set(attachment.userId, input);

    ws.send(JSON.stringify({ type: 'INPUT_ACCEPTED', turn: state.turn }));

    // 両者入力済みか確認
    if (this.turnInputs.size >= 2) {
      await this.resolveTurn(state);
    } else {
      await this.ctx.storage.put('gameState', state);
    }
  }

  // ── ターン解決 ──

  private async resolveTurn(state: GameState): Promise<void> {
    // TODO: engine/turn_processor.ts の processTurn を呼び出し
    // ゲームエンジンとの統合は別途実装

    state.turn++;
    state.turnStartedAt = Date.now();

    // ターンログを記録
    state.turnLog.push({
      turn: state.turn - 1,
      inputs: Object.fromEntries(this.turnInputs),
      // result: turnResult, // TODO
      timestamp: Date.now(),
    });

    this.turnInputs.clear();
    await this.ctx.storage.put('gameState', state);

    // 両プレイヤーに結果配信
    const result = {
      type: 'TURN_RESULT',
      turn: state.turn,
      board: state.board,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
      // events: turnResult.events, // TODO
    };

    this.broadcast(JSON.stringify(result));

    // 試合終了チェック（最大90ターン）
    if (state.turn > 90) {
      await this.endMatch(state, 'completed');
    } else {
      // ターンタイマー設定（1分）
      await this.ctx.storage.setAlarm(Date.now() + TURN_TIMEOUT_MS);
    }
  }

  // ── ターンタイマー（alarm） ──

  async alarm(): Promise<void> {
    const state = await this.getGameState();
    if (!state || state.status !== 'playing') return;

    // 切断監視チェック
    for (const [userId, disconnectedAt] of Object.entries(state.disconnectedPlayers)) {
      if (Date.now() - disconnectedAt > DISCONNECT_GRACE_MS) {
        // §8-1: 30秒超過で自動敗北
        const loser = userId === state.homeUserId ? 'home' : 'away';
        await this.endMatch(state, 'disconnect', loser);
        return;
      }
    }

    // ターンタイムアウト：未入力プレイヤーは「全コマ指示なし」
    if (this.turnInputs.size < 2) {
      // 未入力側の入力をデフォルト（静止）で補完
      if (!this.turnInputs.has(state.homeUserId)) {
        this.turnInputs.set(state.homeUserId, createEmptyTurnInput(state.matchId, state.turn, state.homeUserId));
      }
      if (!this.turnInputs.has(state.awayUserId)) {
        this.turnInputs.set(state.awayUserId, createEmptyTurnInput(state.matchId, state.turn, state.awayUserId));
      }
      await this.resolveTurn(state);
    }
  }

  // ── 切断処理 ──

  private async handleDisconnect(userId: string): Promise<void> {
    const state = await this.getGameState();
    if (!state || state.status !== 'playing') return;

    state.disconnectedPlayers[userId] = Date.now();
    await this.ctx.storage.put('gameState', state);

    // 相手に通知
    this.broadcast(JSON.stringify({
      type: 'OPPONENT_DISCONNECTED',
      graceSeconds: DISCONNECT_GRACE_MS / 1000,
    }), userId);

    // 切断タイムアウトアラーム: 既存アラーム（ターンタイマー）より後なら設定しない
    // DOは1アラームのみなので、早い方を優先
    const disconnectAlarmTime = Date.now() + DISCONNECT_GRACE_MS;
    const existingAlarm = await this.ctx.storage.getAlarm();
    if (!existingAlarm || disconnectAlarmTime < existingAlarm) {
      await this.ctx.storage.setAlarm(disconnectAlarmTime);
    }
  }

  // ── 試合終了 ──

  private async endMatch(
    state: GameState,
    reason: 'completed' | 'disconnect',
    disconnectLoser?: 'home' | 'away',
  ): Promise<void> {
    state.status = 'finished';
    await this.ctx.storage.put('gameState', state);

    const result = {
      type: 'MATCH_END',
      reason,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
      disconnectLoser,
    };
    this.broadcast(JSON.stringify(result));

    // Queues経由で試合結果を非同期永続化（§5-2）
    await this.env.MATCH_RESULT_QUEUE.send({
      matchId: state.matchId,
      homeUserId: state.homeUserId,
      awayUserId: state.awayUserId,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
      reason,
      disconnectLoser,
      turnLog: state.turnLog,
      finishedAt: new Date().toISOString(),
    });
  }

  // ── ヘルパー ──

  private async getGameState(): Promise<GameState | null> {
    return (await this.ctx.storage.get<GameState>('gameState')) ?? null;
  }

  /** 全接続にブロードキャスト（excludeで特定ユーザーを除外可能） */
  private broadcast(message: string, excludeUserId?: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as WsAttachment | null;
      if (excludeUserId && attachment?.userId === excludeUserId) continue;
      try {
        ws.send(message);
      } catch {
        // 送信失敗は無視（closeイベントで処理）
      }
    }
  }
}

/** 空のターン入力（タイムアウト時のデフォルト） */
function createEmptyTurnInput(matchId: string, turn: number, playerId: string): TurnInput {
  return {
    match_id: matchId,
    turn,
    player_id: playerId,
    sequence: -1,
    nonce: `timeout_${turn}_${playerId}`,
    orders: [],
    client_hash: '',
    timestamp: Date.now(),
  };
}
