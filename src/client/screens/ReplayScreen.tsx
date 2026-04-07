// ============================================================
// ReplayScreen.tsx — リプレイビューア（C9）
// 全ターンのイベントを再生して振り返る
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Page, GameEvent, PieceData, Team, HexCoord } from '../types';
import HexBoard from '../components/board/HexBoard';

interface TurnSnapshot {
  turn: number;
  pieces: PieceData[];
  events: GameEvent[];
  scoreHome: number;
  scoreAway: number;
}

interface ReplayScreenProps {
  onNavigate: (page: Page) => void;
  turns: TurnSnapshot[];
  myTeam: Team;
}

export default function ReplayScreen({ onNavigate, turns, myTeam }: ReplayScreenProps) {
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maxIdx = turns.length - 1;
  const currentTurn = turns[currentTurnIdx] ?? null;

  // 自動再生
  useEffect(() => {
    if (!playing || currentTurnIdx >= maxIdx) {
      if (currentTurnIdx >= maxIdx) setPlaying(false);
      return;
    }
    const interval = 2000 / speed;
    timerRef.current = setTimeout(() => {
      setCurrentTurnIdx(prev => Math.min(prev + 1, maxIdx));
    }, interval);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [playing, currentTurnIdx, maxIdx, speed]);

  const handlePrev = useCallback(() => {
    setPlaying(false);
    setCurrentTurnIdx(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setPlaying(false);
    setCurrentTurnIdx(prev => Math.min(maxIdx, prev + 1));
  }, [maxIdx]);

  const togglePlay = useCallback(() => {
    if (currentTurnIdx >= maxIdx) setCurrentTurnIdx(0);
    setPlaying(prev => !prev);
  }, [currentTurnIdx, maxIdx]);

  if (turns.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 16, background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
      }}>
        <div style={{ fontSize: 18, color: '#888' }}>リプレイデータがありません</div>
        <button onClick={() => onNavigate('title')} style={{
          padding: '10px 24px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
          background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer',
        }}>
          戻る
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#0a0a1e',
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 12px', background: 'rgba(0,0,0,0.3)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, color: '#fff', fontWeight: 'bold' }}>
          REPLAY — Turn {currentTurn?.turn ?? 0}
        </span>
        <span style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>
          {currentTurn?.scoreHome ?? 0} - {currentTurn?.scoreAway ?? 0}
        </span>
      </div>

      {/* ボード */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {currentTurn && (
          <HexBoard
            pieces={currentTurn.pieces}
            selectedPieceId={null}
            actionMode={null}
            orders={new Map()}
            highlightHexes={[]}
            zocHexes={{ own: [], opponent: [] }}
            offsideLine={null}
            onSelectPiece={() => {}}
            onHexClick={() => {}}
            isMobile={false}
            myTeam={myTeam}
            flipY={myTeam === 'home'}
            shootRangeHexes={[]}
          />
        )}
      </div>

      {/* コントロール */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: '10px 12px', background: 'rgba(0,0,0,0.4)', flexShrink: 0,
      }}>
        <CtrlBtn label="\u25C0\u25C0" onClick={handlePrev} />
        <CtrlBtn label={playing ? '\u23F8' : '\u25B6'} onClick={togglePlay} primary />
        <CtrlBtn label="\u25B6\u25B6" onClick={handleNext} />

        {/* スライダー */}
        <input type="range" min={0} max={maxIdx} value={currentTurnIdx}
          onChange={e => { setPlaying(false); setCurrentTurnIdx(Number(e.target.value)); }}
          style={{ flex: 1, maxWidth: 200, accentColor: '#4488cc' }}
        />

        {/* 速度 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([1, 2, 4] as const).map(s => (
            <button key={s} onClick={() => setSpeed(s)} style={{
              padding: '4px 8px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              border: speed === s ? '1px solid #4488cc' : '1px solid rgba(255,255,255,0.1)',
              background: speed === s ? 'rgba(68,136,204,0.2)' : 'transparent',
              color: speed === s ? '#4488cc' : '#666',
            }}>
              {s}x
            </button>
          ))}
        </div>

        <CtrlBtn label="戻る" onClick={() => onNavigate('result')} />
      </div>
    </div>
  );
}

function CtrlBtn({ label, onClick, primary }: { label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 6, fontSize: 14, cursor: 'pointer',
      border: primary ? 'none' : '1px solid rgba(255,255,255,0.15)',
      background: primary ? '#4488cc' : 'transparent',
      color: primary ? '#fff' : '#888',
    }}>
      {label}
    </button>
  );
}
