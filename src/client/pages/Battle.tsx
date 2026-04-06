// ============================================================
// Battle.tsx — 対戦画面（メイン）
// スマホ: §2 全項目 / PC: §3 全項目
// デバイスに応じて完全にUIを切り替える。
// ============================================================

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import type { Page, GameEvent, HexCoord, ActionMode, PieceData, GameMode, Cost, Position, Team, WsMessage, FormationData, FormationPiece } from '../types';
import { POSITION_COLORS, getWsBaseUrl, MAX_ROW } from '../types';
import { useDeviceType } from '../hooks/useDeviceType';
import { useGameState } from '../hooks/useGameState';
import { useWebSocket } from '../hooks/useWebSocket';
import HexBoard from '../components/board/HexBoard';
import Timer from '../components/ui/Timer';
import ActionBar from '../components/ui/ActionBar';
import { LeftPanel, RightPanel } from '../components/ui/SidePanel';
import { generateRuleBasedOrders } from '../../ai/rule_based';
import { processTurn, createBoardContext, hasGoal } from '../../engine/turn_processor';
import type { Piece as EnginePiece, Board as EngineBoard, Order as EngineOrder, ShootEvent } from '../../engine/types';
import hexMapData from '../data/hex_map.json';

interface BattleProps {
  onNavigate: (page: Page) => void;
  matchId?: string;
  gameMode?: GameMode;
  authToken?: string;
  myTeam?: Team;
  formationData?: FormationData | null;
}

/** COM/awayチーム用のデフォルト4-4-2テンプレート */
const DEFAULT_TEMPLATE: Array<{ pos: Position; cost: Cost; col: number; row: number }> = [
  { pos: 'GK', cost: 1,   col: 10, row: 1 },
  { pos: 'DF', cost: 1,   col: 7,  row: 5 },
  { pos: 'DF', cost: 1.5, col: 13, row: 5 },
  { pos: 'SB', cost: 1,   col: 4,  row: 6 },
  { pos: 'SB', cost: 1,   col: 16, row: 6 },
  { pos: 'VO', cost: 1,   col: 10, row: 9 },
  { pos: 'MF', cost: 1,   col: 7,  row: 12 },
  { pos: 'MF', cost: 1,   col: 13, row: 12 },
  { pos: 'OM', cost: 2,   col: 10, row: 15 },
  { pos: 'WG', cost: 1.5, col: 4,  row: 17 },
  { pos: 'FW', cost: 2.5, col: 10, row: 19 },
];

/** FormationPiece配列 → PieceData配列に変換 */
function formationToPieces(starters: FormationPiece[], bench: FormationPiece[], team: Team): PieceData[] {
  const prefix = team === 'home' ? 'h' : 'a';
  const pieces: PieceData[] = [];
  starters.forEach((s, i) => {
    pieces.push({
      id: `${prefix}${String(i + 1).padStart(2, '0')}`,
      team,
      position: s.position,
      cost: s.cost,
      coord: { col: s.col, row: s.row },
      hasBall: false,
      moveRange: 4,
      isBench: false,
    });
  });
  bench.forEach((b, i) => {
    pieces.push({
      id: `${prefix}b${String(i + 1).padStart(2, '0')}`,
      team,
      position: b.position,
      cost: b.cost,
      coord: { col: b.col, row: b.row },
      hasBall: false,
      moveRange: 4,
      isBench: true,
    });
  });
  return pieces;
}

/** COM/awayチーム用のデフォルトコマ生成（row を反転して相手陣に配置） */
function createDefaultAwayPieces(): PieceData[] {
  return DEFAULT_TEMPLATE.map((t, i) => ({
    id: `a${String(i + 1).padStart(2, '0')}`,
    team: 'away' as Team,
    position: t.pos,
    cost: t.cost,
    coord: { col: t.col, row: MAX_ROW - t.row },
    hasBall: false,
    moveRange: 4,
    isBench: false,
  }));
}

/** homeチーム用のデフォルトコマ生成（フォーメーション未設定時のフォールバック） */
function createDefaultHomePieces(): PieceData[] {
  return DEFAULT_TEMPLATE.map((t, i) => ({
    id: `h${String(i + 1).padStart(2, '0')}`,
    team: 'home' as Team,
    position: t.pos,
    cost: t.cost,
    coord: { col: t.col, row: t.row },
    hasBall: false,
    moveRange: 4,
    isBench: false,
  }));
}

/** 初期コマ配置生成（Formation データ優先、なければデフォルト） */
function createInitialPieces(formationData?: FormationData | null): PieceData[] {
  // ── homeチーム: フォーメーションデータがあればそれを使用 ──
  const homePieces = formationData
    ? formationToPieces(formationData.starters, formationData.bench, 'home')
    : createDefaultHomePieces();

  // ── awayチーム: デフォルト4-4-2（row反転で相手陣配置） ──
  const awayPieces = createDefaultAwayPieces();

  const pieces = [...homePieces, ...awayPieces];

  // キックオフ: home FW にボール
  const homeFW = pieces.find((p) => p.team === 'home' && p.position === 'FW' && !p.isBench);
  if (homeFW) homeFW.hasBall = true;

  return pieces;
}

/** PieceData → engine Piece 変換 */
function toEnginePiece(p: PieceData): EnginePiece {
  return { id: p.id, team: p.team, position: p.position, cost: p.cost, coord: p.coord, hasBall: p.hasBall };
}

/** クライアント OrderData → エンジン Order に変換 */
function clientOrderToEngine(order: import('../types').OrderData, pieces: PieceData[]): EngineOrder {
  if (order.action === 'pass' && order.targetPieceId) {
    const receiver = pieces.find(p => p.id === order.targetPieceId);
    return { pieceId: order.pieceId, type: 'pass', target: receiver?.coord };
  }
  return {
    pieceId: order.pieceId,
    type: (order.action ?? 'stay') as EngineOrder['type'],
    target: order.targetHex,
  };
}

/** エンジン Piece[] → PieceData[] に変換（moveRange/isBench を既存データから引き継ぎ） */
function enginePiecesToClient(enginePieces: EnginePiece[], existing: PieceData[]): PieceData[] {
  const existMap = new Map(existing.map(p => [p.id, p]));
  return enginePieces.map(ep => ({
    id: ep.id,
    team: ep.team,
    position: ep.position,
    cost: ep.cost,
    coord: ep.coord,
    hasBall: ep.hasBall,
    moveRange: existMap.get(ep.id)?.moveRange ?? 4,
    isBench: existMap.get(ep.id)?.isBench ?? false,
  }));
}

/** ゴールリスタート用コマ配置（失点チームがキックオフ） */
function createGoalRestartPieces(
  fd: FormationData | null | undefined,
  kickoffTeam: Team,
): PieceData[] {
  const pieces = createInitialPieces(fd);
  for (const p of pieces) p.hasBall = false;
  const fw = pieces.find(p => p.team === kickoffTeam && p.position === 'FW' && !p.isBench);
  if (fw) fw.hasBall = true;
  return pieces;
}

/** 前半/後半の基本ターン数 */
const HALF_TURNS = 15;

/**
 * サッカー風試合時間ラベルを生成。
 * 前半15ターン = 0:00〜42:00 (3分刻み), AT = 45+1, 45+2 …
 * 後半15ターン = 45:00〜87:00, AT = 90+1, 90+2 …
 */
function getMatchTimeLabel(turn: number, at1: number, at2: number): { label: string; isAT: boolean } {
  const halfEnd = HALF_TURNS + at1;

  // 前半レギュラー (ターン 1〜15)
  if (turn <= HALF_TURNS) {
    const min = (turn - 1) * 3;
    return { label: `${min}:00`, isAT: false };
  }
  // 前半AT (ターン 16〜halfEnd)
  if (turn <= halfEnd) {
    return { label: `45+${turn - HALF_TURNS}`, isAT: true };
  }
  // 後半レギュラー
  const secondHalfTurn = turn - at1; // at1 を引いて後半ターン番号に
  if (secondHalfTurn <= HALF_TURNS * 2) {
    const min = 45 + (secondHalfTurn - HALF_TURNS - 1) * 3;
    return { label: `${min}:00`, isAT: false };
  }
  // 後半AT
  return { label: `90+${secondHalfTurn - HALF_TURNS * 2}`, isAT: true };
}

export default function Battle({ onNavigate, matchId, gameMode, authToken, myTeam: propMyTeam, formationData }: BattleProps) {
  const device = useDeviceType();
  const isMobile = device === 'mobile' || device === 'tablet';
  const {
    state,
    dispatch,
    myPieces,
    myBenchPieces,
    opponentPieces,
    orderedCount,
    totalFieldPieces,
    selectedPiece,
    handleWsMessage,
  } = useGameState();

  const [events, setEvents] = useState<GameEvent[]>([]);
  const [disconnectBanner, setDisconnectBanner] = useState<string | null>(null);

  const isCom = gameMode === 'com' || matchId?.startsWith('com_');

  // ── リプレイタイマー管理（cleanup用） ──
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replaySafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** リプレイ中のタイマーをすべてクリア */
  const clearReplayTimers = useCallback(() => {
    if (replayTimerRef.current) { clearTimeout(replayTimerRef.current); replayTimerRef.current = null; }
    if (replaySafetyRef.current) { clearTimeout(replaySafetyRef.current); replaySafetyRef.current = null; }
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => clearReplayTimers();
  }, [clearReplayTimers]);

  // ── エンジン用 BoardContext（1回だけ生成） ──
  const boardContext = useMemo(
    () => createBoardContext(hexMapData as Array<{ col: number; row: number; zone: string; lane: string }>),
    [],
  );

  // ── ゴール追跡 ──
  const goalScoredRef = useRef<{ scored: boolean; scorerTeam: Team | null }>({ scored: false, scorerTeam: null });

  // ── オンライン対戦: sequence/nonce管理 ──
  const sequenceRef = useRef(0);

  // ── オンライン対戦: WS メッセージ処理 ──
  const handleOnlineMessage = useCallback((msg: unknown) => {
    const data = msg as WsMessage;
    console.log('[Battle] WS message:', data.type);

    switch (data.type) {
      case 'TURN_RESULT':
        // リプレイアニメーション（ローカル命令適用）→ 2.5秒後にサーバー状態を反映
        dispatch({ type: 'RESOLVE_TURN' });
        setTimeout(() => {
          dispatch({
            type: 'APPLY_TURN_RESULT',
            board: data.board,
            turn: data.turn,
            scoreHome: data.scoreHome,
            scoreAway: data.scoreAway,
          });
          if (data.events) {
            setEvents(data.events);
          }
        }, REPLAY_DURATION);
        break;

      case 'INPUT_ACCEPTED':
        console.log('[Battle] Input accepted for turn', data.turn);
        dispatch({ type: 'SET_STATUS', status: 'waiting_opponent' });
        break;

      case 'INPUT_REJECTED':
        console.warn('[Battle] Input rejected:', data.violations);
        dispatch({ type: 'SET_STATUS', status: 'playing' });
        break;

      case 'OPPONENT_DISCONNECTED':
        setDisconnectBanner(`相手が切断しました（${data.graceSeconds}秒以内に復帰しない場合、勝利となります）`);
        break;

      case 'MATCH_END':
        dispatch({ type: 'SET_STATUS', status: 'finished' });
        setDisconnectBanner(null);
        break;

      case 'RECONNECT':
        console.log('[Battle] Reconnected, restoring state');
        dispatch({
          type: 'SET_BOARD',
          board: data.state.board,
          turn: data.state.turn,
          scoreHome: data.state.scoreHome,
          scoreAway: data.state.scoreAway,
        });
        dispatch({ type: 'SET_STATUS', status: 'playing' });
        setDisconnectBanner(null);
        break;

      case 'RATE_LIMIT_WARNING':
        console.warn('[Battle] Rate limit warning');
        break;
    }
  }, [dispatch]);

  // ── WebSocket接続（オンライン対戦用） ──
  const wsUrl = matchId ? `${getWsBaseUrl()}/match/${matchId}/ws` : '';
  const { connect: wsConnect, disconnect: wsDisconnect, send: wsSend, status: wsStatus } = useWebSocket({
    url: wsUrl,
    token: authToken ?? '',
    onMessage: handleOnlineMessage,
    onDisconnect: () => {
      if (!isCom) {
        console.log('[Battle] WS disconnected');
        setDisconnectBanner('サーバーとの接続が切断されました。再接続中...');
      }
    },
    onReconnect: () => {
      console.log('[Battle] WS reconnected');
      setDisconnectBanner('接続が復帰しました');
      setTimeout(() => setDisconnectBanner(null), 3000);
    },
    autoReconnect: true,
  });

  // ── オンライン対戦: WS接続 + ゲーム初期化 ──
  useEffect(() => {
    if (isCom) return;
    if (!matchId || !authToken) return;

    console.log('[Battle] Online init: connecting to game session WS, matchId=', matchId);
    wsConnect();

    // 初期コマ配置（サーバーからTURN_RESULTまたはRECONNECTが来るまでの暫定表示）
    const pieces = createInitialPieces(formationData);
    dispatch({
      type: 'INIT_MATCH',
      matchId,
      myTeam: propMyTeam ?? 'home',
      board: { pieces },
    });

    return () => wsDisconnect();
  }, [isCom, matchId, authToken, wsConnect, wsDisconnect, dispatch, propMyTeam]);

  // ── COM対戦: ゲーム状態を即座に初期化 ──
  // refガードなし: StrictModeの再マウントでも正常に初期化する
  useEffect(() => {
    if (!isCom) return;

    console.log('[Battle] COM init: creating pieces, matchId=', matchId, 'formationData=', !!formationData);
    const pieces = createInitialPieces(formationData);
    dispatch({
      type: 'INIT_MATCH',
      matchId: matchId ?? `com_${Date.now()}`,
      myTeam: 'home',
      board: { pieces },
    });
  }, [isCom, matchId, dispatch, formationData]);

  // ── 演出フェーズ管理 ──
  type CeremonyPhase = 'kickoff' | 'halftime' | 'secondhalf' | 'fulltime' | 'turn' | 'goal' | null;
  const [ceremony, setCeremony] = useState<CeremonyPhase>(null);
  const [showResultBtn, setShowResultBtn] = useState(false);

  // キックオフ演出（試合開始時）
  useEffect(() => {
    if (state.turn !== 1 || state.status !== 'playing') return;
    setCeremony('kickoff');
    const timer = setTimeout(() => setCeremony(null), 2500);
    return () => clearTimeout(timer);
  }, [state.turn, state.status]);

  // ハーフタイム演出 → 3秒後に「SECOND HALF」→ 1.5秒後に後半開始
  useEffect(() => {
    if (state.status !== 'halftime') return;
    setCeremony('halftime');
    const t1 = setTimeout(() => setCeremony('secondhalf'), 3000);
    const t2 = setTimeout(() => {
      setCeremony(null);
      dispatch({ type: 'RESUME_SECOND_HALF' });
    }, 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [state.status, dispatch]);

  // タイムアップ演出（試合終了時）
  useEffect(() => {
    if (state.status !== 'finished') return;
    setCeremony('fulltime');
    const t = setTimeout(() => setShowResultBtn(true), 3000);
    return () => clearTimeout(t);
  }, [state.status]);

  // リプレイ中 or 相手待ちフラグ（操作不可）
  const isResolving = state.status === 'resolving';
  const isWaiting = state.status === 'waiting_opponent';
  const isInputDisabled = isResolving || isWaiting;

  // 通常ターン切替演出（上記以外）
  const halfEnd = HALF_TURNS + state.additionalTime1;
  useEffect(() => {
    if (state.turn <= 1 || state.status !== 'playing') return;
    if (state.turn === halfEnd + 1) return; // secondhalf は別演出
    setCeremony('turn');
    const timer = setTimeout(() => setCeremony(null), 1200);
    return () => clearTimeout(timer);
  }, [state.turn, state.status, halfEnd]);

  // ── 試合時間ラベル ──
  const turnInfo = useMemo(
    () => getMatchTimeLabel(state.turn, state.additionalTime1, state.additionalTime2),
    [state.turn, state.additionalTime1, state.additionalTime2],
  );

  // スマホ: 未指示コマ一覧展開（§2-2 指示カウントタップ）
  const [showUnorderedList, setShowUnorderedList] = useState(false);

  // スマホ: 相手コマ情報ポップアップ（§2-3）
  const [opponentPopup, setOpponentPopup] = useState<PieceData | null>(null);

  // PC: 右クリックコンテキストメニュー（§3-2）
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; pieceId: string;
  } | null>(null);

  // PC: マウスオーバーZOC表示用（§3-2）
  const [hoverZocPieceId, setHoverZocPieceId] = useState<string | null>(null);

  // PC: マウスオーバー相手コマツールチップ（§3-2）
  const [tooltip, setTooltip] = useState<{
    piece: PieceData; x: number; y: number;
  } | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);

  // ================================================================
  // §3-3 キーボードショートカット（PCのみ）
  // ================================================================
  useEffect(() => {
    if (isMobile) return;

    const handleKey = (e: KeyboardEvent) => {
      // テキスト入力中は無視
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // 1-9, 0, - でコマ選択（§3-3）
      const numKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];
      const idx = numKeys.indexOf(e.key);
      if (idx !== -1 && idx < myPieces.length) {
        dispatch({ type: 'SELECT_PIECE', pieceId: myPieces[idx].id });
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'd': // ドリブルモード
          if (selectedPiece?.hasBall) {
            dispatch({ type: 'SET_ACTION_MODE', mode: state.actionMode === 'dribble' ? null : 'dribble' });
          }
          break;
        case 'q': // パスモード
          if (selectedPiece?.hasBall) {
            dispatch({ type: 'SET_ACTION_MODE', mode: state.actionMode === 'pass' ? null : 'pass' });
          }
          break;
        case 'w': // シュートモード
          if (selectedPiece?.hasBall) {
            dispatch({ type: 'SET_ACTION_MODE', mode: state.actionMode === 'shoot' ? null : 'shoot' });
          }
          break;
        case 'e': // 交代メニュー
          dispatch({ type: 'SET_ACTION_MODE', mode: state.actionMode === 'substitute' ? null : 'substitute' });
          break;
        case 'z': // Undo
          dispatch({ type: 'UNDO_LAST_ORDER' });
          break;
        case ' ': // ターン確定
          e.preventDefault();
          handleConfirm();
          break;
        case 'tab': // 次の未指示コマ
          e.preventDefault();
          selectNextUnordered();
          break;
        case 'escape': // 選択解除
          dispatch({ type: 'SELECT_PIECE', pieceId: null });
          setContextMenu(null);
          break;
        case 'f': // ボード全体表示
          // HexBoard のダブルクリックと同じ効果 → synthetic event dispatch
          boardRef.current?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          break;
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMobile, myPieces, state.orders, state.actionMode, selectedPiece, dispatch]);

  // コンテキストメニューを閉じる
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  // ================================================================
  // 共通コールバック
  // ================================================================

  const selectNextUnordered = useCallback(() => {
    const unordered = myPieces.find((p) => !state.orders.has(p.id));
    if (unordered) dispatch({ type: 'SELECT_PIECE', pieceId: unordered.id });
  }, [myPieces, state.orders, dispatch]);

  const handleSelectPiece = useCallback(
    (pieceId: string | null) => {
      // §2-3 相手コマタップで情報ポップアップ
      if (pieceId && isMobile) {
        const op = opponentPieces.find((p) => p.id === pieceId);
        if (op) {
          setOpponentPopup(op);
          return;
        }
      }

      dispatch({ type: 'SELECT_PIECE', pieceId });
      setOpponentPopup(null);
      setShowUnorderedList(false);

      // §2-6 振動フィードバック
      if (isMobile && pieceId && navigator.vibrate) {
        navigator.vibrate(30);
      }
    },
    [dispatch, isMobile, opponentPieces],
  );

  /** シュート可能ゾーン判定（ゲーム座標） */
  const isShootZone = useCallback((coord: HexCoord) => {
    // home → row 22-33 (アタッキングサード+ファイナルサード)
    // away → row 0-11 (ディフェンシブGサード+ディフェンシブサード)
    if (state.myTeam === 'home') return coord.row >= 22;
    return coord.row <= 11;
  }, [state.myTeam]);

  const handleHexClick = useCallback(
    (coord: HexCoord) => {
      if (!state.selectedPieceId) {
        dispatch({ type: 'SELECT_PIECE', pieceId: null });
        return;
      }

      const selPiece = state.board.pieces.find(p => p.id === state.selectedPieceId);
      const hasBall = selPiece?.hasBall ?? false;

      // ── 明示モードが設定されている場合 ──
      if (state.actionMode === 'pass') {
        const target = state.board.pieces.find(
          (p) => p.coord.col === coord.col && p.coord.row === coord.row && p.team === state.myTeam,
        );
        if (target && target.id !== state.selectedPieceId) {
          dispatch({
            type: 'ADD_ORDER',
            order: { pieceId: state.selectedPieceId, action: 'pass', targetPieceId: target.id },
          });
        }
      } else if (state.actionMode === 'shoot') {
        dispatch({
          type: 'ADD_ORDER',
          order: { pieceId: state.selectedPieceId, action: 'shoot', targetHex: coord },
        });
      } else if (state.actionMode === 'dribble') {
        dispatch({
          type: 'ADD_ORDER',
          order: { pieceId: state.selectedPieceId, action: 'dribble', targetHex: coord },
        });
      } else if (hasBall) {
        // ── ボール保持者 + モード未選択 → 自動判定 ──
        // 味方コマがいればパス
        const teammate = state.board.pieces.find(
          (p) => p.coord.col === coord.col && p.coord.row === coord.row
            && p.team === state.myTeam && p.id !== state.selectedPieceId,
        );
        if (teammate) {
          dispatch({
            type: 'ADD_ORDER',
            order: { pieceId: state.selectedPieceId, action: 'pass', targetPieceId: teammate.id },
          });
        } else if (isShootZone(coord)) {
          // シュートゾーンならシュート
          dispatch({
            type: 'ADD_ORDER',
            order: { pieceId: state.selectedPieceId, action: 'shoot', targetHex: coord },
          });
        } else {
          // それ以外はドリブル
          dispatch({
            type: 'ADD_ORDER',
            order: { pieceId: state.selectedPieceId, action: 'dribble', targetHex: coord },
          });
        }
      } else {
        // ── ボール非保持者 → 移動 ──
        dispatch({
          type: 'ADD_ORDER',
          order: { pieceId: state.selectedPieceId, action: 'move', targetHex: coord },
        });
      }

      if (isMobile && navigator.vibrate) {
        navigator.vibrate(20);
      }
    },
    [state.selectedPieceId, state.actionMode, state.board.pieces, state.myTeam, dispatch, isMobile, isShootZone],
  );

  /** リプレイアニメーション時間（ms）。§5-1: 約2.5秒 */
  const REPLAY_DURATION = 2500;

  const handleConfirm = useCallback(() => {
    if (state.status !== 'playing') return;

    if (isCom) {
      console.log(`[Battle] COM confirm: turn ${state.turn}, playerOrders=${state.orders.size}`);

      try {
        // 1. プレイヤー命令をエンジン形式に変換
        const fieldPieces = state.board.pieces.filter(p => !p.isBench);
        const homeOrders: EngineOrder[] = [...state.orders.values()]
          .map(o => clientOrderToEngine(o, fieldPieces));

        // 2. COM AI命令を生成（エンジン互換形式）
        const enginePieces = fieldPieces.map(toEnginePiece);
        const comResult = generateRuleBasedOrders({
          pieces: enginePieces,
          myTeam: 'away',
          scoreHome: state.scoreHome,
          scoreAway: state.scoreAway,
          turn: state.turn,
          maxTurn: HALF_TURNS * 2 + state.additionalTime1 + state.additionalTime2,
          remainingSubs: 3,
          benchPieces: [],
          maxFieldCost: 16,
        });
        const awayOrders: EngineOrder[] = comResult.orders;
        console.log(`[Battle] COM AI: ${awayOrders.length} orders, strategy=${comResult.strategy}`);

        // 3. エンジン Board 構築
        const board: EngineBoard = { pieces: enginePieces, snapshot: [] };

        // 4. processTurn 実行（Phase0〜3: 移動→タックル→ファウル→シュート→パスカット→オフサイド）
        console.log('[Battle] processTurn: running Phase 0-3...');
        const turnResult = processTurn(board, homeOrders, awayOrders, boardContext);
        console.log(`[Battle] processTurn: ${turnResult.events.length} events generated`);
        for (const ev of turnResult.events) {
          console.log(`  [Event] ${ev.type}`, ev);
        }

        // 5. ゴール判定 → スコア更新
        const goalScored = hasGoal(turnResult.events);
        let newScoreHome = state.scoreHome;
        let newScoreAway = state.scoreAway;
        let scorerTeam: Team | null = null;

        if (goalScored) {
          const shootEv = turnResult.events.find(
            (e): e is ShootEvent => e.type === 'SHOOT' && e.result.outcome === 'goal',
          );
          if (shootEv) {
            const shooter = fieldPieces.find(p => p.id === shootEv.shooterId);
            if (shooter?.team === 'home') { newScoreHome++; scorerTeam = 'home'; }
            else { newScoreAway++; scorerTeam = 'away'; }
          }
          console.log(`[Battle] GOAL! ${scorerTeam} scores → ${newScoreHome}-${newScoreAway}`);
        }
        goalScoredRef.current = { scored: goalScored, scorerTeam };

        // 6. エンジン結果をクライアント形式に変換
        const newPieces = enginePiecesToClient(turnResult.board.pieces, state.board.pieces);

        // 7. イベントログ保存
        setEvents(turnResult.events as unknown as GameEvent[]);

        // 8. エンジン結果を反映 → resolving 状態に入る
        dispatch({
          type: 'APPLY_ENGINE_RESULT',
          pieces: newPieces,
          scoreHome: newScoreHome,
          scoreAway: newScoreAway,
        });

        // 9. 実行アニメーション → NEXT_TURN（またはゴールリスタート）
        clearReplayTimers();
        replayTimerRef.current = setTimeout(() => {
          replayTimerRef.current = null;

          if (goalScoredRef.current.scored) {
            // ゴール演出 → 2秒後に初期配置リスタート
            setCeremony('goal');
            replayTimerRef.current = setTimeout(() => {
              setCeremony(null);
              const kickoff = goalScoredRef.current.scorerTeam === 'home' ? 'away' : 'home';
              const resetPieces = createGoalRestartPieces(formationData, kickoff);
              goalScoredRef.current = { scored: false, scorerTeam: null };
              dispatch({
                type: 'SET_BOARD',
                board: { pieces: resetPieces },
                turn: state.turn,
                scoreHome: newScoreHome,
                scoreAway: newScoreAway,
              });
              dispatch({ type: 'NEXT_TURN' });
              clearReplayTimers();
            }, 2000);
          } else {
            dispatch({ type: 'NEXT_TURN' });
            clearReplayTimers();
          }
        }, REPLAY_DURATION);

        // 安全タイムアウト: 8秒以上resolvingなら強制遷移
        replaySafetyRef.current = setTimeout(() => {
          console.warn('[Battle] Safety timeout (8s): forcing NEXT_TURN');
          replaySafetyRef.current = null;
          goalScoredRef.current = { scored: false, scorerTeam: null };
          clearReplayTimers();
          dispatch({ type: 'NEXT_TURN' });
        }, 8000);

      } catch (e) {
        console.error('[Battle] processTurn error:', e);
        dispatch({ type: 'NEXT_TURN' });
        clearReplayTimers();
      }
    } else {
      // ── オンライン対戦: TURN_INPUT をWebSocket送信 ──
      const currentSeq = sequenceRef.current;
      sequenceRef.current++;

      const rawOrders = [...state.orders.values()].map(order => ({
        piece_id: order.pieceId,
        action: order.action ?? 'move',
        target_hex: order.targetHex ? [order.targetHex.col, order.targetHex.row] as [number, number] : undefined,
        target_piece: order.targetPieceId,
        bench_piece: order.benchPieceId,
      }));

      const turnInput = {
        type: 'TURN_INPUT',
        match_id: matchId ?? '',
        turn: state.turn,
        player_id: '', // サーバー側はWS attachmentから取得するため空でも可
        sequence: currentSeq,
        nonce: `${matchId}_${state.turn}_${Date.now()}`,
        orders: rawOrders,
        client_hash: '', // TODO: 盤面ハッシュ
        timestamp: Date.now(),
      };

      console.log(`[Battle] Online confirm: turn ${state.turn}, orders=${rawOrders.length}, seq=${currentSeq}`);
      wsSend(turnInput);
    }
    if (isMobile && navigator.vibrate) {
      navigator.vibrate([50, 30, 50]);
    }
  }, [isCom, matchId, state, dispatch, isMobile, wsSend, boardContext, formationData, clearReplayTimers]);

  const handleTimeout = useCallback(() => {
    handleConfirm();
  }, [handleConfirm]);

  const handleSetMode = useCallback(
    (mode: ActionMode) => {
      dispatch({ type: 'SET_ACTION_MODE', mode });
    },
    [dispatch],
  );

  const handleSubstitute = useCallback(
    (fieldPieceId: string, benchPieceId: string) => {
      dispatch({
        type: 'ADD_ORDER',
        order: { pieceId: fieldPieceId, action: 'substitute', benchPieceId },
      });
    },
    [dispatch],
  );

  // PC: 右クリックコンテキストメニュー（§3-2）
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) return;
      e.preventDefault();
      // ボード座標からコマを探す（HexBoardがclickで処理済みなので、ここではselectされたコマに対してメニュー表示）
      if (state.selectedPieceId) {
        setContextMenu({ x: e.clientX, y: e.clientY, pieceId: state.selectedPieceId });
      }
    },
    [isMobile, state.selectedPieceId],
  );

  // ================================================================
  // 切断バナー（§4-4）
  // ================================================================
  const disconnectBannerEl = disconnectBanner && (
    <div style={{
      padding: '6px 16px',
      background: disconnectBanner.includes('復帰') ? '#2a8a2a' : '#cc8800',
      color: '#fff',
      fontSize: 13,
      textAlign: 'center',
      flexShrink: 0,
    }}>
      {disconnectBanner}
    </div>
  );

  // ── 演出オーバーレイ（共通） ──
  const ceremonyEl = ceremony && (
    <>
      <style>{`
        @keyframes fcms-slide-up { 0% { opacity:0; transform:translate(-50%,-40%) translateY(40px); } 20% { opacity:1; transform:translate(-50%,-50%) translateY(0); } 80% { opacity:1; } 100% { opacity:0; } }
        @keyframes fcms-scale-in { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.5); } 25% { opacity:1; transform:translate(-50%,-50%) scale(1.08); } 40% { transform:translate(-50%,-50%) scale(1); } 100% { opacity:1; transform:translate(-50%,-50%) scale(1); } }
        @keyframes fcms-scale-out { 0% { opacity:1; transform:translate(-50%,-50%) scale(1); } 100% { opacity:0; transform:translate(-50%,-50%) scale(0.8); } }
        @keyframes fcms-turn-flash { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.8); } 30% { opacity:1; transform:translate(-50%,-50%) scale(1); } 100% { opacity:0; transform:translate(-50%,-50%) scale(1); } }
        @keyframes fcms-whistle { 0%,100% { transform:translate(-50%,-50%); } 10% { transform:translate(-48%,-50%); } 20% { transform:translate(-52%,-50%); } 30% { transform:translate(-49%,-50%); } 40% { transform:translate(-51%,-50%); } 50% { transform:translate(-50%,-50%); } }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0,
        background: ceremony === 'turn' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.7)',
        zIndex: 200,
        pointerEvents: ceremony === 'fulltime' && showResultBtn ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* ── KICK OFF ── */}
        {ceremony === 'kickoff' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-slide-up 2.5s ease-out forwards',
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              KICK OFF
            </div>
            <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8, fontWeight: 600 }}>
              1st Half
            </div>
          </div>
        )}

        {/* ── HALF TIME ── */}
        {ceremony === 'halftime' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-scale-in 0.6s ease-out forwards',
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#FFD700', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              HALF TIME
            </div>
            <div style={{ fontSize: 28, color: '#fff', marginTop: 16, fontWeight: 700, letterSpacing: 6 }}>
              {state.scoreHome} - {state.scoreAway}
            </div>
          </div>
        )}

        {/* ── SECOND HALF ── */}
        {ceremony === 'secondhalf' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-scale-out 1.5s ease-out forwards',
          }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              SECOND HALF
            </div>
          </div>
        )}

        {/* ── FULL TIME ── */}
        {ceremony === 'fulltime' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-whistle 0.5s ease-out, fcms-scale-in 0.6s ease-out forwards',
          }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              FULL TIME
            </div>
            <div style={{ fontSize: 32, color: '#fff', marginTop: 16, fontWeight: 700, letterSpacing: 6 }}>
              {state.scoreHome} - {state.scoreAway}
            </div>
            {showResultBtn && (
              <button
                onClick={() => onNavigate('result')}
                style={{
                  marginTop: 24, padding: '10px 32px', borderRadius: 8, border: 'none',
                  background: '#16a34a', color: '#fff', fontSize: 16, fontWeight: 700,
                  cursor: 'pointer', pointerEvents: 'auto',
                }}
              >
                結果を見る
              </button>
            )}
          </div>
        )}

        {/* ── GOAL! ── */}
        {ceremony === 'goal' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-scale-in 0.6s ease-out forwards',
          }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: '#FFD700', letterSpacing: 4, textShadow: '0 4px 32px rgba(255,215,0,0.5), 0 2px 24px rgba(0,0,0,0.8)' }}>
              GOAL!
            </div>
            <div style={{ fontSize: 28, color: '#fff', marginTop: 16, fontWeight: 700, letterSpacing: 6 }}>
              {state.scoreHome} - {state.scoreAway}
            </div>
          </div>
        )}

        {/* ── 通常ターン切替 ── */}
        {ceremony === 'turn' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            animation: 'fcms-turn-flash 1.2s ease-out forwards',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', letterSpacing: 1, textShadow: '0 1px 12px rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}>
              Turn {state.turn}
            </div>
          </div>
        )}
      </div>
    </>
  );

  // ── アクションガイドテキスト ──
  const actionGuide = useMemo(() => {
    if (!selectedPiece) return 'コマを選択してください';
    const hasBall = selectedPiece.hasBall;
    switch (state.actionMode) {
      case 'pass': return 'パス先の味方をタップ';
      case 'shoot': return 'シュート先をタップ';
      case 'dribble': return 'ドリブル先をタップ';
      case 'substitute': return '交代先のベンチを選択';
      default:
        if (hasBall) return 'HEXタップ: ドリブル / 味方: パス / ゴール付近: シュート';
        return '移動先をタップ';
    }
  }, [selectedPiece, state.actionMode]);

  // ── 実行中 / 相手待ちバナー ──
  const resolvingBannerEl = (isResolving || isWaiting) && (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      padding: '8px 0', textAlign: 'center',
      background: isResolving ? 'rgba(37,99,235,0.9)' : 'rgba(180,130,20,0.9)',
      color: '#fff', fontSize: 13, fontWeight: 600,
      zIndex: 190, pointerEvents: 'none',
    }}>
      {isResolving ? '実行' : '⏳ 相手の入力を待っています...'}
    </div>
  );

  // ================================================================
  // スマホ UI（§2）
  // ================================================================
  if (isMobile) {
    const unorderedPieces = myPieces.filter((p) => !state.orders.has(p.id));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {ceremonyEl}
        {resolvingBannerEl}
        {disconnectBannerEl}

        {/* ヘッダー（44px）: スコア | 試合時間 | 残り時間 | 指示カウント */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          padding: '0 12px',
          background: 'rgba(20, 20, 40, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          flexShrink: 0,
          zIndex: 40,
        }}>
          {/* 左: スコア */}
          <span style={{ fontSize: 20, fontWeight: 'bold', letterSpacing: 1 }}>
            {state.scoreHome}<span style={{ color: '#555', margin: '0 3px' }}>-</span>{state.scoreAway}
          </span>

          {/* 中央: 試合時間（大きめ）+ 残り持ち時間（小さめ） */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 18, fontWeight: 800, letterSpacing: 1,
              color: turnInfo.isAT ? '#ff4444' : '#fff',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {turnInfo.label}
            </span>
            <Timer
              turnStartedAt={state.turnStartedAt}
              onTimeout={handleTimeout}
              isMobile={true}
              isAdditionalTime={turnInfo.isAT}
            />
          </div>

          {/* 右: 指示カウント */}
          <button
            onClick={() => setShowUnorderedList(!showUnorderedList)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#aaa',
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 0',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 'bold' }}>{orderedCount}</span>/{totalFieldPieces}
          </button>
        </div>

        {/* §2-2 未指示コマ一覧（展開時） */}
        {showUnorderedList && (
          <div style={{
            background: 'rgba(20, 20, 40, 0.98)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            padding: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            justifyContent: 'center',
            flexShrink: 0,
            zIndex: 35,
          }}>
            {unorderedPieces.length === 0 ? (
              <span style={{ fontSize: 12, color: '#666' }}>全コマ指示済み</span>
            ) : (
              unorderedPieces.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { handleSelectPiece(p.id); setShowUnorderedList(false); }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: POSITION_COLORS[p.position] }} />
                  {p.position}★{p.cost}
                </button>
              ))
            )}
          </div>
        )}

        {/* §2-1 メインエリア: HEXボード（画面の75%） */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }} ref={boardRef}>
          <HexBoard
            pieces={state.board.pieces}
            selectedPieceId={state.selectedPieceId}
            actionMode={state.actionMode}
            orders={state.orders}
            highlightHexes={[]}
            zocHexes={{ own: [], opponent: [] }}
            offsideLine={null}
            onSelectPiece={handleSelectPiece}
            onHexClick={handleHexClick}
            isMobile={true}
            myTeam={state.myTeam}
            flipY={state.myTeam === 'home'}
          />

          {/* §2-6 クイック選択（右端の縦アイコン列） — 全未指示コマ表示 */}
          <div style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            zIndex: 30,
            maxHeight: '70%',
            overflowY: 'auto',
          }}>
            {unorderedPieces.map((piece) => (
              <button
                key={piece.id}
                onClick={(e) => { e.stopPropagation(); handleSelectPiece(piece.id); }}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: `2px solid ${POSITION_COLORS[piece.position]}40`,
                  background: 'rgba(20,20,40,0.85)',
                  color: POSITION_COLORS[piece.position],
                  fontSize: 9,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                {piece.position}
              </button>
            ))}
          </div>

          {/* §2-3 相手コマ情報ポップアップ */}
          {opponentPopup && (
            <div
              onClick={() => setOpponentPopup(null)}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(30, 30, 50, 0.96)',
                borderRadius: 12,
                padding: 16,
                zIndex: 50,
                minWidth: 180,
                boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                textAlign: 'center',
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: POSITION_COLORS[opponentPopup.position], margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>
                {opponentPopup.position}
              </div>
              <div style={{ fontSize: 16, fontWeight: 'bold' }}>
                {opponentPopup.position} ★{opponentPopup.cost}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                ZOC: 隣接6HEX
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
                タップで閉じる
              </div>
            </div>
          )}
        </div>

        {/* §2-4 アクションバー（60px）— 交代時ベンチスライドアップ付き */}
        <ActionBar
          selectedPiece={selectedPiece}
          actionMode={state.actionMode}
          hasOrders={state.orders.size > 0}
          remainingSubs={3}
          benchPieces={myBenchPieces}
          onUndo={() => dispatch({ type: 'UNDO_LAST_ORDER' })}
          onSetMode={handleSetMode}
          onConfirm={handleConfirm}
          onSubstitute={handleSubstitute}
        />

        {/* §2-5 情報バー（40px） — 選択状態 + アクションガイド */}
        <div style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          background: 'rgba(20, 20, 40, 0.95)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: 13,
          gap: 8,
          flexShrink: 0,
        }}>
          {selectedPiece ? (
            <>
              <span style={{ color: POSITION_COLORS[selectedPiece.position], fontWeight: 'bold' }}>
                {selectedPiece.position}★{selectedPiece.cost}
              </span>
              {selectedPiece.hasBall && <span style={{ color: '#8cf' }}>⚽</span>}
              <span style={{ color: '#64748b', fontSize: 11 }}>{actionGuide}</span>
            </>
          ) : (
            <span style={{ color: '#555' }}>{actionGuide}</span>
          )}
        </div>
      </div>
    );
  }

  // ================================================================
  // PC UI（§3）
  // ================================================================
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onContextMenu={handleContextMenu}
    >
      {ceremonyEl}
      {resolvingBannerEl}
      {disconnectBannerEl}

      {/* メインエリア: 左パネル + ボード + 右パネル */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* §3-4 左パネル（200px） */}
        <LeftPanel
          pieces={myPieces}
          benchPieces={myBenchPieces}
          orders={state.orders}
          selectedPieceId={state.selectedPieceId}
          onSelectPiece={handleSelectPiece}
        />

        {/* §3-1 中央ボード */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }} ref={boardRef}>
          <HexBoard
            pieces={state.board.pieces}
            selectedPieceId={state.selectedPieceId}
            actionMode={state.actionMode}
            orders={state.orders}
            highlightHexes={[]}
            zocHexes={{ own: [], opponent: [] }}
            offsideLine={null}
            onSelectPiece={handleSelectPiece}
            onHexClick={handleHexClick}
            isMobile={false}
            myTeam={state.myTeam}
            flipY={state.myTeam === 'home'}
          />

          {/* §3-2 右クリックコンテキストメニュー */}
          {contextMenu && (
            <div
              style={{
                position: 'fixed',
                left: contextMenu.x,
                top: contextMenu.y,
                background: 'rgba(30, 30, 50, 0.98)',
                borderRadius: 8,
                padding: 4,
                zIndex: 100,
                minWidth: 140,
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {[
                { label: '移動', mode: 'move' as ActionMode, key: '' },
                { label: 'ドリブル (D)', mode: 'dribble' as ActionMode, key: 'D', needsBall: true },
                { label: 'パス (Q)', mode: 'pass' as ActionMode, key: 'Q', needsBall: true },
                { label: 'シュート (W)', mode: 'shoot' as ActionMode, key: 'W', needsBall: true },
                { label: '交代 (E)', mode: 'substitute' as ActionMode, key: 'E' },
              ].map((item) => {
                const disabled = item.needsBall && !selectedPiece?.hasBall;
                return (
                  <button
                    key={item.label}
                    onClick={() => {
                      if (!disabled) dispatch({ type: 'SET_ACTION_MODE', mode: item.mode });
                      setContextMenu(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '7px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      color: disabled ? '#555' : '#ddd',
                      fontSize: 13,
                      cursor: disabled ? 'default' : 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{item.label}</span>
                    {item.key && <span style={{ fontSize: 11, color: '#666' }}>{item.key}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* §3-2 マウスオーバー相手コマツールチップ */}
          {tooltip && (
            <div
              style={{
                position: 'fixed',
                left: tooltip.x + 12,
                top: tooltip.y - 8,
                background: 'rgba(30, 30, 50, 0.95)',
                borderRadius: 6,
                padding: '6px 10px',
                zIndex: 80,
                fontSize: 12,
                color: '#ccc',
                boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.1)',
                pointerEvents: 'none',
              }}
            >
              <span style={{ color: POSITION_COLORS[tooltip.piece.position], fontWeight: 'bold' }}>
                {tooltip.piece.position}
              </span>{' '}
              ★{tooltip.piece.cost}
              {tooltip.piece.hasBall && <span style={{ marginLeft: 6, color: '#8cf' }}>⚽</span>}
            </div>
          )}
        </div>

        {/* §3-5 右パネル（220px） */}
        <RightPanel
          orders={state.orders}
          pieces={state.board.pieces}
          events={events}
          turn={state.turn}
          onRemoveOrder={(pieceId) => dispatch({ type: 'REMOVE_ORDER', pieceId })}
        />
      </div>

      {/* §3-1 下部バー（40px） */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 40,
        padding: '0 16px',
        background: 'rgba(20, 20, 40, 0.95)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        gap: 16,
        flexShrink: 0,
      }}>
        {/* スコア */}
        <span style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: 1 }}>
          {state.scoreHome}<span style={{ color: '#555', margin: '0 3px' }}>-</span>{state.scoreAway}
        </span>

        {/* 試合時間（大きめ） */}
        <span style={{
          fontSize: 18, fontWeight: 800,
          color: turnInfo.isAT ? '#ff4444' : '#fff',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {turnInfo.label}
        </span>

        {/* 残り持ち時間 */}
        <Timer
          turnStartedAt={state.turnStartedAt}
          onTimeout={handleTimeout}
          isMobile={false}
          isAdditionalTime={turnInfo.isAT}
        />

        {/* 指示カウント */}
        <span style={{ fontSize: 13, color: '#aaa' }}>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{orderedCount}</span>/{totalFieldPieces} 指示済
        </span>

        {/* スペーサー */}
        <div style={{ flex: 1 }} />

        {/* アクションガイド + ショートカットヒント */}
        <span style={{ fontSize: 11, color: selectedPiece ? '#94a3b8' : '#555' }}>
          {selectedPiece ? actionGuide : 'D:ドリブル Q:パス W:シュート Z:戻す Space:確定'}
        </span>

        {/* ターン確定ボタン */}
        <button
          onClick={handleConfirm}
          disabled={isInputDisabled}
          style={{
            padding: '6px 20px',
            borderRadius: 6,
            border: 'none',
            background: isInputDisabled ? '#555' : '#44aa44',
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: isInputDisabled ? 'default' : 'pointer',
            opacity: isInputDisabled ? 0.6 : 1,
          }}
        >
          {isResolving ? '実行中...' : isWaiting ? '⏳ 相手の入力待ち' : '✓ ターン確定'}
        </button>
      </div>
    </div>
  );
}
