// ============================================================
// FriendMatchScreen.tsx — フレンドマッチ画面（B8）
// 招待する側: POST /match/friend/create でルームコードを発行し、
//   GET /match/friend/status/:roomId をポーリングして参加を待つ。
// 参加する側: POST /match/friend/join でコード/URLから合流する。
// ============================================================

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { apiUrl, type Page, type Team } from '../types';
import { resolveActiveTeamId } from '../utils/resolveActiveTeamId';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/ui/BackButton';
import { t } from '../i18n';

interface FriendMatchScreenProps {
  onNavigate: (page: Page) => void;
  authToken: string;
  /** 合流成立時: バトル画面へ遷移する */
  onMatchFound: (matchId: string, team?: Team) => void;
}

const STATUS_POLL_INTERVAL_MS = 2000;

/** URLのクエリパラメータ ?friend=ROOMID から参加コードを取り出す */
function friendRoomIdFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return (params.get('friend') ?? '').toUpperCase().slice(0, 6);
}

function buildInviteUrl(roomId: string): string {
  if (typeof window === 'undefined') return roomId;
  const url = new URL(window.location.href);
  url.searchParams.set('friend', roomId);
  return url.toString();
}

export default function FriendMatchScreen({ onNavigate, authToken, onMatchFound }: FriendMatchScreenProps) {
  const [mode, setMode] = useState<'menu' | 'hosting' | 'joining'>('menu');
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState(() => friendRoomIdFromUrl());
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'id' | 'url' | null>(null);
  const [busy, setBusy] = useState(false);
  const matchedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isLoggedIn, requireLogin } = useAuth();

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const handleCreate = useCallback(async () => {
    if (!isLoggedIn) {
      requireLogin(t('title.friend_match'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      const teamId = await resolveActiveTeamId(authToken);
      const res = await fetch(apiUrl('/match/friend/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json() as { roomId: string };
      setRoomId(data.roomId);
      setMode('hosting');

      matchedRef.current = false;
      const poll = async () => {
        if (matchedRef.current) return;
        try {
          const statusRes = await fetch(apiUrl(`/match/friend/status/${data.roomId}`), {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (statusRes.ok) {
            const status = await statusRes.json() as { matched: boolean; matchId?: string; team?: Team; expired?: boolean };
            if (status.matched && status.matchId) {
              matchedRef.current = true;
              onMatchFound(status.matchId, status.team);
              return;
            }
            if (status.expired) {
              matchedRef.current = true;
              setError(t('friend.error_expired'));
              setMode('menu');
              return;
            }
          }
        } catch {
          // ポーリング失敗時は次回リトライ
        }
        pollTimerRef.current = setTimeout(poll, STATUS_POLL_INTERVAL_MS);
      };
      pollTimerRef.current = setTimeout(poll, STATUS_POLL_INTERVAL_MS);
    } catch {
      setError(t('friend.error_create_failed'));
    } finally {
      setBusy(false);
    }
  }, [authToken, onMatchFound, isLoggedIn, requireLogin]);

  const handleCopy = useCallback((kind: 'id' | 'url') => {
    const text = kind === 'id' ? roomId : buildInviteUrl(roomId);
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }, [roomId]);

  const handleJoin = useCallback(async () => {
    if (!isLoggedIn) {
      requireLogin(t('title.friend_match'));
      return;
    }
    if (joinId.length !== 6) {
      setError(t('friend.error_id_length'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      const teamId = await resolveActiveTeamId(authToken);
      const res = await fetch(apiUrl('/match/friend/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ roomId: joinId, teamId }),
      });
      if (res.ok) {
        const data = await res.json() as { matchId: string; team: Team };
        onMatchFound(data.matchId, data.team);
        return;
      }
      const body = await res.json().catch(() => ({} as { error?: string })) as { error?: string };
      if (body.error === 'ROOM_NOT_FOUND') setError(t('friend.error_not_found'));
      else if (body.error === 'ROOM_ALREADY_USED') setError(t('friend.error_already_used'));
      else if (body.error === 'CANNOT_JOIN_OWN_ROOM') setError(t('friend.error_own_room'));
      else setError(t('friend.error_not_found'));
    } catch {
      setError(t('friend.error_not_found'));
    } finally {
      setBusy(false);
    }
  }, [joinId, authToken, onMatchFound, isLoggedIn, requireLogin]);

  const handleBack = useCallback(() => {
    matchedRef.current = true;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    if (mode !== 'menu') {
      setMode('menu');
      setError('');
    } else {
      onNavigate('title');
    }
  }, [mode, onNavigate]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 24, padding: 20,
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff' }}>FRIEND MATCH</h2>

      {mode === 'menu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
          <button onClick={handleCreate} disabled={busy} style={{
            padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(68,136,204,0.3)',
            background: 'rgba(68,136,204,0.1)', color: '#fff', fontSize: 16, fontWeight: 'bold',
            cursor: busy ? 'default' : 'pointer', textAlign: 'center', opacity: busy ? 0.6 : 1,
          }}>
            {t('friend.create_room')}
          </button>
          <button onClick={() => setMode('joining')} style={{
            padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 16, fontWeight: 'bold',
            cursor: 'pointer', textAlign: 'center',
          }}>
            {t('friend.join_room')}
          </button>
          {error && <div style={{ color: '#cc4444', fontSize: 13, textAlign: 'center' }}>{error}</div>}
        </div>
      )}

      {mode === 'hosting' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          width: '100%', maxWidth: 320, background: 'rgba(255,255,255,0.04)',
          borderRadius: 12, padding: 24,
        }}>
          <div style={{ color: '#888', fontSize: 13 }}>{t('friend.room_id')}</div>
          <div style={{
            fontSize: 36, fontWeight: 'bold', color: '#4488cc', letterSpacing: 6,
            fontFamily: 'monospace',
          }}>
            {roomId}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleCopy('id')} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(68,136,204,0.3)',
              background: copied === 'id' ? 'rgba(68,170,68,0.2)' : 'rgba(68,136,204,0.1)',
              color: copied === 'id' ? '#44aa44' : '#4488cc', fontSize: 13, cursor: 'pointer',
            }}>
              {copied === 'id' ? t('friend.copied') : t('friend.copy_id')}
            </button>
            <button onClick={() => handleCopy('url')} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(68,136,204,0.3)',
              background: copied === 'url' ? 'rgba(68,170,68,0.2)' : 'rgba(68,136,204,0.1)',
              color: copied === 'url' ? '#44aa44' : '#4488cc', fontSize: 13, cursor: 'pointer',
            }}>
              {copied === 'url' ? t('friend.copied') : t('friend.copy_url')}
            </button>
          </div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 8 }}>
            {t('friend.waiting')}
          </div>
          <div style={{
            width: 24, height: 24, border: '2px solid #4488cc', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 1s linear infinite',
          }} />
        </div>
      )}

      {mode === 'joining' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          width: '100%', maxWidth: 320, background: 'rgba(255,255,255,0.04)',
          borderRadius: 12, padding: 24,
        }}>
          <div style={{ color: '#888', fontSize: 13 }}>{t('friend.enter_room_id')}</div>
          <input
            value={joinId}
            onChange={e => setJoinId(e.target.value.toUpperCase().slice(0, 6))}
            placeholder={t('friend.id_placeholder')}
            maxLength={6}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 8, textAlign: 'center',
              background: '#111', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: 24, letterSpacing: 6, fontFamily: 'monospace',
            }}
          />
          {error && <div style={{ color: '#cc4444', fontSize: 13 }}>{error}</div>}
          <button onClick={handleJoin} disabled={busy} style={{
            padding: '10px 32px', borderRadius: 8, border: 'none',
            background: '#44aa44', color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}>
            {t('friend.join')}
          </button>
        </div>
      )}

      <BackButton onClick={handleBack} />
    </div>
  );
}
