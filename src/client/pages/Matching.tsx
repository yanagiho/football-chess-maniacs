// ============================================================
// Matching.tsx — マッチング待機画面（§4-2）
// WebSocket接続 → キュー参加 → マッチ成立通知待ち
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Page } from '../types';

interface MatchingProps {
  onNavigate: (page: Page) => void;
  onMatchFound: (matchId: string) => void;
}

export default function Matching({ onNavigate, onMatchFound }: MatchingProps) {
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<'searching' | 'found' | 'com_suggested'>('searching');
  const [comSuggested, setComSuggested] = useState(false);
  const startTimeRef = useRef(Date.now());

  // 経過時間カウント
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // §4-2 30秒超でCOM提案
  useEffect(() => {
    if (elapsed >= 30 && !comSuggested) {
      setComSuggested(true);
      setStatus('com_suggested');
    }
  }, [elapsed, comSuggested]);

  // TODO: WebSocket接続でマッチメイキング

  const phaseLabel = elapsed < 10
    ? '同リージョンで検索中...'
    : elapsed < 20
    ? '検索範囲を拡大中...'
    : elapsed < 30
    ? 'クロスリージョン検索中...'
    : 'COM対戦を提案中';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 24,
        padding: 20,
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>マッチング中</h2>

      {/* 検索アニメーション */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: '4px solid rgba(255,255,255,0.1)',
          borderTopColor: '#44aa44',
          animation: 'spin 1s linear infinite',
        }}
      />

      <div style={{ fontSize: 14, color: '#aaa' }}>{phaseLabel}</div>

      {/* 経過時間 */}
      <div style={{ fontSize: 28, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
      </div>

      {/* レーティング範囲表示 */}
      <div style={{ fontSize: 12, color: '#666' }}>
        {elapsed < 10 ? '±200' : elapsed < 20 ? '±400' : '全リージョン'}
      </div>

      {/* COM提案 */}
      {status === 'com_suggested' && (
        <div
          style={{
            padding: '16px 20px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 12,
            textAlign: 'center',
            maxWidth: 300,
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            対戦相手が見つかりません。
            <br />
            COM対戦を開始しますか？
          </div>
          <button
            onClick={() => onNavigate('battle')}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#4488cc',
              color: '#fff',
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            COM対戦を開始
          </button>
        </div>
      )}

      {/* キャンセル */}
      <button
        onClick={() => onNavigate('modeSelect')}
        style={{
          marginTop: 16,
          padding: '8px 24px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          color: '#888',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        キャンセル
      </button>
    </div>
  );
}
