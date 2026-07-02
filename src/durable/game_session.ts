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
  type GameState, type WsAttachment, type FormationFieldPiece, type BenchFieldPiece,
  TURN_TIMEOUT_MS, DISCONNECT_GRACE_MS, MAX_NONCE_HISTORY,
  TURNS_PER_HALF, MAX_AT,
  boardContext, boardToPieceInfos, rawOrderToEngine,
  createBoardFromFormation, createEmptyTurnInput, isValidField, isValidBench,
} from './game_session_helpers';
import type { SubstitutionEvent } from '../engine/types';
import { generateComOrders } from './com_ai_integration';
import { timingSafeEqual } from '../middleware/crypto_utils';

export class GameSession extends DurableObject<Env['Bindings']> {
  private rateLimiters = new Map<string, WebSocketRateLimiter>();
  // 注: ターン入力はインメモリではなく GameState.turnInputs に永続化する
  // （Hibernation で相手待ちの手が消えるのを防ぐため）。

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

    // COM対戦セッション（サーバーサイドCOM）: JWTの代わりにcomSessionTokenで認証。
    // 注: マッチメイキングのBot補完マッチは isComMatch=true だが comSessionToken を
    // 持たず、プレイヤーは通常のJWTで接続するため、comSessionToken の有無で分岐する
    // （旧実装は isComMatch のみで分岐しており、Bot補完マッチが常に403で接続不能だった）
    const existingState = await this.getGameState();
    const isComSession = existingState?.isComMatch === true && !!existingState?.comSessionToken;

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
          {
            issuer: this.env.PLATFORM_JWT_ISSUER,
            audience: this.env.PLATFORM_JWT_AUDIENCE,
            clockSkewSeconds: 60,
          },
          players,
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
      homeTeamId?: string;
      awayTeamId?: string;
      isComMatch?: boolean;
      comSessionToken?: string;
      comDifficulty?: Difficulty;
      comEra?: Era;
    };

    const existingState = await this.getGameState();
    if (existingState) {
      return new Response(JSON.stringify({ error: 'Already initialized' }), { status: 409 });
    }

    // 各チームの編成を D1 から読み込む（未指定/不正時は null → 固定4-4-2にフォールバック）
    const homeTeam = await this.loadTeam(body.homeTeamId);
    const awayTeam = await this.loadTeam(body.awayTeamId);
    const homeField = homeTeam.field;
    const awayField = awayTeam.field;
    const homeBench = homeTeam.bench;
    const awayBench = awayTeam.bench;

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
      board: createBoardFromFormation(homeField, awayField, kickoffTeam, homeBench, awayBench),
      homeField,
      awayField,
      homeBench,
      awayBench,
      scoreHome: 0,
      scoreAway: 0,
      status: 'playing',
      turnStartedAt: Date.now(),
      lastSequences: {},
      usedNonces: [],
      turnInputs: {},
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

  /**
   * D1 teams から編成（field_pieces）とベンチ（bench_pieces）を読み込む。
   * teamId 未指定/存在しない/不正JSON/盤面化不能なら null（→ 固定4-4-2にフォールバック / ベンチなし）。
   */
  private async loadTeam(teamId?: string): Promise<{
    field: FormationFieldPiece[] | null;
    bench: BenchFieldPiece[] | null;
  }> {
    if (!teamId || typeof teamId !== 'string') return { field: null, bench: null };
    try {
      const row = await this.env.DB
        .prepare('SELECT field_pieces, bench_pieces FROM teams WHERE id = ?')
        .bind(teamId)
        .first<{ field_pieces: string; bench_pieces: string }>();
      if (!row?.field_pieces) return { field: null, bench: null };
      const parsedField = JSON.parse(row.field_pieces);
      const parsedBench = row.bench_pieces ? JSON.parse(row.bench_pieces) : null;
      return {
        field: isValidField(parsedField) ? parsedField : null,
        bench: isValidBench(parsedBench) ? parsedBench : null,
      };
    } catch {
      return { field: null, bench: null };
    }
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
    // player_id はクライアント申告を信用せず、認証済みの attachment.userId で上書きする
    // （他プレイヤーへのなりすまし防止 + クライアントが userId を知らなくても良くする）。
    input.player_id = attachment.userId;

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
          // クライアントが sequence を再同期して自己回復できるように期待値を返す
          // （再接続中のsend喪失等で一度ズレると、厳密+1検証のため以後全入力が
          // 拒否され続けるデッドロックになっていた）
          expectedSequence: (state.lastSequences[attachment.userId] ?? -1) + 1,
        }));
        return;
      }

      state.lastSequences[input.player_id] = input.sequence;
      state.usedNonces.push(input.nonce);
      if (state.usedNonces.length > MAX_NONCE_HISTORY) {
        state.usedNonces = state.usedNonces.slice(-MAX_NONCE_HISTORY);
      }

      state.turnInputs[attachment.userId] = input;
      ws.send(JSON.stringify({ type: 'INPUT_ACCEPTED', turn: state.turn }));

      const requiredInputs = state.isComMatch ? 1 : 2;
      if (Object.keys(state.turnInputs).length >= requiredInputs) {
        // resolveTurnはトランザクション外で実行（外部API呼び出しを含むため）
        shouldResolve = true;
        stateForResolve = state;
        // stateはresolveTurn内でputされるので、ここではputしない
      } else {
        // 相手待ち: ここで永続化することで Hibernation しても入力が残る
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

    const homeInput = state.turnInputs[state.homeUserId];
    const awayInput = state.turnInputs[state.awayUserId];
    const homeOrders: Order[] = (homeInput?.orders ?? []).map(rawOrderToEngine);
    let awayOrders: Order[];

    if (state.isComMatch && !awayInput) {
      awayOrders = await generateComOrders(state, this.env);
    } else {
      awayOrders = (awayInput?.orders ?? []).map(rawOrderToEngine);
    }

    if (!state.board) {
      state.turnInputs = {};
      await this.ctx.storage.put('gameState', state);
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

    // 交代成立分だけ remainingSubs を減算（チーム→userId）
    for (const ev of events) {
      if (ev.type !== 'SUBSTITUTION') continue;
      const uid = (ev as SubstitutionEvent).team === 'home' ? state.homeUserId : state.awayUserId;
      if (state.remainingSubs[uid] != null) {
        state.remainingSubs[uid] = Math.max(0, state.remainingSubs[uid] - 1);
      }
    }

    if (goalScoredBy) {
      const kickoffTeam: Team = goalScoredBy === 'home' ? 'away' : 'home';
      // 注: 得点後リスタートは編成テンプレートに戻すため、ハーフ内の交代は元に戻る（既存仕様）
      state.board = createBoardFromFormation(state.homeField, state.awayField, kickoffTeam, state.homeBench, state.awayBench);
    }

    state.turnLog.push({
      turn: currentTurn,
      inputs: { ...state.turnInputs },
      events: events,
      goalScoredBy,
      timestamp: Date.now(),
    });

    state.turnInputs = {};

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
      state.board = createBoardFromFormation(state.homeField, state.awayField, secondHalfKickoff, state.homeBench, state.awayBench);
      state.status = 'playing';

      this.broadcast(JSON.stringify({
        type: 'HALFTIME',
        scoreHome: state.scoreHome,
        scoreAway: state.scoreAway,
        secondHalfKickoff,
        // クライアントが後半開始時の盤面リセットを反映できるよう盤面を同梱
        // （これがないとクライアントは前半終了時の古い盤面のまま後半の命令を出してしまう）
        board: state.board,
        turn: state.turn,
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
    if (Object.keys(state.turnInputs).length < requiredInputs) {
      if (!state.turnInputs[state.homeUserId]) {
        state.turnInputs[state.homeUserId] = createEmptyTurnInput(state.matchId, state.turn, state.homeUserId);
      }
      if (!state.isComMatch && !state.turnInputs[state.awayUserId]) {
        state.turnInputs[state.awayUserId] = createEmptyTurnInput(state.matchId, state.turn, state.awayUserId);
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
