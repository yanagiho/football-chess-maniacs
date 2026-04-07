// ============================================================
// ShootOverlay.tsx — シュート成功率オーバーレイ（C1）
// PC向け。ボール保持コマ選択時にゴール6ゾーンの成功率を表示。
// ============================================================

import React, { useMemo } from 'react';
import type { PieceData, HexCoord, Team } from '../types';
import type { Cost } from '../../engine/types';
import { calcProbability } from '../../engine/dice';

interface ShootOverlayProps {
  shooter: PieceData;
  gk: PieceData | null;
  myTeam: Team;
  visible: boolean;
}

/** ゴール6ゾーン（左上/中上/右上/左下/中下/右下） */
const ZONE_LABELS = ['左上', '中上', '右上', '左下', '中下', '右下'];

/** シュート成功率の簡易計算（shoot.ts の計算式を再現） */
function estimateShootSuccess(shooterCost: number, shooterPos: string, gkCost: number, distance: number): number {
  // ④ シュート成功チェック: base = cost*5+70, dist修正=(d-3)*-5
  const base = shooterCost * 5 + 70;
  const distMod = (distance - 3) * -5;
  const successRate = Math.min(100, Math.max(0, base + distMod));

  // ③ セービング: GKが止める確率（Ω=15）
  const savingPosMod: Record<string, number> = { FW: -15, WG: -10, OM: -10 };
  const savingMod = savingPosMod[shooterPos] ?? 0;
  const savingDistMod = (distance - 2) * 5;
  const savingBase = calcProbability(gkCost as Cost, shooterCost as Cost, 15, savingMod + savingDistMod, 0);

  // 総合: (1 - ブロック率) × (1 - セービング率) × シュート成功率
  const totalSuccess = ((100 - savingBase) / 100) * (successRate / 100) * 100;
  return Math.round(Math.min(100, Math.max(0, totalSuccess)));
}

function rateColor(rate: number): string {
  if (rate >= 30) return '#44cc44';
  if (rate >= 15) return '#cccc00';
  return '#cc4444';
}

export default function ShootOverlay({ shooter, gk, myTeam, visible }: ShootOverlayProps) {
  const rates = useMemo(() => {
    if (!visible || !gk) return null;
    const goalRow = myTeam === 'home' ? 33 : 0;
    const distance = Math.abs(shooter.coord.row - goalRow);
    // 各ゾーンに微妙な差（角度補正シミュレーション）
    return ZONE_LABELS.map((_, i) => {
      const angleOffset = (i === 0 || i === 2 || i === 3 || i === 5) ? -3 : 0; // 角は少し低い
      const rate = estimateShootSuccess(shooter.cost, shooter.position, gk.cost, distance) + angleOffset;
      return Math.min(100, Math.max(0, rate));
    });
  }, [visible, shooter, gk, myTeam]);

  if (!visible || !rates) return null;

  return (
    <div style={{
      position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
      width: 240, background: 'rgba(0,0,0,0.75)', borderRadius: 8, padding: 8,
      border: '1px solid rgba(255,255,255,0.2)', zIndex: 50,
    }}>
      <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 10, color: '#888', marginBottom: 2 }}>
        SHOOT %
      </div>
      {rates.map((rate, i) => (
        <div key={i} style={{
          textAlign: 'center', padding: '4px 0', borderRadius: 4,
          background: `${rateColor(rate)}22`, border: `1px solid ${rateColor(rate)}44`,
        }}>
          <div style={{ fontSize: 9, color: '#888' }}>{ZONE_LABELS[i]}</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: rateColor(rate) }}>{rate}%</div>
        </div>
      ))}
    </div>
  );
}
