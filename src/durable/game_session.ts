// ============================================================
// game_session.ts — ゲームセッション Durable Object（§4-3, §4-4）
// 1試合 = 1DO。WebSocket Hibernation API対応。
// ============================================================

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../worker';
import { verifyWebSocketToken } from '../middleware/jwt_verify';
import { validateTurnInput, type TurnInput, type PieceInfo } from '../middleware/validation';
import { WebSocketRateLimiter } from '../middleware/rate_limit';
import { processTurn, hasGoal, getFoulEvent } from '../engine/turn_processor';
import type { Order, Team } from '../engine/types';
import type { Difficulty, Era } from '../ai/prompt_builder';
import {
  type GameState, type WsAttachment,
  TURN_TIMEOUT_MS, DISCONNECT_GRACE_MS, MAX_NONCE_HISTORY,
  TURNS_PER_HALF, MAX_AT,
  boardContext, boardToPieceInfos, rawOrderToEngine,
  createInitialBoard, createEmptyTurnInput,
} from './game_session_helpers';
import { generateComOrders } from './com_ai_integration';
import { timingSafeEqual } from '../middleware/crypto_utils';

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

    // COM対戦セッション: JWT不要（userIdはクエリパラメータから取得）
    const existingState = await this.getGameState();
    const isComSession = existingState?.isComMatch === true;

    let userId: string;
    if (isComSession) {
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response('Missing token for COM session', { status: 401 });
      }
      if (!existingState?.comSessionToken || !timingSafeEqual(token, existingState.comSessionToken)) {
        return new Response('Invalid COM session token', { status: 403 });
      }
      userId = existingState.homeUserId;
    } else {
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response('Missing token', { status: 401 });
      }

      try {
        const players = existingState ? [existingState.homeUserId, existingState.awayUserId] : undefined;
        const result = await verifyWebSocketToken(
          token,
          this.env.PLATFORM_JWKS_URL,
          players,
          this.env.PLATFORM_JWT_PUBLIC_KEY_PEM,
        );
        userId = result.userId;
      } catch (e) {
        return new Response(`Authentication failed: ${(e as Error).message}`, { status: 401 });
      }
    }

    // WebSocket Hibernation API でペアを作成
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const state = existingState;
    const team = state?.homeUserId === userId ? 'home' : 'away';

    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, team } satisfies WsAttachment);

    // 切断復帰処理
    if (state?.disconnectedPlayers[userId]) {
      delete state.disconnectedPlayers[userId];
      await this.ctx.storage.put('gameState', state);

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
      isComMatch?: boolean;
      comSessionToken?: string;
      comDifficulty?: Difficulty;
      comEra?: Era;
    };

    const existingState = await this.getGameState();
    if (existingState) {
      return new Response(JSON.stringify({ error: 'Already initialized' }), { status: 409 });
    }

    const kickoffTeam: Team = Math.random() < 0.5 ? 'home' : 'away';
    const firstHalfAT = Math.floor(Math.random() * MAX_AT) + 1;
    const secondHalfAT = Math.floor(Math.random() * MAX_AT) + 1;
    const halfTimeTurn = TURNS_PER_HALF + firstHalfAT;
    const totalTurns = halfTimeTurn + TURNS_PER_HALF + secondHalfAT;

    const state: GameState = {
      matchId: body.matchId,
      homeUserId: body.homeUserId,
      awayUserId: body.awayUserId,
      turn: 1,
      board: createInitialBoard(kickoffTeam),
      scoreHome: 0,
      scoreAway: 0,
      status: 'playing',
      turnStartedAt: Date.now(),
      lastSequences: {},
      usedNonces: [],
      remainingSubs: { [body.homeUserId]: 3, [body.awayUserId]: 3 },
      disconnectedPlayers: {},
      turnLog: [],
      half: 1,
      firstHalfAT,
      secondHalfAT,
      halfTimeTurn,
      totalTurns,
      kickoffTeam,
      isComMatch: body.isComMatch ?? false,
      comDifficulty: body.comDifficulty ?? 'regular',
      comEra: body.comEra ?? '現代',
      comSessionToken: body.comSessionToken,
    };

    await this.ctx.storage.put('gameState', state);
    await this.ctx.storage.setAlarm(Date.now() + TURN_TIMEOUT_MS);

    return new Response(JSON.stringify({ ok: true, matchId: body.matchId }), { status: 200 });
  }

  // ── WebSocket Hibernation ハンドラ ──

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (!attachment?.userId) return;
    const userId = attachment.userId;

    if (!this.rateLimiters.has(userId)) {
      this.rateLimiters.set(userId, new WebSocketRateLimiter());
    }
    const rateCheck = this.rateLimiters.get(userId)!.check();
    if (!rateCheck.allowed) {
      if (rateCheck.warn) {
        ws.send(JSON.stringify({ type: 'RATE_LIMIT_WARNING' }));
      }
      return;
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
      case 'TURN_INPUT': {
        const turnMsg = msg as Record<string, unknown>;
        if (
          typeof turnMsg.match_id !== 'string' ||
          typeof turnMsg.turn !== 'number' ||
          typeof turnMsg.player_id !== 'string' ||
          typeof turnMsg.sequence !== 'number' ||
          typeof turnMsg.nonce !== 'string' ||
          typeof turnMsg.timestamp !== 'number' ||
          typeof turnMsg.client_hash !== 'string' ||
          !Array.isArray(turnMsg.orders)
        ) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid TURN_INPUT format' }));
          return;
        }
        await this.handleTurnInput(ws, attachment, turnMsg as unknown as TurnInput);
        break;
      }
      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        break;
      default:
        ws.send(JSON.stringify({ type: 'ERROR', message: `Unknown message type: ${msg.type}` }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (!attachment?.userId) return;
    await this.handleDisconnect(attachment.userId);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const attachment = ws.deserializeAttachment() as WsAttachment | null;
    if (!attachment?.userId) return;
    await this.handleDisconnect(attachment.userId);
  }

  // ── ターン入力処理 ──

  private async handleTurnInput(ws: WebSocket, attachment: WsAttachment, input: TurnInput): Promise<void> {
    // トランザクションで状態の読み取り・バリデーション・更新を原子的に実行
    // resolveTurn は外部API呼び出し(COM AI)を含むためトランザクション外で実行
    let shouldResolve = false;
    let stateForResolve: GameState | null = null;

    await this.ctx.storage.transaction(async () => {
      const state = await this.getGameState();
      if (!state || state.status !== 'playing') {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not in progress' }));
        return;
      }

      const pieces: PieceInfo[] = state.board ? boardToPieceInfos(state.board) : [];
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

      state.lastSequences[input.player_id] = input.sequence;
      state.usedNonces.push(input.nonce);
      if (state.usedNonces.length > MAX_NONCE_HISTORY) {
        state.usedNonces = state.usedNonces.slice(-MAX_NONCE_HISTORY);
      }

      this.turnInputs.set(attachment.userId, input);
      ws.send(JSON.stringify({ type: 'INPUT_ACCEPTED', turn: state.turn }));

      const requiredInputs = state.isComMatch ? 1 : 2;
      if (this.turnInputs.size >= requiredInputs) {
        // resolveTurnはトランザクション外で実行（外部API呼び出しを含むため）
        shouldResolve = true;
        stateForResolve = state;
        // stateはresolveTurn内でputされるので、ここではputしない
      } else {
        await this.ctx.storage.put('gameState', state);
      }
    });

    // トランザクション外でターン解決（COM AI の外部API呼び出しを含む）
    if (shouldResolve && stateForResolve) {
      await this.resolveTurn(stateForResolve);
    }
  }

  // ── ターン解決 ──

  private async resolveTurn(state: GameState): Promise<void> {
    const currentTurn = state.turn;

    const homeInput = this.turnInputs.get(state.homeUserId);
    const awayInput = this.turnInputs.get(state.awayUserId);
    const homeOrders: Order[] = (homeInput?.orders ?? []).map(rawOrderToEngine);
    let awayOrders: Order[];

    if (state.isComMatch && !awayInput) {
      awayOrders = await generateComOrders(state, this.env);
    } else {
      awayOrders = (awayInput?.orders ?? []).map(rawOrderToEngine);
    }

    if (!state.board) {
      this.turnInputs.clear();
      return;
    }
    const turnResult = processTurn(state.board, homeOrders, awayOrders, boardContext);

    // ── ゴール判定 + スコア更新 ──
    const events = turnResult.events;
    let goalScoredBy: 'home' | 'away' | null = null;

    if (hasGoal(events)) {
      const shootEvent = events.find(
        e => e.type === 'SHOOT' && (e as { result: { outcome: string } }).result.outcome === 'goal',
      ) as { shooterId: string } | undefined;
      if (shootEvent) {
        const shooterTeam: Team = shootEvent.shooterId.startsWith('h') ? 'home' : 'away';
        if (shooterTeam === 'home') state.scoreHome++;
        else state.scoreAway++;
        goalScoredBy = shooterTeam;
      }
    }

    state.board = turnResult.board;
    state.turn++;
    state.turnStartedAt = Date.now();

    if (goalScoredBy) {
      const kickoffTeam: Team = goalScoredBy === 'home' ? 'away' : 'home';
      state.board = createInitialBoard(kickoffTeam);
    }

    state.turnLog.push({
      turn: currentTurn,
      inputs: Object.fromEntries(this.turnInputs),
      events: events,
      goalScoredBy,
      timestamp: Date.now(),
    });

    this.turnInputs.clear();

    const resultMsg = {
      type: 'TURN_RESULT',
      turn: state.turn,
      board: state.board,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
      events: events,
      goalScoredBy,
      half: state.half,
      isAdditionalTime: state.half === 1
        ? currentTurn > TURNS_PER_HALF
        : currentTurn > state.halfTimeTurn + TURNS_PER_HALF,
    };
    this.broadcast(JSON.stringify(resultMsg));

    // ── ファウル通知 ──
    const foulEvent = getFoulEvent(events);
    if (foulEvent) {
      this.broadcast(JSON.stringify({
        type: 'FOUL_EVENT',
        foul: foulEvent,
      }));
    }

    // ── ハーフタイム判定 ──
    if (state.half === 1 && state.turn > state.halfTimeTurn) {
      state.half = 2;
      state.status = 'halftime';
      const secondHalfKickoff: Team = state.kickoffTeam === 'home' ? 'away' : 'home';
      state.board = createInitialBoard(secondHalfKickoff);
      state.status = 'playing';

      this.broadcast(JSON.stringify({
        type: 'HALFTIME',
        scoreHome: state.scoreHome,
        scoreAway: state.scoreAway,
        secondHalfKickoff,
      }));
    }

    // ── 試合終了チェック ──
    if (state.turn > state.totalTurns) {
      await this.ctx.storage.put('gameState', state);
      await this.endMatch(state, 'completed');
    } else {
      await this.ctx.storage.put('gameState', state);
      await this.ctx.storage.setAlarm(Date.now() + TURN_TIMEOUT_MS);
    }
  }

  // ── ターンタイマー（alarm） ──

  async alarm(): Promise<void> {
    const state = await this.getGameState();
    if (!state || state.status !== 'playing') return;

    for (const [userId, disconnectedAt] of Object.entries(state.disconnectedPlayers)) {
      if (Date.now() - disconnectedAt > DISCONNECT_GRACE_MS) {
        const loser = userId === state.homeUserId ? 'home' : 'away';
        await this.endMatch(state, 'disconnect', loser);
        return;
      }
    }

    const requiredInputs = state.isComMatch ? 1 : 2;
    if (this.turnInputs.size < requiredInputs) {
      if (!this.turnInputs.has(state.homeUserId)) {
        this.turnInputs.set(state.homeUserId, createEmptyTurnInput(state.matchId, state.turn, state.homeUserId));
      }
      if (!state.isComMatch && !this.turnInputs.has(state.awayUserId)) {
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

    this.broadcast(JSON.stringify({
      type: 'OPPONENT_DISCONNECTED',
      graceSeconds: DISCONNECT_GRACE_MS / 1000,
    }), userId);

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
