// ============================================================
// SettingsScreen.tsx — 設定画面（B6）
// ============================================================

import React from 'react';
import type { Page } from '../types';
import { useSettings, type AppSettings } from '../contexts/SettingsContext';

interface SettingsScreenProps {
  onNavigate: (page: Page) => void;
}

const SPEED_OPTIONS: { value: AppSettings['animationSpeed']; label: string }[] = [
  { value: 0.5, label: '遅い' },
  { value: 1, label: '普通' },
  { value: 2, label: '速い' },
];

export default function SettingsScreen({ onNavigate }: SettingsScreenProps) {
  const { settings, update } = useSettings();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100%', padding: '20px 16px', gap: 16, overflowY: 'auto',
      background: 'linear-gradient(180deg, #0a0a1e 0%, #1a1a3e 100%)',
    }}>
      <h2 style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', margin: 0 }}>SETTINGS</h2>

      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* アニメーション速度 */}
        <Section title="アニメーション速度">
          <div style={{ display: 'flex', gap: 8 }}>
            {SPEED_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => update({ animationSpeed: opt.value })} style={{
                flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                border: settings.animationSpeed === opt.value ? '1px solid #4488cc' : '1px solid rgba(255,255,255,0.1)',
                background: settings.animationSpeed === opt.value ? 'rgba(68,136,204,0.2)' : 'transparent',
                color: settings.animationSpeed === opt.value ? '#4488cc' : '#888',
              }}>
                {opt.label} ({opt.value}x)
              </button>
            ))}
          </div>
        </Section>

        {/* サウンド */}
        <Section title="サウンド">
          <ToggleRow label="BGM" checked={settings.bgmEnabled} onChange={v => update({ bgmEnabled: v })} />
          <ToggleRow label="効果音" checked={settings.sfxEnabled} onChange={v => update({ sfxEnabled: v })} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span style={{ color: '#888', fontSize: 13, width: 50 }}>音量</span>
            <input type="range" min={0} max={100} value={settings.volume}
              onChange={e => update({ volume: Number(e.target.value) })}
              style={{ flex: 1, accentColor: '#4488cc' }}
            />
            <span style={{ color: '#aaa', fontSize: 12, width: 30, textAlign: 'right' }}>{settings.volume}</span>
          </div>
        </Section>

        {/* 表示設定 */}
        <Section title="表示設定">
          <ToggleRow label="オフサイドライン常時表示" checked={settings.showOffsideLine} onChange={v => update({ showOffsideLine: v })} />
          <ToggleRow label="ZOC表示" checked={settings.showZoc} onChange={v => update({ showZoc: v })} />
          <ToggleRow label="パスライン警告" checked={settings.showPassWarning} onChange={v => update({ showPassWarning: v })} />
        </Section>

        {/* その他 */}
        <Section title="その他">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#888', fontSize: 13, flex: 1 }}>言語</span>
            <select value={settings.language} onChange={e => update({ language: e.target.value as 'ja' | 'en' })} style={{
              background: '#1a1a3e', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, padding: '4px 8px', fontSize: 13,
            }}>
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#555' }}>
            <span>利用規約</span>
            <span>プライバシーポリシー</span>
            <span>Version 0.9.0 (Phase B)</span>
          </div>
        </Section>
      </div>

      <button onClick={() => onNavigate('title')} style={{
        padding: '8px 24px', background: 'transparent',
        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
        color: '#888', fontSize: 14, cursor: 'pointer', marginBottom: 20,
      }}>
        戻る
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 'bold', color: '#fff', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ color: '#888', fontSize: 13 }}>{label}</span>
      <button onClick={() => onChange(!checked)} style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: checked ? '#4488cc' : '#333', position: 'relative', transition: 'background 0.2s',
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3,
          left: checked ? 22 : 4, transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );
}
