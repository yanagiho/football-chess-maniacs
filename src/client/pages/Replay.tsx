// ============================================================
// Replay.tsx — リプレイ画面
// ============================================================

import React, { useState, useCallback } from 'react';
import type { Page, PieceData, HexCoord } from '../types';
import { useDeviceType } from '../hooks/useDeviceType';
import HexBoard from '../components/board/HexBoard';

interface ReplayProps {
  onNavigate: (page: Page) => void;
  matchId?: string;
}

export default function Replay({ onNavigate, matchId }: ReplayProps) {
  const device = useDeviceType();
  const isMobile = device !== 'desktop';
  const [currentTurn, setCurrentTurn] = useState(1);
  const [totalTurns] = useState(45); // TODO: 実データから取得
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);

  // TODO: API呼び出し GET /api/replays/:matchId
  const pieces: PieceData[] = [];

  const handlePrev = useCallback(() => {
    setCurrentTurn((t) => Math.max(1, t - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentTurn((t) => Math.min(totalTurns, t + 1));
  }, [totalTurns]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 44,
          padding: '0 12px',
          background: 'rgba(20, 20, 40, 0.95)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <button
          onClick={() => onNavigate('title')}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#888',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          ← 戻る
        </button>
        <span style={{ fontWeight: 'bold' }}>リプレイ</span>
        <span style={{ fontSize: 13, color: '#888' }}>
          ターン {currentTurn}/{totalTurns}
        </span>
      </div>

      {/* HEXボード */}
      <div style={{ flex: 1 }}>
        <HexBoard
          pieces={pieces}
          selectedPieceId={null}
          actionMode={null}
          orders={new Map()}
          highlightHexes={[]}
          zocHexes={{ own: [], opponent: [] }}
          offsideLine={null}
          onSelectPiece={() => {}}
          onHexClick={() => {}}
          isMobile={isMobile}
        />
      </div>

      {/* コントロールバー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          height: 56,
          padding: '0 16px',
          background: 'rgba(20, 20, 40, 0.95)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <button onClick={handlePrev} style={controlBtnStyle}>⏮</button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ ...controlBtnStyle, fontSize: 20, width: 48, height: 48 }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={handleNext} style={controlBtnStyle}>⏭</button>

        {/* スライダー */}
        <input
          type="range"
          min={1}
          max={totalTurns}
          value={currentTurn}
          onChange={(e) => setCurrentTurn(parseInt(e.target.value))}
          style={{ flex: 1, maxWidth: 300 }}
        />

        {/* 速度切替 */}
        <button
          onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
          style={{
            ...controlBtnStyle,
            fontSize: 12,
            width: 40,
          }}
        >
          x{speed}
        </button>
      </div>
    </div>
  );
}

const controlBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontSize: 16,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
