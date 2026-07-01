// ============================================================
// ModeSelect.tsx — 対戦タイプ選択
// COM対戦／オンライン対戦／フレンド対戦を並列カードで提示し、
// 選択したタイプに応じて必要な設定（難易度+相手プレビュー / ランク・カジュアル）のみ展開する。
// COM観戦は動作確認用に下部へ小さく配置。
// ============================================================

import React, { useEffect, useState } from 'react';
import type { GameMode, ComDifficulty, Page } from '../types';
import type { PresetTeam } from '../../data/presetTeams';
import { pickNpcOpponent } from '../../data/presetTeams';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/ui/BackButton';
import { t } from '../i18n';

interface ModeSelectProps {
  /** 初期選択モード（前回設定の復元用） */
  initialMode?: GameMode;
  /** 初期選択難易度（前回設定の復元用） */
  initialDifficulty?: ComDifficulty;
  /** 「編成して開始」: 編成画面へ */
  onStartWithFormation: (mode: GameMode, difficulty: ComDifficulty, opponent?: PresetTeam | null) => void;
  /** 「この設定で開始」/「観戦を開始」: マッチングへ直行 */
  onStartNow: (mode: GameMode, difficulty: ComDifficulty, opponent?: PresetTeam | null) => void;
  /** フレンド対戦カード選択時の画面遷移 */
  onNavigate: (page: Page) => void;
  onBack: () => void;
}

type BattleType = 'com' | 'online' | 'friend';

const DIFFICULTIES: { id: ComDifficulty; label: string; icon: string; color: string }[] = [
  { id: 'beginner', label: t('difficulty.beginner'), icon: '\u{1F7E2}', color: '#44aa44' },
  { id: 'regular', label: t('difficulty.regular'), icon: '\u{1F7E1}', color: '#cc8800' },
  { id: 'maniac', label: t('difficulty.maniac'), icon: '\u{1F534}', color: '#cc4444' },
];

function initialBattleType(mode: GameMode): BattleType {
  if (mode === 'ranked' || mode === 'casual') return 'online';
  return 'com';
}

export default function ModeSelect({
  initialMode = 'com',
  initialDifficulty = 'regular',
  onStartWithFormation,
  onStartNow,
  onNavigate,
  onBack,
}: ModeSelectProps) {
  const [battleType, setBattleType] = useState<BattleType>(initialBattleType(initialMode));
  const [onlineMode, setOnlineMode] = useState<'ranked' | 'casual'>(initialMode === 'casual' ? 'casual' : 'ranked');
  const [difficulty, setDifficulty] = useState<ComDifficulty>(initialDifficulty);
  const [opponent, setOpponent] = useState<PresetTeam>(() => pickNpcOpponent(initialDifficulty));
  const { isLoggedIn, requireLogin } = useAuth();

  // 難易度変更に応じて対戦相手プレビューを再抽選
  useEffect(() => {
    setOpponent(pickNpcOpponent(difficulty));
  }, [difficulty]);

  const effectiveMode: GameMode = battleType === 'online' ? onlineMode : 'com';

  // T10d: オンライン対戦はログイン必須。未ログインならモーダルへ誘導して処理を中断する
  const guardOnlineLogin = (): boolean => {
    if (battleType === 'online' && !isLoggedIn) {
      requireLogin(t('modeselect.online_type'));
      return false;
    }
    return true;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 20,
        padding: 20,
        overflowY: 'auto',
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>{t('modeselect.title')}</h2>

      {/* T9b: 対戦導線の2択化。COM対戦／オンライン対戦を巨大ボタンで並べ、
          フレンド対戦はその下に控えめな3番目の選択肢として配置する */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', maxWidth: 360 }}>
        <BigBattleTypeCard
          active={battleType === 'com'}
          label={t('mode.com')}
          desc={t('modeselect.com_desc')}
          onClick={() => setBattleType('com')}
        />
        <BigBattleTypeCard
          active={battleType === 'online'}
          label={t('modeselect.online_type')}
          desc={t('modeselect.online_type_desc')}
          onClick={() => setBattleType('online')}
        />
      </div>
      <button
        onClick={() => setBattleType('friend')}
        style={{
          width: '100%', maxWidth: 360, padding: '10px 16px', borderRadius: 10,
          border: battleType === 'friend' ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
          background: battleType === 'friend' ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)',
          color: '#ccc', textAlign: 'left', cursor: 'pointer', fontSize: 13,
        }}
      >
        <span style={{ fontWeight: 'bold' }}>{t('title.friend_match')}</span>
        <span style={{ color: '#777', marginLeft: 8 }}>{t('modeselect.friend_desc')}</span>
      </button>

      {/* COM対戦: 難易度 + 対戦相手プレビュー */}
      {battleType === 'com' && (
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>{t('modeselect.com_difficulty')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {DIFFICULTIES.map((d) => {
                const active = difficulty === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id)}
                    style={{
                      flex: 1,
                      padding: '10px 6px',
                      borderRadius: 10,
                      border: active ? `2px solid ${d.color}` : '1px solid rgba(255,255,255,0.12)',
                      background: active ? `${d.color}22` : 'rgba(255,255,255,0.04)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: active ? 'bold' : 'normal',
                    }}
                  >
                    <span style={{ marginRight: 4 }}>{d.icon}</span>{d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <span style={{ fontSize: 12, color: '#888' }}>{t('team.opponent_label')}</span>
            <span style={{ fontSize: 16, fontWeight: 'bold', color: '#cc8800' }}>{opponent.emoji}</span>
            <span style={{ fontSize: 15, fontWeight: 'bold', flex: 1 }}>{opponent.name}</span>
            <span style={{ fontSize: 12, color: '#888' }}>{t('team.era_label', { era: opponent.era })}</span>
          </div>
        </div>
      )}

      {/* オンライン対戦: ランク/カジュアル */}
      {battleType === 'online' && (
        <div style={{ width: '100%', maxWidth: 360, display: 'flex', gap: 8 }}>
          {(['ranked', 'casual'] as const).map((m) => {
            const active = onlineMode === m;
            return (
              <button
                key={m}
                onClick={() => setOnlineMode(m)}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 10,
                  border: active ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: active ? 'bold' : 'normal',
                }}
              >
                {t(m === 'ranked' ? 'mode.ranked' : 'mode.casual')}
              </button>
            );
          })}
        </div>
      )}

      {/* フレンド対戦: 招待コード/URL発行・参加画面へ */}
      {battleType === 'friend' && (
        <div style={{ width: '100%', maxWidth: 360 }}>
          <button
            onClick={() => onNavigate('friendMatch')}
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #ffd700, #ffb300)',
              color: '#000',
              fontSize: 15,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {t('title.friend_match')}
          </button>
        </div>
      )}

      {/* 開始ボタン（COM対戦 / オンライン対戦のみ。フレンド対戦は専用画面へ遷移） */}
      {battleType !== 'friend' && (
        <div style={{ display: 'flex', gap: 12, marginTop: 8, width: '100%', maxWidth: 360 }}>
          <button
            onClick={() => { if (guardOnlineLogin()) onStartWithFormation(effectiveMode, difficulty, battleType === 'com' ? opponent : null); }}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {t('modeselect.start_with_formation')}
          </button>
          <button
            onClick={() => { if (guardOnlineLogin()) onStartNow(effectiveMode, difficulty, battleType === 'com' ? opponent : null); }}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #ffd700, #ffb300)',
              color: '#000',
              fontSize: 15,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {t('modeselect.start_now')}
          </button>
        </div>
      )}

      {/* COM観戦（動作確認用・小さく配置） */}
      <button
        onClick={() => onStartNow('comVsCom', difficulty, opponent)}
        style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          color: '#777',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {t('mode.com_watch')}
      </button>

      <BackButton onClick={onBack} />
    </div>
  );
}

function BigBattleTypeCard({
  active,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '20px 12px',
        minHeight: 108,
        borderRadius: 14,
        border: active ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.12)',
        background: active
          ? 'linear-gradient(160deg, rgba(255,215,0,0.22), rgba(255,140,0,0.08))'
          : 'rgba(255,255,255,0.04)',
        color: '#fff',
        textAlign: 'center',
        cursor: 'pointer',
        boxShadow: active ? '0 0 18px rgba(255,214,0,0.2)' : 'none',
        transition: 'background 0.15s, box-shadow 0.15s',
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 900 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>{desc}</div>
    </button>
  );
}
