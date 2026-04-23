-- ============================================================
-- 0002_platform_integration.sql — プラットフォーム連携スキーマ
-- piece_master / user_pieces_v2 / webhook_deliveries_received /
-- user_display_name_cache + teams/user_ratings ALTER
-- ============================================================

-- ── 200人コマ原本テーブル ──
CREATE TABLE IF NOT EXISTS piece_master (
  piece_id       INTEGER PRIMARY KEY,          -- 1-200
  sku            TEXT UNIQUE NOT NULL,          -- 'fcms_piece_001'
  name_ja        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  position       TEXT NOT NULL,                 -- GK|DF|SB|VO|MF|OM|WG|FW
  cost           REAL NOT NULL,                 -- 1 / 1.5 / 2 / 2.5 / 3
  era            INTEGER NOT NULL,              -- 1-13 (GrassRoots 13 Era)
  era_shelf      INTEGER NOT NULL,              -- 1-7 (FCMS 7時代)
  family         TEXT,                          -- 'blackwood' | NULL
  nationality    TEXT NOT NULL,                 -- ISO: GB-ENG, GB-SCO, IT 等
  is_founding    INTEGER NOT NULL DEFAULT 0,    -- 1 = FC Grassroots 創設メンバー
  is_purchasable INTEGER NOT NULL DEFAULT 1,    -- 0 = Founding Eleven (購入不可)
  summary_ja     TEXT,
  image_url      TEXT,
  image_status   TEXT NOT NULL DEFAULT 'provisional', -- ready|provisional|missing
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pm_sku ON piece_master(sku);
CREATE INDEX IF NOT EXISTS idx_pm_position ON piece_master(position);
CREATE INDEX IF NOT EXISTS idx_pm_cost ON piece_master(cost);
CREATE INDEX IF NOT EXISTS idx_pm_era_shelf ON piece_master(era_shelf);
CREATE INDEX IF NOT EXISTS idx_pm_family ON piece_master(family);

-- ── 所持コマ v2（piece_master FK、複合PK）──
CREATE TABLE IF NOT EXISTS user_pieces_v2 (
  user_id        TEXT NOT NULL,
  piece_id       INTEGER NOT NULL REFERENCES piece_master(piece_id),
  source         TEXT NOT NULL DEFAULT 'founding', -- founding|purchase|gift|reward
  entitlement_id TEXT,                             -- Platform entitlement_id (nullable)
  acquired_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, piece_id)
);

CREATE INDEX IF NOT EXISTS idx_upv2_user ON user_pieces_v2(user_id);

-- ── Webhook配信受信記録（冪等化）──
CREATE TABLE IF NOT EXISTS webhook_deliveries_received (
  delivery_id  TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  processed    INTEGER NOT NULL DEFAULT 0,
  result       TEXT
);

-- ── 表示名キャッシュ（Platform連携）──
CREATE TABLE IF NOT EXISTS user_display_name_cache (
  user_id      TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  cached_at    TEXT NOT NULL
);

-- ── teams 拡張 ──
ALTER TABLE teams ADD COLUMN slot_number INTEGER DEFAULT 1;
ALTER TABLE teams ADD COLUMN is_active INTEGER DEFAULT 0;
ALTER TABLE teams ADD COLUMN formation_preset TEXT DEFAULT '4-4-2';

-- ── user_ratings 拡張 ──
ALTER TABLE user_ratings ADD COLUMN games INTEGER DEFAULT 0;
ALTER TABLE user_ratings ADD COLUMN season_id TEXT DEFAULT '';
