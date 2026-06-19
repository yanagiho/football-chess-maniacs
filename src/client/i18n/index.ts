// =====================================================================
// i18n 器 本体 — ShootOutDice で実証した tn() クロスロケール
// フォールバック修正込み。
//
// 移植時の調整ポイント:
//  - DICTS / SUPPORTED_LOCALES に対象プロジェクトの言語を増減する
//  - 永続化キー名(STORAGE_KEY)をプロジェクトごとに変える
//  - React 以外で使う場合、下部の「React 結線」は読み替える
//
// 重要(教訓1): lookupPlural() が「同一ロケール内で
//   .variant → .other → root まで試し切ってから初めて FALLBACK_LOCALE に
//   落ちる」ことで、複数形なし言語(ko/zh-CN)への日本語混入を防いでいる。
//   この順序を崩さないこと。
// =====================================================================

import ja from './ja';
import en from './en';
import ko from './ko';
import es from './es';
import pt from './pt';
import de from './de';
import zhCN from './zh-CN';
// import es from './es';
// import pt from './pt';
// import de from './de';
// import zhCN from './zh-CN';

export type Dict = Record<string, string>;

// --- 対応言語(ここを増やすとプルダウンにも自動で並ぶ) ---
export const SUPPORTED_LOCALES = ['ja', 'en', 'ko', 'es', 'pt', 'de', 'zh-CN'] as const;
//   足すときの例: ['ja', 'en', 'ko', 'es', 'pt', 'de', 'zh-CN'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// --- 各言語の自称表記(言語切替プルダウンのラベル) ---
// SUPPORTED_LOCALES に言語を足したら、ここにも自称表記を1行追加する。
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
  ko: '한국어',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  'zh-CN': '简体中文',
};

// --- 辞書登録(言語を足すたびここに1行追加) ---
const DICTS: Record<string, Dict> = {
  ja,
  en,
  ko,
  es,
  pt,
  de,
  'zh-CN': zhCN,
};

// 正本言語(キーが引けない最後の砦)。原文を書く言語にする。
const FALLBACK_LOCALE: Locale = 'ja';

const STORAGE_KEY = 'fcms.locale'; // FCMS (Football Chess ManiacS) ロケール永続化キー

// ---------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------
let currentLocale: Locale = FALLBACK_LOCALE;
const listeners = new Set<() => void>();

// ---------------------------------------------------------------------
// 低レベル lookup
// ---------------------------------------------------------------------

// 単一キーを「指定ロケール → フォールバック」の順で引く。
function lookup(key: string): string | undefined {
  const dict = DICTS[currentLocale];
  if (dict && key in dict) return dict[key];
  const fb = DICTS[FALLBACK_LOCALE];
  if (fb && key in fb) return fb[key];
  return undefined;
}

// 複数形キーを引く。★教訓1の核心★
// 同一ロケール内で variant → other → root まで試し切ってから、
// 初めてフォールバック言語に落ちる。これにより
// 複数形なし言語(.other だけ持つ ko/zh-CN)に他言語が混入しない。
function lookupPlural(key: string, variant: 'one' | 'other'): string | undefined {
  const dict = DICTS[currentLocale];
  if (dict) {
    if (`${key}.${variant}` in dict) return dict[`${key}.${variant}`];
    if (`${key}.other` in dict) return dict[`${key}.other`]; // ← 複数形なし言語はここで解決
    if (key in dict) return dict[key];
  }
  // 同一ロケールで一切引けなかったときだけフォールバックへ
  const fb = DICTS[FALLBACK_LOCALE];
  if (fb) {
    if (`${key}.${variant}` in fb) return fb[`${key}.${variant}`];
    if (`${key}.other` in fb) return fb[`${key}.other`];
    if (key in fb) return fb[key];
  }
  return undefined;
}

// {var} 補間
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

// ---------------------------------------------------------------------
// 公開API
// ---------------------------------------------------------------------

// 通常翻訳。未登録キーはキー文字列を返す(例外を投げない=画面が壊れない)
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = lookup(key) ?? key;
  return interpolate(raw, params);
}

// 複数形対応翻訳。count に応じて .one / .other を選ぶ。
// 英語的な単複(1 が one、それ以外 other)を既定とする。
// 言語固有の複雑な複数形ルールが必要なら、ここに CLDR 的分岐を足す。
export function tn(
  key: string,
  count: number,
  params?: Record<string, string | number>,
): string {
  const variant: 'one' | 'other' = count === 1 ? 'one' : 'other';
  const raw = lookupPlural(key, variant) ?? key;
  return interpolate(raw, { ...params, count });
}

// 現在ロケール取得
export function getLocale(): Locale {
  return currentLocale;
}

// ロケール変更 + 永続化 + 購読者通知
export function setLocale(locale: Locale): void {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* localStorage 不可環境は無視 */
  }
  listeners.forEach((fn) => fn());
}

// 変更購読(React の再レンダリング結線などに使う)
export function addLocaleListener(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// 初期ロケール決定: localStorage → ブラウザ言語 → フォールバック
export function detectInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.includes(saved as Locale)) return saved as Locale;
  } catch {
    /* ignore */
  }
  const browser = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
  // prefix 分岐(言語を足したらここにも追加する)
  if (browser.startsWith('ja')) return 'ja' as Locale;
  if (browser.startsWith('en')) return 'en' as Locale;
  if (browser.startsWith('ko')) return 'ko' as Locale;
  if (browser.startsWith('es')) return 'es' as Locale;
  if (browser.startsWith('pt')) return 'pt' as Locale;
  if (browser.startsWith('de')) return 'de' as Locale;
  if (browser.startsWith('zh')) return 'zh-CN' as Locale;
  return FALLBACK_LOCALE;
}

// アプリ起動時に1回呼ぶ
export function initLocale(): void {
  currentLocale = detectInitialLocale();
}

// ---------------------------------------------------------------------
// テスト用(本番では使わない): 辞書を直接触るための露出
// i18n.test.ts が複数形フォールバックを検証するのに使う
// ---------------------------------------------------------------------
export const __test__ = {
  DICTS,
  SUPPORTED_LOCALES,
  FALLBACK_LOCALE,
  setCurrent: (l: Locale) => {
    currentLocale = l;
  },
};
