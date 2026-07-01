// ============================================================
// Title.tsx — タイトル画面
// ============================================================

import React from 'react';
import type { Page } from '../types';
import { type LastSetup, resolveTeamName } from '../utils/lastSetup';
import { t } from '../i18n';

interface TitleProps {
  onNavigate: (page: Page) => void;
  /** 前回の対戦設定（自チームカードの表示に使用） */
  lastSetup?: LastSetup | null;
}

export default function Title({ onNavigate, lastSetup }: TitleProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 20,
        padding: '20px 16px',
        background: 'linear-gradient(180deg, #000000 0%, #14142c 55%, #000000 100%)',
      }}
    >
      {/* タイトルロゴ */}
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'clamp(24px, 5vw, 38px)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #ffe600, #ff8c00)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: 2,
            lineHeight: 1.2,
          }}
        >
          Football Chess
          <br />
          ManiacS
        </h1>
      </div>

      {/* 自チームカード（マイページハブ）— 試合を始める入口はここの「対戦へ」のみ。
          T9a: エンブレム/チーム名を画面の主役として大きく中央配置する */}
      <TeamCard lastSetup={lastSetup} onNavigate={onNavigate} />

      {/* 補助機能（試合フローとは別軸）— T9c: 3列×2行の均等グリッド */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        width: '100%', maxWidth: 340,
      }}>
        <SubButton label={t('title.shop')} onClick={() => onNavigate('shop')} />
        <SubButton label={t('title.collection')} onClick={() => onNavigate('collection')} />
        <SubButton label={t('title.ranking')} onClick={() => onNavigate('ranking')} />
        <SubButton label={t('title.profile')} onClick={() => onNavigate('profile')} />
        <SubButton label={t('title.replay')} onClick={() => onNavigate('replay')} />
        <SubButton label={t('title.settings')} onClick={() => onNavigate('settings')} />
      </div>

      {/* フッター */}
      <div style={{ position: 'absolute', bottom: 16, fontSize: 11, color: '#555' }}>
        GADE Inc.
      </div>
    </div>
  );
}

function TeamCard({
  lastSetup,
  onNavigate,
}: {
  lastSetup?: LastSetup | null;
  onNavigate: (page: Page) => void;
}) {
  const teamName = resolveTeamName(lastSetup?.teamName);
  const teamEmoji = lastSetup?.teamEmoji || '⚽';
  const starters = lastSetup?.formationData?.starters ?? [];
  const totalCost = starters.reduce((sum, p) => sum + p.cost, 0);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 340,
        borderRadius: 20,
        padding: '24px 20px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'linear-gradient(160deg, rgba(42,106,42,0.4), rgba(10,10,26,0.85))',
        border: '2px solid rgba(255,214,0,0.45)',
        boxShadow: '0 0 24px rgba(255,214,0,0.15), 0 8px 24px rgba(0,0,0,0.5)',
      }}
    >
      {/* T9a: エンブレムを主役サイズで中央配置 */}
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 48, lineHeight: 1,
        background: 'radial-gradient(circle, rgba(255,214,0,0.18), rgba(255,214,0,0.04))',
        border: '2px solid rgba(255,214,0,0.6)',
        boxShadow: '0 0 20px rgba(255,214,0,0.25)',
      }}>
        {teamEmoji}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 12,
        textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', maxWidth: '100%',
      }}>
        {teamName}
      </div>
      <div style={{ fontSize: 12, color: '#9cd89c', marginTop: 4, fontWeight: 'bold' }}>
        {t('team.starters_summary', { count: String(starters.length), cost: String(totalCost) })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18, width: '100%' }}>
        <button onClick={() => onNavigate('shop')} style={teamCardBtnStyle()}>
          {t('title.shop')}
        </button>
        <button onClick={() => onNavigate('formation')} style={teamCardBtnStyle()}>
          {t('title.edit_formation')}
        </button>
      </div>
      {/* T9b: 対戦への主導線はModeSelect側で2大ボタンに再編されるため、ここは単一の遷移ボタンのまま強調 */}
      <button onClick={() => onNavigate('modeSelect')} style={{ ...teamCardBtnStyle(true), width: '100%', marginTop: 8, padding: '12px 0', fontSize: 15 }}>
        {t('team.go_to_battle')}
      </button>
    </div>
  );
}

function teamCardBtnStyle(primary = false): React.CSSProperties {
  return {
    flex: 1,
    padding: '9px 0',
    borderRadius: 8,
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.18)',
    background: primary ? 'linear-gradient(135deg, #ffd700, #ffb300)' : 'rgba(255,255,255,0.07)',
    color: primary ? '#000' : '#ddd',
    fontSize: 13,
    fontWeight: 900,
    cursor: 'pointer',
  };
}

function SubButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 4px',
        borderRadius: 10,
        border: '1px solid rgba(255,214,0,0.15)',
        background: 'rgba(255,255,255,0.04)',
        color: '#ccc',
        fontSize: 12,
        fontWeight: 'bold',
        cursor: 'pointer',
        textAlign: 'center',
      }}
    >
      {label}
    </button>
  );
}
