// ============================================================
// crypto_utils.ts — 暗号関連ユーティリティ
// ============================================================

/** 定数時間文字列比較（タイミング攻撃防止） */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  // 長さ不一致も定数時間で処理（短い方を基準にXOR、長さ差もresultに混入）
  const len = Math.max(bufA.length, bufB.length);
  let result = bufA.length ^ bufB.length;
  for (let i = 0; i < len; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return result === 0;
}

/** matchIdのフォーマット検証（パストラバーサル防止） */
export const MATCH_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
