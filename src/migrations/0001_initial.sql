-- ============================================================
-- 0001_initial.sql — 初期スキーマ（matches, teams, user_pieces, user_ratings）
-- ============================================================

-- 試合テーブル
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  home_user_id TEXT NOT NULL,
  away_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'playing',
  score_home INTEGER NOT NULL DEFAULT 0,
  score_away INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_matches_home_user ON matches(home_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_user ON matches(away_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

-- チーム編成テーブル
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  field_pieces TEXT NOT NULL DEFAULT '[]',
  bench_pieces TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id);

-- 所持コマテーブル
CREATE TABLE IF NOT EXISTS user_pieces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  piece_type TEXT NOT NULL,
  cost REAL NOT NULL,
  variant INTEGER DEFAULT 1,
  name TEXT DEFAULT '',
  acquired_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_pieces_user_id ON user_pieces(user_id);

-- レーティングテーブル
CREATE TABLE IF NOT EXISTS user_ratings (
  user_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  highest_rating INTEGER NOT NULL DEFAULT 1000,
  updated_at TEXT NOT NULL
);
