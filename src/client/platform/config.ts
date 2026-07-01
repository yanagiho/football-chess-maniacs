// ============================================================
// config.ts — Universo Futbol Platform API 接続先の解決
// GrassrootsFootball (threejs-client/src/flavorConfig.js) と同一パターン。
// 本番URLは src/wrangler.toml の PLATFORM_API_BASE と同じ値。
// ============================================================

const PLATFORM_API_PRODUCTION_URL = 'https://fc-platform-api.yanagiho.workers.dev';
const PLATFORM_API_LOCAL_URL = 'http://localhost:8788';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function envString(key: string): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return env[key];
}

function defaultPlatformApiUrl(): string {
  if (typeof window === 'undefined') return PLATFORM_API_LOCAL_URL;
  return LOCAL_HOSTNAMES.has(window.location.hostname) ? PLATFORM_API_LOCAL_URL : PLATFORM_API_PRODUCTION_URL;
}

/** Platform API のベースURL（環境変数 VITE_PLATFORM_API_URL で上書き可能） */
export function getPlatformApiUrl(): string {
  return envString('VITE_PLATFORM_API_URL') || defaultPlatformApiUrl();
}
