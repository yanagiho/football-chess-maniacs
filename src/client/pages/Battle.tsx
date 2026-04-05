// ============================================================
// Battle.tsx — 対戦画面（メイン）
// スマホ: §2 全項目 / PC: §3 全項目
// デバイスに応じて完全にUIを切り替える。
// ============================================================

import React, { useCallback, useState, useEffect, useRef } from 'react';
import type { Page, GameEvent, HexCoord, ActionMode, PieceData, GameMode, Cost, Position } from '../types';
import { POSITION_COLORS } from '../types';
import { useDeviceType } from '../hooks/useDeviceType';
import { useGameState } from '../hooks/useGameState';
import HexBoard from '../components/board/HexBoard';
import Timer from '../components/ui/Timer';
import ActionBar from '../components/ui/ActionBar';
import { LeftPanel, RightPanel } from '../components/ui/SidePanel';
import PresetButtons from '../components/ui/PresetButtons';

interface BattleProps {
  onNavigate: (page: Page) => void;
  matchId?: string;
  gameMode?: GameMode;
}

/** COM対戦用の初期コマ配置（auto_play.ts と同一） */
function createInitialPieces(): PieceData[] {
  const template: Array<{ pos: Position; cost: Cost; col: number; row: number }> = [
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

  const pieces: PieceData[] = [];
  for (let i = 0; i < template.length; i++) {
    const t = template[i];
    pieces.push({
      id: `h${String(i + 1).padStart(2, '0')}`,
      team: 'home',
      position: t.pos,
      cost: t.cost,
      coord: { col: t.col, row: t.row },
      hasBall: false,
      moveRange: 4,
      isBench: false,
    });
    pieces.push({
      id: `a${String(i + 1).padStart(2, '0')}`,
      team: 'away',
      position: t.pos,
      cost: t.cost,
      coord: { col: t.col, row: 33 - t.row },
      hasBall: false,
      moveRange: 4,
      isBench: false,
    });
  }
  // キックオフ: home FW にボール
  const homeFW = pieces.find((p) => p.team === 'home' && p.position === 'FW');
  if (homeFW) homeFW.hasBall = true;
  return pieces;
}

export default function Battle({ onNavigate, matchId, gameMode }: BattleProps) {
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

  // ── COM対戦: ゲーム状態を即座に初期化 ──
  // refガードなし: StrictModeの再マウントでも正常に初期化する
  useEffect(() => {
    const isCom = gameMode === 'com' || matchId?.startsWith('com_');
    if (!isCom) return;

    console.log('[Battle] COM init: creating pieces, matchId=', matchId);
    const pieces = createInitialPieces();
    dispatch({
      type: 'INIT_MATCH',
      matchId: matchId ?? `com_${Date.now()}`,
      myTeam: 'home',
      board: { pieces },
    });
  }, [gameMode, matchId, dispatch]);

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

  // TODO: useWebSocket 接続

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

  const handleHexClick = useCallback(
    (coord: HexCoord) => {
      if (!state.selectedPieceId) {
        // §2-3 空きHEXタップ → 選択解除
        dispatch({ type: 'SELECT_PIECE', pieceId: null });
        return;
      }

      if (state.actionMode === 'pass') {
        // パスモード: タップした位置にいるコマをパス先に
        const target = state.board.pieces.find(
          (p) => p.coord.col === coord.col && p.coord.row === coord.row && p.team === state.myTeam,
        );
        if (target) {
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
      } else {
        // デフォルト: 移動
        dispatch({
          type: 'ADD_ORDER',
          order: { pieceId: state.selectedPieceId, action: 'move', targetHex: coord },
        });
      }

      // §2-6 振動フィードバック
      if (isMobile && navigator.vibrate) {
        navigator.vibrate(20);
      }
    },
    [state.selectedPieceId, state.actionMode, state.board.pieces, state.myTeam, dispatch, isMobile],
  );

  const handleConfirm = useCallback(() => {
    // TODO: WebSocket送信
    if (isMobile && navigator.vibrate) {
      navigator.vibrate([50, 30, 50]);
    }
  }, [isMobile]);

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

  const handlePreset = useCallback(
    (preset: 'forward' | 'backward' | 'defend' | 'attack') => {
      // TODO: 実際のZOC計算
      dispatch({ type: 'APPLY_PRESET', preset, myTeam: state.myTeam, opponentZocHexes: new Set() });
    },
    [dispatch, state.myTeam],
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

  // ================================================================
  // スマホ UI（§2）
  // ================================================================
  if (isMobile) {
    const unorderedPieces = myPieces.filter((p) => !state.orders.has(p.id));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {disconnectBannerEl}

        {/* §2-2 ヘッダー（40px） */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 40,
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

          {/* 中央: タイマー */}
          <Timer
            turnStartedAt={state.turnStartedAt}
            onTimeout={handleTimeout}
            isMobile={true}
          />

          {/* 右: 指示カウント（§2-2 タップで未指示コマ一覧を展開） */}
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

          {/* §2-7 プリセットボタン（左下、長押しメニュー） */}
          <div style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 30 }}>
            <PresetButtons onApplyPreset={handlePreset} isMobile={true} />
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

        {/* §2-5 情報バー（40px） */}
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
              <span style={{ color: '#888' }}>選択中:</span>
              <span style={{ color: POSITION_COLORS[selectedPiece.position], fontWeight: 'bold' }}>
                {selectedPiece.position}★{selectedPiece.cost}
              </span>
              <span style={{ color: '#888' }}>移動:{selectedPiece.moveRange}</span>
              {selectedPiece.hasBall && <span style={{ color: '#8cf' }}>ボール保持</span>}
            </>
          ) : (
            <span style={{ color: '#555' }}>コマを選択してください</span>
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

        {/* タイマー */}
        <Timer
          turnStartedAt={state.turnStartedAt}
          onTimeout={handleTimeout}
          isMobile={false}
        />

        {/* 指示カウント */}
        <span style={{ fontSize: 13, color: '#aaa' }}>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{orderedCount}</span>/{totalFieldPieces} 指示済
        </span>

        {/* プリセットボタン */}
        <PresetButtons onApplyPreset={handlePreset} isMobile={false} />

        {/* スペーサー */}
        <div style={{ flex: 1 }} />

        {/* ショートカットヒント */}
        <span style={{ fontSize: 11, color: '#555' }}>
          Q:パス W:シュート Z:戻す Space:確定
        </span>

        {/* ターン確定ボタン */}
        <button
          onClick={handleConfirm}
          style={{
            padding: '6px 20px',
            borderRadius: 6,
            border: 'none',
            background: '#44aa44',
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          ✓ ターン確定
        </button>
      </div>
    </div>
  );
}
