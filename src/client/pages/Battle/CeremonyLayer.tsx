// ============================================================
// CeremonyLayer.tsx — 演出オーバーレイ（KICK OFF / HALF TIME / FULL TIME / GOAL!）
// ============================================================

import React from 'react';
import type { CeremonyPhase } from './battleUtils';
import type { PieceData, GameEvent, MatchEndData, MatchStats, MvpInfo, Team, Page } from '../../types';
import HalftimeSubPanel from '../../components/ui/HalftimeSubPanel';
import { MAX_SUBSTITUTIONS } from './battleUtils';
import { computeStats, computeMvp } from './battleUtils';

interface CeremonyLayerProps {
  ceremony: CeremonyPhase;
  showResultBtn: boolean;
  scoreHome: number;
  scoreAway: number;
  turn: number;
  myTeam: Team;
  // Halftime sub panel
  pieces: PieceData[];
  halftimeSubsUsed: number;
  onHalftimeSubstitute: (fieldPieceId: string, benchPieceId: string) => void;
  onHalftimeReady: () => void;
  halftimeCountdown: number;
  // Fulltime
  cumulativeEvents: GameEvent[];
  boardPieces: PieceData[];
  onMatchEnd?: (data: MatchEndData) => void;
  onNavigate: (page: Page) => void;
}

export default function CeremonyLayer({
  ceremony, showResultBtn, scoreHome, scoreAway, turn, myTeam,
  pieces, halftimeSubsUsed, onHalftimeSubstitute, onHalftimeReady, halftimeCountdown,
  cumulativeEvents, boardPieces, onMatchEnd, onNavigate,
}: CeremonyLayerProps) {
  if (!ceremony) return null;

  return (
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
        pointerEvents: (ceremony === 'fulltime' && showResultBtn) || ceremony === 'halftime_sub' ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* KICK OFF */}
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

        {/* KICK OFF 2nd Half */}
        {ceremony === 'kickoff2nd' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center',
            animation: 'fcms-slide-up 2.5s ease-out forwards',
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              KICK OFF
            </div>
            <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8, fontWeight: 600 }}>
              2nd Half
            </div>
          </div>
        )}

        {/* HALF TIME */}
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
              {scoreHome} - {scoreAway}
            </div>
          </div>
        )}

        {/* HALFTIME SUBSTITUTION */}
        {ceremony === 'halftime_sub' && (
          <HalftimeSubPanel
            pieces={pieces}
            myTeam={myTeam}
            maxSubs={MAX_SUBSTITUTIONS}
            subsUsed={halftimeSubsUsed}
            onSubstitute={onHalftimeSubstitute}
            onReady={onHalftimeReady}
            countdown={halftimeCountdown}
            scoreHome={scoreHome}
            scoreAway={scoreAway}
          />
        )}

        {/* SECOND HALF */}
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

        {/* FULL TIME */}
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
              {scoreHome} - {scoreAway}
            </div>
            {showResultBtn && (
              <button
                onClick={() => {
                  if (onMatchEnd) {
                    const stats = computeStats(cumulativeEvents, turn);
                    const mvp = computeMvp(cumulativeEvents);
                    if (mvp) {
                      const piece = boardPieces.find(p => p.id === mvp.pieceId);
                      if (piece) {
                        mvp.position = piece.position;
                        mvp.cost = piece.cost;
                      }
                    }
                    onMatchEnd({
                      scoreHome,
                      scoreAway,
                      myTeam,
                      reason: 'completed',
                      stats,
                      mvp,
                    });
                  } else {
                    onNavigate('result');
                  }
                }}
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

        {/* GOAL! */}
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
              {scoreHome} - {scoreAway}
            </div>
          </div>
        )}

        {/* 通常ターン切替 */}
        {ceremony === 'turn' && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            animation: 'fcms-turn-flash 1.2s ease-out forwards',
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', letterSpacing: 1, textShadow: '0 1px 12px rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}>
              Turn {turn}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
