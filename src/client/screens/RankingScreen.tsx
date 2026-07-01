// ============================================================
// RankingScreen.tsx — ランキング画面（B3）
// /api/ranking（user_ratings 由来）の総合ランキングを表示。
// ============================================================

import React, { useState, useEffect } from 'react';
import { apiUrl, type Page } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { t } from '../i18n';

interface RankingScreenProps {
  onNavigate: (page: Page) => void;
  authToken?: string;
}

type Tab = 'overall' | 'weekly' | 'friends';

interface RankEntry {
  rank: number;
  user_id: string;
  name: string;
  elo: number;
  wins: number;
  draws: number;
  losses: number;
}

const MEDAL = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];
const TAB_LABELS: { id: Tab; labelKey: string }[] = [
  { id: 'overall', labelKey: 'ranking.tab_overall' },
  { id: 'weekly', labelKey: 'ranking.tab_weekly' },
  { id: 'friends', labelKey: 'ranking.tab_friends' },
];

export default function RankingScreen({ onNavigate, authToken }: RankingScreenProps) {
  const [tab, setTab] = useState<Tab>('overall');
  const [top, setTop] = useState<RankEntry[]>([]);
  const [me, setMe] = useState<RankEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const { isLoggedIn, requireLogin } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (authToken) headers.Authorization = `Bearer ${authToken}`;
        const res = await fetch(apiUrl('/api/ranking'), { headers });
        if (!res.ok) throw new Error(`ranking ${res.status}`);
        const data = (await res.json()) as { top: RankEntry[]; me: RankEntry | null };
        if (cancelled) return;
        setTop(data.top ?? []);
        setMe(data.me ?? null);
      } catch {
        if (!cancelled) { setTop([]); setMe(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authToken]);

  const showOverall = tab === 'overall';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      height: '100%', background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold', padding: '20px 0 12px', color: '#fff' }}>RANKING</h2>

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {TAB_LABELS.map(tabItem => (
          <button key={tabItem.id} onClick={() => setTab(tabItem.id)} style={{
            padding: '6px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
            border: tab === tabItem.id ? '1px solid #4488cc' : '1px solid rgba(255,255,255,0.1)',
            background: tab === tabItem.id ? 'rgba(68,136,204,0.2)' : 'transparent',
            color: tab === tabItem.id ? '#4488cc' : '#888',
          }}>
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {/* テーブル */}
      <div style={{ flex: 1, overflowY: 'auto', width: '100%', maxWidth: 440, padding: '0 12px' }}>
        {!showOverall ? (
          <div style={{ textAlign: 'center', color: '#666', fontSize: 14, paddingTop: 60 }}>
            {t('ranking.coming_soon')}
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', color: '#666', fontSize: 14, paddingTop: 60 }}>…</div>
        ) : top.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', fontSize: 14, paddingTop: 60 }}>
            {t('ranking.empty')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#666', fontSize: 11 }}>
                <th style={{ textAlign: 'left', padding: '6px 4px' }}>#</th>
                <th style={{ textAlign: 'left', padding: '6px 4px' }}>Name</th>
                <th style={{ textAlign: 'right', padding: '6px 4px' }}>Elo</th>
                <th style={{ textAlign: 'right', padding: '6px 4px' }}>W-D-L</th>
              </tr>
            </thead>
            <tbody>
              {top.map(entry => (
                <tr key={entry.user_id} style={{
                  borderTop: '1px solid rgba(255,255,255,0.04)',
                  background: me && entry.user_id === me.user_id ? 'rgba(68,136,204,0.08)' : 'transparent',
                }}>
                  <td style={{ padding: '8px 4px', color: '#ddd' }}>
                    {entry.rank <= 3 ? MEDAL[entry.rank] : entry.rank}
                  </td>
                  <td style={{ padding: '8px 4px', color: '#fff', fontWeight: entry.rank <= 3 ? 'bold' : 'normal' }}>
                    {entry.name}
                  </td>
                  <td style={{ padding: '8px 4px', color: '#aaa', textAlign: 'right' }}>{entry.elo}</td>
                  <td style={{ padding: '8px 4px', color: '#888', textAlign: 'right', fontSize: 11 }}>
                    {entry.wins}-{entry.draws}-{entry.losses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 自分の順位（固定表示・対戦済みのみ） */}
      {showOverall && me && (
        <div style={{
          width: '100%', maxWidth: 440, padding: '10px 16px',
          background: 'rgba(68,136,204,0.1)', borderTop: '1px solid rgba(68,136,204,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
        }}>
          <span style={{ color: '#4488cc', fontWeight: 'bold' }}>#{me.rank} {me.name}</span>
          <span style={{ color: '#aaa' }}>Elo {me.elo}</span>
          <span style={{ color: '#888', fontSize: 11 }}>{me.wins}-{me.draws}-{me.losses}</span>
        </div>
      )}

      {/* T10d: 未ログインでも閲覧は可能（Public API）。自分の順位表示にはログインが必要なことをソフトに案内する */}
      {showOverall && !isLoggedIn && (
        <div style={{
          width: '100%', maxWidth: 440, padding: '10px 16px',
          background: 'rgba(255,214,0,0.06)', borderTop: '1px solid rgba(255,214,0,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, gap: 8,
        }}>
          <span style={{ color: '#cc8800' }}>{t('auth.reason_prefix', { reason: t('title.ranking') })}</span>
          <button
            onClick={() => requireLogin(t('title.ranking'))}
            style={{
              padding: '5px 12px', borderRadius: 6, border: 'none',
              background: 'linear-gradient(135deg, #ffd700, #ffb300)', color: '#000',
              fontSize: 11, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {t('auth.login_cta')}
          </button>
        </div>
      )}

      <button onClick={() => onNavigate('title')} style={{
        margin: '12px 0 20px', padding: '8px 24px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        color: '#888', fontSize: 14, cursor: 'pointer',
      }}>
        {t('common.back')}
      </button>
    </div>
  );
}
