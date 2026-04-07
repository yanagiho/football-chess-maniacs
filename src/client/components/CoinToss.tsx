// ============================================================
// CoinToss.tsx — コイントス演出（C6）
// 試合開始前にキックオフ側をランダム決定
// ============================================================

import React, { useState, useEffect } from 'react';

interface CoinTossProps {
  onComplete: (isHomeFirst: boolean) => void;
}

export default function CoinToss({ onComplete }: CoinTossProps) {
  const [phase, setPhase] = useState<'spinning' | 'result'>('spinning');
  const [isHomeFirst, setIsHomeFirst] = useState(true);

  useEffect(() => {
    const result = Math.random() < 0.5;
    setIsHomeFirst(result);

    // 1.5秒コイン回転 → 結果表示
    const t1 = setTimeout(() => setPhase('result'), 1500);
    // 3秒後に自動遷移
    const t2 = setTimeout(() => onComplete(result), 3000);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 250, gap: 24,
    }}>
      <style>{`
        @keyframes fcms-coin-spin {
          0% { transform: rotateY(0deg) scale(1); }
          50% { transform: rotateY(900deg) scale(1.2); }
          100% { transform: rotateY(1800deg) scale(1); }
        }
      `}</style>

      {/* コイン */}
      <div style={{
        width: 100, height: 100, borderRadius: '50%',
        background: 'linear-gradient(135deg, #ffd700, #ff8c00)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 40, fontWeight: 'bold', color: '#333',
        boxShadow: '0 0 30px rgba(255,215,0,0.5)',
        animation: phase === 'spinning' ? 'fcms-coin-spin 1.5s ease-out forwards' : 'none',
      }}>
        {phase === 'spinning' ? 'FC' : (isHomeFirst ? 'H' : 'A')}
      </div>

      {/* テキスト */}
      <div style={{
        fontSize: 20, fontWeight: 'bold', color: '#fff', textAlign: 'center',
        opacity: phase === 'result' ? 1 : 0, transition: 'opacity 0.3s',
      }}>
        {phase === 'result' && (
          isHomeFirst
            ? 'あなたが先攻です！'
            : '相手が先攻です。あなたは後半キックオフです'
        )}
      </div>
    </div>
  );
}
