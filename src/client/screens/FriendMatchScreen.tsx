// ============================================================
// FriendMatchScreen.tsx — フレンドマッチ画面（B8）
// ============================================================

import React, { useState, useCallback } from 'react';
import type { Page } from '../types';

interface FriendMatchScreenProps {
  onNavigate: (page: Page) => void;
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function FriendMatchScreen({ onNavigate }: FriendMatchScreenProps) {
  const [mode, setMode] = useState<'menu' | 'hosting' | 'joining'>('menu');
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreate = useCallback(() => {
    const id = generateRoomId();
    setRoomId(id);
    setMode('hosting');
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(roomId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [roomId]);

  const handleJoin = useCallback(() => {
    if (joinId.length !== 6) {
      setError('ルームIDは6桁です');
      return;
    }
    setError('');
    // Mock: 50% chance of success
    if (Math.random() > 0.5) {
      onNavigate('formation');
    } else {
      setError('ルームが見つかりません');
    }
  }, [joinId, onNavigate]);

  const handleBack = useCallback(() => {
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
          <button onClick={handleCreate} style={{
            padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(68,136,204,0.3)',
            background: 'rgba(68,136,204,0.1)', color: '#fff', fontSize: 16, fontWeight: 'bold',
            cursor: 'pointer', textAlign: 'center',
          }}>
            部屋を作る
          </button>
          <button onClick={() => setMode('joining')} style={{
            padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 16, fontWeight: 'bold',
            cursor: 'pointer', textAlign: 'center',
          }}>
            部屋に入る
          </button>
        </div>
      )}

      {mode === 'hosting' && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
          width: '100%', maxWidth: 320, background: 'rgba(255,255,255,0.04)',
          borderRadius: 12, padding: 24,
        }}>
          <div style={{ color: '#888', fontSize: 13 }}>ルームID</div>
          <div style={{
            fontSize: 36, fontWeight: 'bold', color: '#4488cc', letterSpacing: 6,
            fontFamily: 'monospace',
          }}>
            {roomId}
          </div>
          <button onClick={handleCopy} style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(68,136,204,0.3)',
            background: copied ? 'rgba(68,170,68,0.2)' : 'rgba(68,136,204,0.1)',
            color: copied ? '#44aa44' : '#4488cc', fontSize: 13, cursor: 'pointer',
          }}>
            {copied ? 'コピーしました!' : 'IDをコピー'}
          </button>
          <div style={{ color: '#888', fontSize: 13, marginTop: 8 }}>
            相手の参加を待っています...
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
          <div style={{ color: '#888', fontSize: 13 }}>ルームIDを入力</div>
          <input
            value={joinId}
            onChange={e => setJoinId(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="6桁のID"
            maxLength={6}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 8, textAlign: 'center',
              background: '#111', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: 24, letterSpacing: 6, fontFamily: 'monospace',
            }}
          />
          {error && <div style={{ color: '#cc4444', fontSize: 13 }}>{error}</div>}
          <button onClick={handleJoin} style={{
            padding: '10px 32px', borderRadius: 8, border: 'none',
            background: '#44aa44', color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
          }}>
            参加
          </button>
        </div>
      )}

      <button onClick={handleBack} style={{
        padding: '8px 24px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        color: '#888', fontSize: 14, cursor: 'pointer',
      }}>
        戻る
      </button>
    </div>
  );
}
