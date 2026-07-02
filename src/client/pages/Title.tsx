// ============================================================
// Title.tsx — タイトル画面
// ============================================================

import React from 'react';
import type { Page } from '../types';
import { type LastSetup, resolveTeamName } from '../utils/lastSetup';
import type { ActiveMatchInfo } from '../utils/activeMatch';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n';

interface TitleProps {
  onNavigate: (page: Page) => void;
  /** 前回の対戦設定（自チームカードの表示に使用） */
  lastSetup?: LastSetup | null;
  /** T11/T12: 「COM対戦」ボタン（編成済みなら前回の編成で、未編成ならランダムNPCチームで即マッチングへ、常にmode='com'固定） */
  onQuickMatch: () => void;
  /** T12: 「ランダム対戦」ボタン（対戦タイプ選択を経由せずオンライン/カジュアルへ直行。未ログイン時はログイン誘導） */
  onQuickOnlineMatch: () => void;
  /** リロード復帰: サーバーで生存確認済みの進行中マッチ（null なら非表示） */
  resumableMatch?: ActiveMatchInfo | null;
  onResumeMatch?: () => void;
  onAbandonMatch?: () => void;
}

export default function Title({ onNavigate, lastSetup, onQuickMatch, onQuickOnlineMatch, resumableMatch, onResumeMatch, onAbandonMatch }: TitleProps) {
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

      {/* リロード復帰バナー: 進行中の試合がある場合はマイページ最上部に目立たせて表示。
          「復帰する」で既存のRECONNECTフローへ、「棄権する」でサーバーに離脱通知して破棄 */}
      {resumableMatch && (
        <div style={{
          width: '100%', maxWidth: 380,
          padding: '12px 16px',
          borderRadius: 12,
          border: '2px solid #ffd700',
          background: 'rgba(255, 214, 0, 0.10)',
          boxShadow: '0 0 20px rgba(255, 214, 0, 0.25)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#ffd700', textAlign: 'center' }}>
            {t('title.resume_banner')}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onResumeMatch}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #ffd700, #ffb300)',
                color: '#000', fontSize: 14, fontWeight: 900, cursor: 'pointer',
              }}
            >
              {t('title.resume_match')}
            </button>
            <button
              onClick={onAbandonMatch}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.05)',
                color: '#ccc', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {t('title.abandon_match')}
            </button>
          </div>
        </div>
      )}

      {/* T10c: ゲスト/ログイン状態表示 + ログイン導線 */}
      <AuthStatusBar />

      {/* 自チームカード（マイページハブ）— T12: 試合を始める主入口は「COM対戦」「ランダム対戦」の2大ボタン
          （マイページ最上位から1クリックで完結）。「対戦へ」は設定を変えたい人向けの控えめなリンクとして残す。
          T9a: エンブレム/チーム名を画面の主役として大きく中央配置する */}
      <TeamCard lastSetup={lastSetup} onNavigate={onNavigate} onQuickMatch={onQuickMatch} onQuickOnlineMatch={onQuickOnlineMatch} />

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

function AuthStatusBar() {
  const { isLoggedIn, requireLogin, logout } = useAuth();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      fontSize: 12,
    }}>
      <span style={{ color: isLoggedIn ? '#9cd89c' : '#888' }}>
        {isLoggedIn ? t('auth.logged_in_as') : t('auth.guest_playing')}
      </span>
      {isLoggedIn ? (
        <button onClick={logout} style={authStatusBtnStyle}>
          {t('auth.logout')}
        </button>
      ) : (
        <button onClick={() => requireLogin()} style={{ ...authStatusBtnStyle, borderColor: 'rgba(255,214,0,0.5)', color: '#ffd700' }}>
          {t('auth.login_cta')}
        </button>
      )}
    </div>
  );
}

const authStatusBtnStyle: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.05)',
  color: '#ccc',
  fontSize: 11,
  fontWeight: 'bold',
  cursor: 'pointer',
};

function TeamCard({
  lastSetup,
  onNavigate,
  onQuickMatch,
  onQuickOnlineMatch,
}: {
  lastSetup?: LastSetup | null;
  onNavigate: (page: Page) => void;
  onQuickMatch: () => void;
  onQuickOnlineMatch: () => void;
}) {
  const teamName = resolveTeamName(lastSetup?.teamName);
  const teamEmoji = lastSetup?.teamEmoji || '⚽';
  const starters = lastSetup?.formationData?.starters ?? [];
  const totalCost = starters.reduce((sum, p) => sum + p.cost, 0);
  // T11: 一度でも編成を確定していれば「前回の編成で」、初回/未編成なら「ランダムなNPCチームで」対戦する
  const isFormed = !!lastSetup?.formationData;

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

      {/* T12: マイページ最上位に同格の大ボタンを2つ配置（COM対戦/ランダム対戦、スクロール・追加クリックなしで実行可能） */}
      <div style={{ display: 'flex', gap: 8, marginTop: 18, width: '100%' }}>
        <button onClick={onQuickMatch} style={{ ...teamCardBtnStyle(true), display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 2 }}>
          <span style={{ fontSize: 15 }}>{t('team.quick_match_com')}</span>
          <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.75 }}>
            {isFormed ? t('team.quick_match_formed_hint') : t('team.quick_match_unformed_hint')}
          </span>
        </button>
        <button onClick={onQuickOnlineMatch} style={{ ...teamCardBtnStyle(true), padding: '12px 0', fontSize: 15 }}>
          {t('team.quick_match_online')}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8, width: '100%' }}>
        <button onClick={() => onNavigate('shop')} style={teamCardBtnStyle()}>
          {t('title.shop')}
        </button>
        <button onClick={() => onNavigate('formation')} style={teamCardBtnStyle()}>
          {t('title.edit_formation')}
        </button>
      </div>
      {/* T12: フレンド対戦・ランク戦・COM観戦・難易度変更など、あえて選びたい人向けの控えめなリンクとして残す */}
      <button onClick={() => onNavigate('modeSelect')} style={{
        marginTop: 10, background: 'none', border: 'none', color: '#888',
        fontSize: 12, textDecoration: 'underline', cursor: 'pointer',
      }}>
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
