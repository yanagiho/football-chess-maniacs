// ============================================================
// CeremonyLayer.tsx — 演出オーバーレイ（KICK OFF / HALF TIME / FULL TIME / GOAL!）
// ============================================================

import React from 'react';
import type { CeremonyPhase, GoalCelebrationInfo } from './battleUtils';
import type { PieceData, GameEvent, MatchEndData, MatchStats, MvpInfo, Team, Page } from '../../types';
import HalftimeSubPanel from '../../components/ui/HalftimeSubPanel';
import GoalCeremony from './GoalCeremony';
import { MAX_SUBSTITUTIONS } from './battleUtils';
import { computeStats, computeMvp } from './battleUtils';
import {
  CEREMONY_BACKDROP_FADE_MS, CUTIN_IN_MS, CUTIN_OUT_MS,
  KICKOFF_HOLD_MS, SECONDHALF_CEREMONY_MS, GOALKICK_WIPE_TOTAL_MS,
} from './battleUtils';
import { t } from '../../i18n';

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface CeremonyLayerProps {
  ceremony: CeremonyPhase;
  showResultBtn: boolean;
  scoreHome: number;
  scoreAway: number;
  goalCelebration: GoalCelebrationInfo | null;
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
  ceremony, showResultBtn, scoreHome, scoreAway, goalCelebration, turn, myTeam,
  pieces, halftimeSubsUsed, onHalftimeSubstitute, onHalftimeReady, halftimeCountdown,
  cumulativeEvents, boardPieces, onMatchEnd, onNavigate,
}: CeremonyLayerProps) {
  if (!ceremony) return null;

  // GOAL! はリッチ専用演出（チームカラー別カットイン）に委譲
  // スコアは演出開始時に固定したスナップショットを使う（stateの加点は演出後のため）
  if (ceremony === 'goal') {
    return (
      <GoalCeremony
        scorerTeam={goalCelebration?.team ?? 'home'}
        scoreHome={goalCelebration?.scoreHome ?? scoreHome}
        scoreAway={goalCelebration?.scoreAway ?? scoreAway}
      />
    );
  }

  // ── E2: 暗転背景のフェード ──
  // key を演出シーケンス単位で分け、同一シーケンス内（halftime→halftime_sub、
  // secondhalf→kickoff2nd）では要素を維持してアニメーションを再スタートさせない。
  const backdropKey =
    ceremony === 'halftime' || ceremony === 'halftime_sub' ? 'halftime'
    : ceremony === 'secondhalf' || ceremony === 'kickoff2nd' ? 'secondhalf'
    : ceremony;
  // 自動で消える演出はフェードアウトの開始delay（ms）。null は表示継続（fulltime/halftime系）
  const backdropOutDelay =
    ceremony === 'kickoff' ? CUTIN_IN_MS + KICKOFF_HOLD_MS + CUTIN_OUT_MS
    : ceremony === 'secondhalf' || ceremony === 'kickoff2nd'
      ? SECONDHALF_CEREMONY_MS + CUTIN_IN_MS + KICKOFF_HOLD_MS + CUTIN_OUT_MS
    : null;
  const backdropAnim = backdropOutDelay !== null
    ? `fcms-backdrop-in ${CEREMONY_BACKDROP_FADE_MS}ms ease-out forwards, fcms-backdrop-out ${CEREMONY_BACKDROP_FADE_MS}ms ease-in ${backdropOutDelay}ms forwards`
    : `fcms-backdrop-in ${CEREMONY_BACKDROP_FADE_MS}ms ease-out forwards`;

  // ── E2: KICKOFF カットイン（入り: 左から高速スライドで静止 / 抜け: 右へスナップアウト）──
  // reduced-motion 時は横移動なしのシンプルなフェードにフォールバック
  const kickoffTextAnim = reducedMotion
    ? `fcms-fade-in ${CUTIN_IN_MS}ms ease-out both, fcms-fade-out ${CUTIN_OUT_MS}ms ease-in ${CUTIN_IN_MS + KICKOFF_HOLD_MS}ms forwards`
    : `fcms-cutin-in ${CUTIN_IN_MS}ms cubic-bezier(0.16,1,0.3,1) both, fcms-cutin-out ${CUTIN_OUT_MS}ms cubic-bezier(0.7,0,0.84,0) ${CUTIN_IN_MS + KICKOFF_HOLD_MS}ms forwards`;

  return (
    <>
      <style>{`
        @keyframes fcms-backdrop-in { from { opacity:0; } to { opacity:1; } }
        @keyframes fcms-backdrop-out { from { opacity:1; } to { opacity:0; } }
        @keyframes fcms-cutin-in { 0% { opacity:0; transform:translate(-50%,-50%) translateX(-140px); } 100% { opacity:1; transform:translate(-50%,-50%) translateX(0); } }
        @keyframes fcms-cutin-out { 0% { opacity:1; transform:translate(-50%,-50%) translateX(0); } 100% { opacity:0; transform:translate(-50%,-50%) translateX(120px); } }
        @keyframes fcms-fade-in { from { opacity:0; } to { opacity:1; } }
        @keyframes fcms-fade-out { from { opacity:1; } to { opacity:0; } }
        @keyframes fcms-scale-in { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.5); } 25% { opacity:1; transform:translate(-50%,-50%) scale(1.08); } 40% { transform:translate(-50%,-50%) scale(1); } 100% { opacity:1; transform:translate(-50%,-50%) scale(1); } }
        @keyframes fcms-scale-out { 0% { opacity:1; transform:translate(-50%,-50%) scale(1); } 100% { opacity:0; transform:translate(-50%,-50%) scale(0.8); } }
        @keyframes fcms-whistle { 0%,100% { transform:translate(-50%,-50%); } 10% { transform:translate(-48%,-50%); } 20% { transform:translate(-52%,-50%); } 30% { transform:translate(-49%,-50%); } 40% { transform:translate(-51%,-50%); } 50% { transform:translate(-50%,-50%); } }
        @keyframes fcms-wipe { 0% { transform:translateX(-105%); } 38% { transform:translateX(0); } 62% { transform:translateX(0); } 100% { transform:translateX(105%); } }
        @keyframes fcms-wipe-label { 0%,28% { opacity:0; transform:translate(-50%,-50%) translateX(-30px); } 42% { opacity:1; transform:translate(-50%,-50%) translateX(0); } 60% { opacity:1; } 72% { opacity:0; } 100% { opacity:0; } }
      `}</style>
      {/* ゴールキック ワイプ（裏でコマ再配置） */}
      {ceremony === 'goalkick' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 210, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(105deg, #0a1f12 0%, #123d22 50%, #0a1f12 100%)',
            transform: 'translateX(-105%)',
            animation: `fcms-wipe ${GOALKICK_WIPE_TOTAL_MS}ms cubic-bezier(0.7,0,0.3,1) forwards`,
          }} />
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            fontSize: 44, fontWeight: 900, color: '#fff', letterSpacing: 4,
            textShadow: '0 2px 24px rgba(0,0,0,0.8)', whiteSpace: 'nowrap',
            animation: `fcms-wipe-label ${GOALKICK_WIPE_TOTAL_MS}ms ease-out forwards`,
          }}>
            {t('ceremony.goalkick')}
          </div>
        </div>
      )}
      <div style={{
        position: 'fixed', inset: 0,
        zIndex: 200,
        pointerEvents: (ceremony === 'fulltime' && showResultBtn) || ceremony === 'halftime_sub' ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* 暗転背景（E2: フェードイン/アウト。'goal' は早期returnで別演出） */}
        {ceremony !== 'goalkick' && (
          <div
            key={backdropKey}
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              opacity: 0,
              animation: backdropAnim,
            }}
          />
        )}

        {/* KICK OFF（前半/後半共通、subTextのみ差し替え） */}
        {(ceremony === 'kickoff' || ceremony === 'kickoff2nd') && (
          <div style={{
            position: 'absolute', left: '50%', top: '50%',
            textAlign: 'center', whiteSpace: 'nowrap',
            transform: 'translate(-50%,-50%)',
            animation: kickoffTextAnim,
          }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', letterSpacing: 3, textShadow: '0 2px 24px rgba(0,0,0,0.8)' }}>
              KICK OFF
            </div>
            <div style={{ fontSize: 16, color: '#94a3b8', marginTop: 8, fontWeight: 600 }}>
              {ceremony === 'kickoff' ? '1st Half' : '2nd Half'}
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
            animation: `fcms-scale-out ${SECONDHALF_CEREMONY_MS}ms ease-out forwards`,
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
                {t('ceremony.view_result')}
              </button>
            )}
          </div>
        )}

      </div>
    </>
  );
}
