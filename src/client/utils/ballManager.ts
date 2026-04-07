// ============================================================
// ballManager.ts — ボール状態の一元管理
// ボールの保持者は常に1人以下。freeBallHexとhasBallは排他。
// ============================================================

import type { PieceData, HexCoord } from '../types';

export interface BallState {
  pieces: PieceData[];
  freeBallHex: HexCoord | null;
}

/**
 * ボール保持者を安全に切り替える唯一の関数。
 * 全コマのhasBallをリセットしてから、指定コマだけtrueにする。
 */
export function setBallHolder(
  pieces: PieceData[],
  newHolderId: string | null,
  freeBallHex: HexCoord | null = null,
): BallState {
  const updated = pieces.map(p => ({ ...p, hasBall: false }));

  if (newHolderId) {
    const holder = updated.find(p => p.id === newHolderId);
    if (holder) {
      holder.hasBall = true;
    } else {
      // バグ: 指定IDのコマが見つからない → フォールバック
      console.error('[ballManager] BUG: holder not found:', newHolderId);
      const fallback = updated.find(p => !p.isBench);
      if (fallback) {
        fallback.hasBall = true;
        newHolderId = fallback.id;
      }
    }
  }

  // 整合性: 保持者がいたらフリーは消す
  const resolvedFree = newHolderId ? null : freeBallHex;

  // 安全弁: 誰もボールを持っておらずフリーでもない場合 → 最初のFPに渡す
  if (!newHolderId && !resolvedFree) {
    console.error('[ballManager] BUG: No holder and no free ball! Assigning fallback.');
    const fallback = updated.find(p => !p.isBench);
    if (fallback) {
      fallback.hasBall = true;
      return { pieces: updated, freeBallHex: null };
    }
  }

  // 重複チェック
  const count = updated.filter(p => p.hasBall).length;
  if (count > 1) {
    console.error('[ballManager] BUG: Multiple holders:', updated.filter(p => p.hasBall).map(p => p.id));
    let found = false;
    for (const p of updated) {
      if (p.hasBall) {
        if (found) p.hasBall = false;
        found = true;
      }
    }
  }

  return { pieces: updated, freeBallHex: resolvedFree };
}

/**
 * 現在のボール保持者IDを取得。
 */
export function getBallHolderId(pieces: PieceData[]): string | null {
  const holder = pieces.find(p => p.hasBall && !p.isBench);
  return holder?.id ?? null;
}

/**
 * processTurn結果後のボール整合性チェック。
 * hasBall=trueが0-1人かつfreeBallHexとの排他を検証。
 */
export function assertBallIntegrity(
  pieces: Array<{ id: string; hasBall: boolean }>,
  freeBallHex: unknown,
  label = '',
): void {
  const holders = pieces.filter(p => p.hasBall);
  if (holders.length > 1) {
    console.error(`[ballManager${label}] BUG: ${holders.length} holders:`, holders.map(p => p.id));
  }
  if (holders.length > 0 && freeBallHex) {
    console.error(`[ballManager${label}] BUG: holder AND freeBallHex both set`);
  }
  if (holders.length === 0 && !freeBallHex) {
    console.error(`[ballManager${label}] WARN: No ball anywhere`);
  }
}
