// ============================================================
// game_session.ts — ゲームセッション Durable Object（§4-3, §4-4）
// 1試合 = 1DO。WebSocket Hibernation API対応。
// ============================================================

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../worker';
import { verifyWebSocketToken } from '../middleware/jwt_verify';
import { validateTurnInput, type TurnInput, type RawOrder, type PieceInfo } from '../middleware/validation';
import { WebSocketRateLimiter } from '../middleware/rate_limit';
import { processTurn, createBoardContext, hasGoal, getFoulEvent } from '../engine/turn_processor';
import { getMovementRange } from '../engine/movement';
import { ComAi } from '../ai/com_ai';
import { generateRuleBasedOrders } from '../ai/rule_based';
import { wrapAiBinding } from '../ai/gemma_client';
import type { Difficulty, Era } from '../ai/prompt_builder';
import type { Board, Order, OrderType, Piece, HexCoord, GameEvent, Zone, Lane, Team, Position, Cost } from '../engine/types';
import hexMapData from '../data/hex_map.json';

/** ゲーム状態（DO永続ストレージに保存） */
interface GameState {
  matchId: string;
  homeUserId: string;
  awayUserId: string;
  turn: number;
  /** ボード状態（engine/types.ts のBoard互換） */
  board: Board | null;
  scoreHome: number;
  scoreAway: number;
  status: 'waiting' | 'playing' | 'halftime' | 'finished';
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
  /** 前後半管理 */
  half: 1 | 2;
  firstHalfAT: number;
  secondHalfAT: number;
  /** 前半終了ターン（前半15ターン + AT） */
  halfTimeTurn: number;
  /** 試合終了ターン */
  totalTurns: number;
  /** 現在のキックオフチーム */
  kickoffTeam: 'home' | 'away';
  /** COM対戦モード（falseならオンライン対戦） */
  isComMatch?: boolean;
  /** COM難易度 */
  comDifficulty?: Difficulty;
  /** COM時代 */
  comEra?: Era;
  /** COMセッショントークン（WebSocket認証用、推測不能なランダム値） */
  comSessionToken?: string;
}

/** WebSocketにアタッチするメタデータ */
interface WsAttachment {
  userId: string;
  team: 'home' | 'away';
}

const TURN_TIMEOUT_MS = 60_000;       // 1分
const DISCONNECT_GRACE_MS = 30_000;   // 30秒
const MAX_NONCE_HISTORY = 200;
const TURNS_PER_HALF = 15;
const MAX_AT = 3;
const MAX_GAME_TURNS = (TURNS_PER_HALF + MAX_AT) * 2; // 36

/** hex_map.json からBoardContextを構築 */
const boardContext = createBoardContext(
  hexMapData as Array<{ col: number; row: number; zone: string; lane: string }>,
);

/** Board.pieces → PieceInfo[] に変換（バリデーション用） */
function boardToPieceInfos(board: Board): PieceInfo[] {
  return board.pieces.map(p => ({
    id: p.id,
    team: p.team,
    position: p.position,
    cost: p.cost,
    coord: p.coord,
    hasBall: p.hasBall,
    moveRange: getMovementRange(
      p, false,
      boardContext.getZone(p.coord),
      boardContext.getLane(p.coord),
    ),
    isBench: false, // DOのボードにベンチコマは含まれない
  }));
}

/** RawOrder → engine Order に変換 */
function rawOrderToEngine(raw: RawOrder): Order {
  return {
    pieceId: raw.piece_id,
    type: raw.action as OrderType,
    target: raw.target_hex
      ? { col: raw.target_hex[0], row: raw.target_hex[1] }
      : undefined,
    targetPieceId: raw.target_piece,
  };
}

// ================================================================
// 初期配置生成（auto_play.ts と同一の4-4-2フォーメーション）
// ================================================================

const INITIAL_FORMATION: Array<{ pos: Position; cost: Cost; col: number; row: number }> = [
  { pos: 'GK', cost: 1,   col: 10, row: 1 },
  { pos: 'DF', cost: 1,   col: 7,  row: 5 },
  { pos: 'DF', cost: 1.5, col: 13, row: 5 },
  { pos: 'SB', cost: 1,   col: 4,  row: 6 },
  { pos: 'SB', cost: 1.5, col: 16, row: 6 },
  { pos: 'VO', cost: 2,   col: 10, row: 9 },
  { pos: 'MF', cost: 1,   col: 7,  row: 12 },
  { pos: 'MF', cost: 1.5, col: 13, row: 12 },
  { pos: 'OM', cost: 2,   col: 10, row: 15 },
  { pos: 'WG', cost: 1.5, col: 4,  row: 17 },
  { pos: 'FW', cost: 2.5, col: 10, row: 19 },
];

/** 初期コマ配置を生成し、指定チームのFWにボールを付与 */
function createInitialBoard(kickoffTeam: Team): Board {
  const pieces: Piece[] = [];
  for (let i = 0; i < INITIAL_FORMATION.length; i++) {
    const f = INITIAL_FORMATION[i];
    pieces.push({
      id: `h${String(i + 1).padStart(2, '0')}`,
      team: 'home',
      position: f.pos,
      cost: f.cost,
      coord: { col: f.col, row: f.row },
      hasBall: false,
    });
    pieces.push({
      id: `a${String(i + 1).padStart(2, '0')}`,
      team: 'away',
      position: f.pos,
      cost: f.cost,
      coord: { col: f.col, row: 33 - f.row },
      hasBall: false,
    });
  }
  // キックオフチームのFWにボール
  const fw = pieces.find(p => p.team === kickoffTeam && p.position === 'FW');
  if (fw) fw.hasBall = true;
  return { pieces, snapshot: [] };
}

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
      // COM対戦: セッショントークンで認証（推測不能なランダム値）
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response('Missing token for COM session', { status: 401 });
      }
      // comSessionToken と一致するか検証
      if (!existingState?.comSessionToken || token !== existingState.comSessionToken) {
        return new Response('Invalid COM session token', { status: 403 });
      }
      userId = existingState.homeUserId;
    } else {
      // §7-2: upgradeハンドラでJWT検証 → 未認証接続は一切存在しない
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
        );
        userId = result.userId;
      } catch (e) {
        // 検証失敗 → upgradeを拒否（HTTP 401）
        return new Response(`Authentication failed: ${(e as Error).message}`, { status: 401 });
      }
    }

    // WebSocket Hibernation API でペアを作成
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const state = existingState;
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
      isComMatch?: boolean;
      comSessionToken?: string;
      comDifficulty?: Difficulty;
      comEra?: Era;
    };

    const existingState = await this.getGameState();
    if (existingState) {
      return new Response(JSON.stringify({ error: 'Already initialized' }), { status: 409 });
    }

    // キックオフ: 50/50ランダム
    const kickoffTeam: Team = Math.random() < 0.5 ? 'home' : 'away';
    // AT: 前後半各1-3ターン
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

    // sequence/nonce更新
    state.lastSequences[input.player_id] = input.sequence;
    state.usedNonces.push(input.nonce);
    if (state.usedNonces.length > MAX_NONCE_HISTORY) {
      state.usedNonces = state.usedNonces.slice(-MAX_NONCE_HISTORY);
    }

    // ターン入力をバッファに保存
    this.turnInputs.set(attachment.userId, input);

    ws.send(JSON.stringify({ type: 'INPUT_ACCEPTED', turn: state.turn }));

    // 両者入力済みか確認（COM対戦は1人でOK）
    const requiredInputs = state.isComMatch ? 1 : 2;
    if (this.turnInputs.size >= requiredInputs) {
      await this.resolveTurn(state);
    } else {
      await this.ctx.storage.put('gameState', state);
    }
  }

  // ── ターン解決 ──

  private async resolveTurn(state: GameState): Promise<void> {
    const currentTurn = state.turn;

    // ── 入力をエンジンOrder形式に変換 ──
    const homeInput = this.turnInputs.get(state.homeUserId);
    const awayInput = this.turnInputs.get(state.awayUserId);
    const homeOrders: Order[] = (homeInput?.orders ?? []).map(rawOrderToEngine);
    let awayOrders: Order[];

    if (state.isComMatch && !awayInput) {
      // COM対戦: Gemma AI → フォールバック時はルールベースAI
      awayOrders = await this.generateComOrders(state);
    } else {
      awayOrders = (awayInput?.orders ?? []).map(rawOrderToEngine);
    }

    // ── エンジンでターン実行 ──
    if (!state.board) {
      // ボードが未初期化の場合はスキップ（通常起こらない）
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

    // ── ボード更新 ──
    state.board = turnResult.board;
    state.turn++;
    state.turnStartedAt = Date.now();

    // ── ゴール後リスタート: 初期配置に戻して失点チームがキックオフ ──
    if (goalScoredBy) {
      const kickoffTeam: Team = goalScoredBy === 'home' ? 'away' : 'home';
      state.board = createInitialBoard(kickoffTeam);
    }

    // ── ターンログ記録 ──
    state.turnLog.push({
      turn: currentTurn,
      inputs: Object.fromEntries(this.turnInputs),
      events: events,
      goalScoredBy,
      timestamp: Date.now(),
    });

    this.turnInputs.clear();

    // ── 両プレイヤーに結果配信 ──
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

    // ── ファウル発生時の通知（FK/PK） ──
    const foulEvent = getFoulEvent(events);
    if (foulEvent) {
      this.broadcast(JSON.stringify({
        type: 'FOUL_EVENT',
        foul: foulEvent,
      }));
    }

    // ── ハーフタイム判定: 前半終了 ──
    if (state.half === 1 && state.turn > state.halfTimeTurn) {
      state.half = 2;
      state.status = 'halftime';
      // 後半キックオフは前半と逆チーム
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
    const requiredInputs = state.isComMatch ? 1 : 2;
    if (this.turnInputs.size < requiredInputs) {
      // 未入力側の入力をデフォルト（静止）で補完
      if (!this.turnInputs.has(state.homeUserId)) {
        this.turnInputs.set(state.homeUserId, createEmptyTurnInput(state.matchId, state.turn, state.homeUserId));
      }
      // COM対戦時はaway入力を補完しない（resolveTurnでAI生成する）
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

  // ── COM AI命令生成 ──

  /** COM AI全体のタイムアウト（Workers AIがハングした場合のガード） */
  private static readonly COM_AI_TIMEOUT_MS = 5000;

  private async generateComOrders(state: GameState): Promise<Order[]> {
    if (!state.board) return [];

    const pieces = state.board.pieces;
    const difficulty = state.comDifficulty ?? 'regular';
    const era = state.comEra ?? '現代';

    const rbInput = {
      pieces,
      myTeam: 'away' as const,
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
      turn: state.turn,
      maxTurn: state.totalTurns,
      remainingSubs: state.remainingSubs[state.awayUserId] ?? 3,
      benchPieces: [] as Piece[],
      maxFieldCost: 16,
    };

    // Gemma AIを試行（外側タイムアウト付き）
    try {
      const aiPromise = (async () => {
        const ai = new ComAi({
          ai: wrapAiBinding(this.env.AI),
          modelId: this.env.AI_MODEL_ID,
          timeoutMs: 2000,
        });

        return ai.generateOrders({
          ...rbInput,
          difficulty,
          era,
          matchId: state.matchId,
        });
      })();

      // 外側タイムアウト: ComAi内部の2秒 + マージン
      const result = await Promise.race([
        aiPromise,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), GameSession.COM_AI_TIMEOUT_MS),
        ),
      ]);

      if (!result) {
        // 外側タイムアウト発火 → ルールベースフォールバック
        console.warn(`[GameSession] COM AI outer timeout (${GameSession.COM_AI_TIMEOUT_MS}ms), falling back to rule-based`);
        return generateRuleBasedOrders(rbInput).orders;
      }

      // エラーログをR2に保存
      if (result.errorLog) {
        try {
          const logKey = `ai-errors/${state.matchId}/${state.turn}.json`;
          await this.env.R2.put(logKey, JSON.stringify(result.errorLog));
        } catch {
          // R2保存失敗は無視
        }
      }

      console.log(
        `[GameSession] COM AI turn ${state.turn}: usedGemma=${result.usedGemma}, ` +
        `latency=${result.gemmaLatencyMs}ms, fallback=${result.fallbackReason}, ` +
        `gemmaOrders=${result.gemmaOrderCount}, rbFill=${result.ruleBasedFillCount}`,
      );

      return result.orders;
    } catch (e) {
      // Gemma完全障害 → ルールベースフォールバック
      console.error(`[GameSession] COM AI error, falling back to rule-based:`, e);
      return generateRuleBasedOrders(rbInput).orders;
    }
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
