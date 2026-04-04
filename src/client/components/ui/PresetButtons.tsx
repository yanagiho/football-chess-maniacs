// ============================================================
// PresetButtons.tsx — プリセット行動ボタン（§2-7）
// 長押しでプリセットメニュー表示。
// ============================================================

import React, { useState, useRef, useCallback } from 'react';

type Preset = 'forward' | 'backward' | 'defend' | 'attack';

interface PresetButtonsProps {
  onApplyPreset: (preset: Preset) => void;
  isMobile: boolean;
  zocExcludeCount?: number;
}

const PRESETS: { id: Preset; label: string; desc: string }[] = [
  { id: 'forward', label: '全体前進', desc: '全コマ1HEX前方' },
  { id: 'backward', label: '全体後退', desc: '全コマ1HEX後方' },
  { id: 'defend', label: '守備ブロック', desc: 'DF/SB/VO/GK後退' },
  { id: 'attack', label: '攻撃展開', desc: 'MF/OM/WG/FW前進' },
];

const LONG_PRESS_MS = 500;

export default function PresetButtons({ onApplyPreset, isMobile, zocExcludeCount = 0 }: PresetButtonsProps) {
  const [showMenu, setShowMenu] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressStart = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setShowMenu(true);
      // §2-6 振動フィードバック
      if (isMobile && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, LONG_PRESS_MS);
  }, [isMobile]);

  const handlePressEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  const handleSelect = useCallback((preset: Preset) => {
    onApplyPreset(preset);
    setShowMenu(false);
  }, [onApplyPreset]);

  if (!isMobile) {
    // PC: キーボードショートカットで操作。UIは小さなボタン群
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onApplyPreset(p.id)}
            title={p.desc}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              background: 'rgba(255,255,255,0.1)',
              color: '#ccc',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
        {zocExcludeCount > 0 && (
          <span style={{ fontSize: 11, color: '#f90', alignSelf: 'center' }}>
            {zocExcludeCount}枚ZOC除外
          </span>
        )}
      </div>
    );
  }

  // スマホ: 長押しでメニュー表示
  return (
    <div style={{ position: 'relative' }}>
      <button
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        style={{
          padding: '8px 16px',
          fontSize: 13,
          background: 'rgba(255,255,255,0.1)',
          color: '#ccc',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        プリセット（長押し）
      </button>

      {showMenu && (
        <>
          {/* オーバーレイ */}
          <div
            onClick={() => setShowMenu(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          />
          {/* メニュー */}
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 8,
              background: 'rgba(30, 30, 50, 0.98)',
              borderRadius: 12,
              padding: 8,
              zIndex: 101,
              minWidth: 180,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelect(p.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 14,
                  background: 'transparent',
                  color: '#eee',
                  border: 'none',
                  borderRadius: 8,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <strong>{p.label}</strong>
                <br />
                <span style={{ fontSize: 11, color: '#888' }}>{p.desc}</span>
              </button>
            ))}
            {zocExcludeCount > 0 && (
              <div style={{ padding: '6px 12px', fontSize: 12, color: '#f90' }}>
                {zocExcludeCount}枚ZOC除外
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
