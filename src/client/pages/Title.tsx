// ============================================================
// Title.tsx — タイトル画面
// ============================================================

import React from 'react';
import type { Page } from '../types';
import { type LastSetup, describeLastSetup, resolveTeamName } from '../utils/lastSetup';
import { t } from '../i18n';

interface TitleProps {
  onNavigate: (page: Page) => void;
  /** 前回の対戦設定（あれば「前回の編成で対戦」を最上段に表示） */
  lastSetup?: LastSetup | null;
  /** 「前回の編成で対戦」: 前回設定でマッチングへ直行 */
  onQuickMatch?: () => void;
}

export default function Title({ onNavigate, lastSetup, onQuickMatch }: TitleProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 24,
        background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 50%, #0a0a1e 100%)',
      }}
    >
      {/* タイトルロゴ */}
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'clamp(28px, 6vw, 48px)',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #ffd700, #ff8c00)',
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
        <p style={{ color: '#888', fontSize: 14, marginTop: 8 }}>
          HEX Board Strategy
        </p>
      </div>

      {/* 自チームカード（マイページハブ） */}
      <TeamCard lastSetup={lastSetup} onNavigate={onNavigate} />

      {/* メインメニュー */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
        {lastSetup && onQuickMatch && (
          <QuickMatchButton subLabel={describeLastSetup(lastSetup)} onClick={onQuickMatch} />
        )}
        <TitleButton label={t('title.mode_select')} onClick={() => onNavigate('modeSelect')} primary={!lastSetup} />
        <TitleButton label={t('title.edit_formation')} onClick={() => onNavigate('formation')} />
        <TitleButton label={t('title.friend_match')} onClick={() => onNavigate('friendMatch')} />
        <TitleButton label={t('title.preset_teams')} onClick={() => onNavigate('presetTeams')} />
      </div>

      {/* サブメニュー */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
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
        width: 300,
        maxWidth: '90vw',
        borderRadius: 14,
        padding: '16px 18px',
        background: 'linear-gradient(135deg, rgba(42,106,42,0.35), rgba(20,20,50,0.5))',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 32, lineHeight: 1 }}>{teamEmoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {teamName}
          </div>
          <div style={{ fontSize: 11, color: '#9cd89c', marginTop: 2 }}>
            {t('team.starters_summary', { count: String(starters.length), cost: String(totalCost) })}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => onNavigate('shop')} style={teamCardBtnStyle()}>
          {t('title.shop')}
        </button>
        <button onClick={() => onNavigate('formation')} style={teamCardBtnStyle()}>
          {t('title.edit_formation')}
        </button>
        <button onClick={() => onNavigate('modeSelect')} style={teamCardBtnStyle(true)}>
          {t('team.go_to_battle')}
        </button>
      </div>
    </div>
  );
}

function teamCardBtnStyle(primary = false): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px 0',
    borderRadius: 8,
    border: primary ? 'none' : '1px solid rgba(255,255,255,0.15)',
    background: primary ? 'linear-gradient(135deg, #c9920f, #ffd700)' : 'rgba(255,255,255,0.06)',
    color: primary ? '#1a1a1a' : '#ddd',
    fontSize: 12,
    fontWeight: 'bold',
    cursor: 'pointer',
  };
}

function QuickMatchButton({ subLabel, onClick }: { subLabel: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '16px 0',
        borderRadius: 12,
        border: 'none',
        background: 'linear-gradient(135deg, #c9920f, #ffd700)',
        color: '#1a1a1a',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(255,215,0,0.3)',
        transition: 'transform 0.1s',
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 900 }}>{t('title.quick_match')}</div>
      <div style={{ fontSize: 12, fontWeight: 'bold', opacity: 0.7, marginTop: 2 }}>{subLabel}</div>
    </button>
  );
}

function TitleButton({
  label,
  onClick,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 0',
        borderRadius: 10,
        border: primary ? 'none' : '1px solid rgba(255,255,255,0.15)',
        background: primary
          ? 'linear-gradient(135deg, #2a6a2a, #3a8a3a)'
          : 'rgba(255,255,255,0.05)',
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'transform 0.1s',
      }}
    >
      {label}
    </button>
  );
}

function SubButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.03)',
        color: '#999',
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
