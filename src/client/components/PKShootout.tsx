// ============================================================
// PKShootout.tsx — PK戦コンポーネント（C7）
// 5本ずつ交互 → サドンデス（最大10本ずつ）
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import type { PieceData, Team } from '../types';
import PKGame from './minigame/PKGame';

interface PKShootoutProps {
  homePieces: PieceData[];
  awayPieces: PieceData[];
  myTeam: Team;
  isMobile: boolean;
  onComplete: (winner: Team | 'draw') => void;
}

interface PKResult {
  team: Team;
  round: number;
  kickerZone: number;
  gkZone: number;
  scored: boolean;
}

/** キッカーのゾーンとGKのゾーンからゴール判定 */
function resolveKick(
  kickerZone: number, gkZone: number,
  kickerCost: number, gkCost: number,
): boolean {
  // 同じ列 = GKがセーブ可能
  const kickerCol = kickerZone % 3;
  const gkCol = gkZone % 3;
  if (kickerCol === gkCol) {
    // GKセーブ成功率 = GKコスト×20 + 10
    const saveRate = gkCost * 20 + 10;
    return Math.random() * 100 >= saveRate; // セーブ失敗=ゴール
  }
  // 違う方向 = キッカーの精度チェック
  const accuracy = kickerCost * 10 + 60;
  return Math.random() * 100 < accuracy;
}

export default function PKShootout({ homePieces, awayPieces, myTeam, isMobile, onComplete }: PKShootoutProps) {
  const [results, setResults] = useState<PKResult[]>([]);
  const [currentTeam, setCurrentTeam] = useState<Team>('home');
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<'kick' | 'result' | 'done'>('kick');
  const [lastResult, setLastResult] = useState<{ scored: boolean; team: Team } | null>(null);
  const [countdown, setCountdown] = useState(5);

  const homeScore = results.filter(r => r.team === 'home' && r.scored).length;
  const awayScore = results.filter(r => r.team === 'away' && r.scored).length;

  const homeKickers = homePieces.filter(p => p.position !== 'GK').slice(0, 10);
  const awayKickers = awayPieces.filter(p => p.position !== 'GK').slice(0, 10);
  const homeGK = homePieces.find(p => p.position === 'GK') ?? homePieces[0];
  const awayGK = awayPieces.find(p => p.position === 'GK') ?? awayPieces[0];

  const currentKicker = currentTeam === 'home'
    ? homeKickers[(round - 1) % homeKickers.length]
    : awayKickers[(round - 1) % awayKickers.length];
  const currentGK = currentTeam === 'home' ? awayGK : homeGK;

  // 勝敗判定
  const checkWinner = useCallback((newResults: PKResult[]): Team | 'draw' | null => {
    const hScore = newResults.filter(r => r.team === 'home' && r.scored).length;
    const aScore = newResults.filter(r => r.team === 'away' && r.scored).length;
    const hKicked = newResults.filter(r => r.team === 'home').length;
    const aKicked = newResults.filter(r => r.team === 'away').length;

    if (hKicked <= 5 && aKicked <= 5) {
      // レギュラー5本: 残りで追いつけないなら決着
      const hRemain = 5 - hKicked;
      const aRemain = 5 - aKicked;
      if (hScore > aScore + aRemain) return 'home';
      if (aScore > hScore + hRemain) return 'away';
      if (hKicked === 5 && aKicked === 5 && hScore !== aScore) return hScore > aScore ? 'home' : 'away';
    } else {
      // サドンデス
      if (hKicked === aKicked && hKicked > 5 && hScore !== aScore) {
        return hScore > aScore ? 'home' : 'away';
      }
    }
    // 安全弁: 各10本
    if (hKicked >= 10 && aKicked >= 10) return hScore > aScore ? 'home' : aScore > hScore ? 'away' : 'draw';
    return null;
  }, []);

  // カウントダウン
  useEffect(() => {
    if (phase !== 'kick') return;
    setCountdown(5);
    const timer = setInterval(() => setCountdown(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [phase, round, currentTeam]);

  const handleKick = useCallback((zone: number) => {
    // COM: ランダムにGKゾーンを選択
    const isMyKick = currentTeam === myTeam;
    const gkZone = isMyKick ? Math.floor(Math.random() * 6) : Math.floor(Math.random() * 6);
    const kickerZone = isMyKick ? zone : Math.floor(Math.random() * 6);
    const actualGkZone = isMyKick ? gkZone : zone;

    const scored = resolveKick(
      kickerZone, actualGkZone,
      currentKicker?.cost ?? 1, currentGK?.cost ?? 1,
    );

    const result: PKResult = { team: currentTeam, round, kickerZone, gkZone: actualGkZone, scored };
    const newResults = [...results, result];
    setResults(newResults);
    setLastResult({ scored, team: currentTeam });
    setPhase('result');

    setTimeout(() => {
      const winner = checkWinner(newResults);
      if (winner) {
        setPhase('done');
        setTimeout(() => onComplete(winner), 1500);
        return;
      }
      // 次のキック
      if (currentTeam === 'home') {
        setCurrentTeam('away');
      } else {
        setCurrentTeam('home');
        setRound(prev => prev + 1);
      }
      setPhase('kick');
    }, 1500);
  }, [currentTeam, round, results, myTeam, currentKicker, currentGK, checkWinner, onComplete]);

  const isMyTurn = currentTeam === myTeam;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 250,
    }}>
      {/* スコアボード */}
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 8 }}>
          PK戦 — {homeScore} : {awayScore}
        </div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {[...Array(Math.max(5, round))].map((_, i) => {
            const hRes = results.find(r => r.team === 'home' && r.round === i + 1);
            const aRes = results.find(r => r.team === 'away' && r.round === i + 1);
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, border: '1px solid rgba(255,255,255,0.1)',
                  background: hRes ? (hRes.scored ? 'rgba(68,170,68,0.3)' : 'rgba(204,68,68,0.3)') : 'transparent',
                  color: hRes ? (hRes.scored ? '#44aa44' : '#cc4444') : '#333',
                }}>
                  {hRes ? (hRes.scored ? '\u25CB' : '\u2715') : ''}
                </div>
                <div style={{
                  width: 24, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, border: '1px solid rgba(255,255,255,0.1)',
                  background: aRes ? (aRes.scored ? 'rgba(68,170,68,0.3)' : 'rgba(204,68,68,0.3)') : 'transparent',
                  color: aRes ? (aRes.scored ? '#44aa44' : '#cc4444') : '#333',
                }}>
                  {aRes ? (aRes.scored ? '\u25CB' : '\u2715') : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 結果表示 */}
      {phase === 'result' && lastResult && (
        <div style={{
          fontSize: 36, fontWeight: 900, marginBottom: 16,
          color: lastResult.scored ? '#ffd700' : '#cc4444',
          textShadow: lastResult.scored ? '0 0 20px rgba(255,215,0,0.5)' : 'none',
        }}>
          {lastResult.scored ? 'GOAL!' : 'SAVED!'}
        </div>
      )}

      {phase === 'done' && (
        <div style={{ fontSize: 28, fontWeight: 900, color: '#ffd700', marginBottom: 16 }}>
          {homeScore > awayScore ? 'HOME WIN!' : awayScore > homeScore ? 'AWAY WIN!' : 'DRAW'}
        </div>
      )}

      {/* キック操作 */}
      {phase === 'kick' && currentKicker && currentGK && (
        <PKGame
          isKicker={isMyTurn}
          isMobile={isMobile}
          onSubmit={handleKick}
          countdown={countdown}
          kickerInfo={{ position: currentKicker.position, cost: currentKicker.cost }}
          gkInfo={{ position: currentGK.position, cost: currentGK.cost }}
          isPKShootout
          shootoutScore={{ home: homeScore, away: awayScore }}
          shootoutRound={round}
        />
      )}
    </div>
  );
}
