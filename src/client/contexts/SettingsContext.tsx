// ============================================================
// SettingsContext.tsx — アプリ設定（localStorage永続化）
// ============================================================

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface AppSettings {
  animationSpeed: 0.5 | 1 | 2;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  volume: number;
  showOffsideLine: boolean;
  showZoc: boolean;
  showPassWarning: boolean;
  language: 'ja' | 'en';
}

const DEFAULT_SETTINGS: AppSettings = {
  animationSpeed: 1,
  bgmEnabled: true,
  sfxEnabled: true,
  volume: 80,
  showOffsideLine: false,
  showZoc: false,
  showPassWarning: true,
  language: 'ja',
};

const STORAGE_KEY = 'fcms_settings';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

interface SettingsContextValue {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
