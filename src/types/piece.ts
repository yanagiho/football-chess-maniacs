// ============================================================
// piece.ts — プラットフォーム連携型定義
// piece_master / user_pieces_v2 / ショップ / Founding Eleven
// ============================================================

/** piece_master テーブル行 */
export interface PieceMaster {
  piece_id: number;
  sku: string;
  name_ja: string;
  name_en: string;
  position: string;       // GK|DF|SB|VO|MF|OM|WG|FW
  cost: number;           // 1 / 1.5 / 2 / 2.5 / 3
  era: number;            // 1-13
  era_shelf: number;      // 1-7
  family: string | null;
  nationality: string;    // ISO: GB-ENG, GB-SCO, IT 等
  is_founding: number;    // 0 or 1
  is_purchasable: number; // 0 or 1
  summary_ja: string | null;
  image_url: string | null;
  image_status: string;   // ready|provisional|missing
  /** Platform v2 product UUID (null = use sku v1 fallback) */
  platform_product_id: string | null;
  /** Platform v2 price UUID (null = use sku v1 fallback) */
  platform_price_id: string | null;
  created_at: string;
  updated_at: string;
}

/** user_pieces_v2 テーブル行 */
export interface UserPieceV2 {
  user_id: string;
  piece_id: number;
  source: 'founding' | 'purchase' | 'gift' | 'reward';
  entitlement_id: string | null;
  acquired_at: string;
}

/** GET /api/pieces 用: user_pieces_v2 JOIN piece_master */
export interface OwnedPieceDetail {
  piece_id: number;
  sku: string;
  name_ja: string;
  name_en: string;
  position: string;
  cost: number;
  era: number;
  era_shelf: number;
  family: string | null;
  nationality: string;
  is_founding: number;
  summary_ja: string | null;
  image_url: string | null;
  image_status: string;
  // user_pieces_v2 fields
  source: string;
  entitlement_id: string | null;
  acquired_at: string;
}

/** GET /api/shop/catalog 用 */
export interface ShopCatalogItem {
  piece_id: number;
  sku: string;
  name_ja: string;
  name_en: string;
  position: string;
  cost: number;
  cost_display: string;   // '1' | '1+' | '2' | '2+' | 'SS'
  era: number;
  era_shelf: number;
  era_shelf_name: string;
  family: string | null;
  nationality: string;
  summary_ja: string | null;
  image_url: string | null;
  is_owned: boolean;
}

/** Webhook ペイロード (entitlement.created / entitlement.revoked) */
export interface WebhookPurchasePayload {
  event_type: 'entitlement.created' | 'entitlement.revoked';
  event_id: string;
  timestamp: string;
  game_id?: string;
  data: {
    user_id: string;
    sku: string;
    entitlement_id: string;
    state: string;
    product_id?: string;
  };
}

// ── プリセットチーム型定義 ──

/** プリセットチーム（階段型4チーム） */
export type PresetTeam = {
  team_id: string;
  name_ja: string;
  name_en: string;
  shelf: number | null;
  formation_preset: '4-4-2' | '3-5-2' | '4-3-3' | '4-2-3-1';
  total_cost: number;
  ss_count: number;
  difficulty_tier: 1 | 2 | 3 | 4;
  unlock_condition: UnlockCondition | null;
  starters: PresetPiecePlacement[];   // 必ず11件
  bench: PresetBenchPiece[];          // MVPは空
  narrative_intro_ja: string;
  narrative_win_ja: string;
  narrative_loss_ja: string;
};

/** プリセットチームのコマ配置（away側HEX座標付き） */
export type PresetPiecePlacement = {
  piece_id: number;
  position: string;
  cost: number;
  hex_col: number;
  hex_row: number;
};

/** プリセットチームのベンチコマ */
export type PresetBenchPiece = {
  piece_id: number;
};

/** 解放条件 */
export type UnlockCondition = {
  type: 'defeat_team';
  team_id: string;
};

// ── 定数 ──

/** Founding Eleven (FC Grassroots) の piece_id */
export const FOUNDING_ELEVEN_IDS = [8, 9, 10, 23, 35, 36, 37, 55, 70, 82, 104] as const;

/** Era (1-13) → Shelf (1-7) マッピング */
export const ERA_SHELF_MAP: Record<number, number> = {
  1: 1, 2: 1,       // Dawn (草創期)
  3: 2, 4: 2,       // Interwar (戦間期)
  5: 3, 6: 3,       // Post-War (戦後黄金期)
  7: 4,             // Expansion (テレビ・拡張期)
  8: 5, 9: 5,       // Modernization (近代化期)
  10: 6, 11: 6,     // Global (グローバル期)
  12: 7, 13: 7,     // Present (現代)
};

/** Shelf名（英語 / 日本語） */
export const SHELF_NAMES: Record<number, { en: string; ja: string }> = {
  1: { en: 'Dawn', ja: '草創期' },
  2: { en: 'Interwar', ja: '戦間期' },
  3: { en: 'Post-War', ja: '戦後黄金期' },
  4: { en: 'Expansion', ja: 'テレビ・拡張期' },
  5: { en: 'Modernization', ja: '近代化期' },
  6: { en: 'Global', ja: 'グローバル期' },
  7: { en: 'Present', ja: '現代' },
};

/** コスト表示変換 */
export function costToDisplay(cost: number): string {
  if (cost === 3) return 'SS';
  if (cost === 2.5) return '2+';
  if (cost === 1.5) return '1+';
  return String(cost);
}

/** SKU → piece_id 抽出 */
export function skuToPieceId(sku: string): number | null {
  const m = sku.match(/^fcms_piece_(\d{3})$/);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return id >= 1 && id <= 200 ? id : null;
}

/** piece_id → SKU */
export function pieceIdToSku(pieceId: number): string {
  return `fcms_piece_${String(pieceId).padStart(3, '0')}`;
}
