// ============================================================
// api.ts — クライアント共通APIヘルパー
// ============================================================

/**
 * API ベースURL取得
 * - 開発: wrangler dev (localhost:8787)
 * - 本番: 同一オリジン
 */
export function getApiBaseUrl(): string {
  // Vite dev mode: import.meta.env.DEV
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((import.meta as any).env?.DEV) {
    return 'http://localhost:8787';
  }
  return '';
}

/**
 * 型安全な API fetch ヘルパー
 */
export async function apiFetch<T>(
  path: string,
  opts?: RequestInit & { token?: string },
): Promise<T> {
  const { token, ...init } = opts ?? {};
  const headers = new Headers(init.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.method && init.method !== 'GET' && init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${getApiBaseUrl()}${path}`;
  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * コマ画像URL生成
 * piece_id → /images/pieces/003.svg
 */
export function pieceImageUrl(pieceId: number): string {
  const padded = String(pieceId).padStart(3, '0');
  return `/images/pieces/${padded}.svg`;
}

/**
 * 仮画像かどうか判定
 */
export function isProvisionalImage(status: string | null | undefined): boolean {
  return !status || status !== 'ready';
}
