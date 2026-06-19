// =====================================================================
// LanguageSelect.tsx — 言語切替プルダウン(フェーズ6)
//
// SUPPORTED_LOCALES から自動生成する。言語を index.ts に足せば
// （SUPPORTED_LOCALES + LOCALE_NATIVE_NAMES + DICTS）ここは無改修で並ぶ。
// 選択 → setLocale() で即反映（useLocale 購読でアプリ全体が再レンダ）
// + localStorage 永続化。リロード不要。
// =====================================================================

import React from 'react';
import {
  SUPPORTED_LOCALES,
  LOCALE_NATIVE_NAMES,
  setLocale,
  type Locale,
} from './index';
import { useLocale } from './useLocale';

interface LanguageSelectProps {
  /** <select> に渡す追加スタイル(設定画面の既存スタイルに合わせる用) */
  style?: React.CSSProperties;
  className?: string;
}

export default function LanguageSelect({ style, className }: LanguageSelectProps) {
  const locale = useLocale();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className={className}
      style={style}
      aria-label="Language"
    >
      {SUPPORTED_LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {LOCALE_NATIVE_NAMES[loc]}
        </option>
      ))}
    </select>
  );
}
