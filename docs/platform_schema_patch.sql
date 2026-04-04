-- Football Century Platform DDL v1.2 追加分
-- 既存の schema.sql に以下を追加する

-- ============================================
-- catalog_items にタグ・価格情報を追加
-- ============================================

ALTER TABLE catalog_items ADD COLUMN tags TEXT[] DEFAULT '{}';
-- 用途: ゲーム別フィルタ。例: tags = ['fcms', 'piece', 'cost3']
-- GET /v1/commerce/catalog?tag=fcms で SKUプレフィクス以外にもタグでフィルタ可能

ALTER TABLE catalog_items ADD COLUMN metadata JSONB DEFAULT '{}';
-- 用途: ゲーム非依存の汎用メタデータ。ゲーム固有データはここに入れない
-- （ゲーム固有データはゲーム側のDBで管理する）

-- ============================================
-- 不足していたインデックスの追加
-- ============================================

CREATE INDEX idx_entitlements_user_sku ON entitlements (user_id, sku);
CREATE INDEX idx_entitlements_user_state ON entitlements (user_id, state);
CREATE INDEX idx_purchases_user_status ON purchases (user_id, status);
CREATE INDEX idx_catalog_items_tags ON catalog_items USING GIN (tags);
CREATE INDEX idx_catalog_items_active ON catalog_items (is_active) WHERE is_active = true;

-- ============================================
-- ゲーム向けWebhook登録テーブル
-- ============================================

CREATE TABLE game_webhook_endpoints (
    webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id VARCHAR(32) NOT NULL,
    url VARCHAR(512) NOT NULL,
    events TEXT[] NOT NULL,
    -- HMAC署名用シークレット（暗号化して保存）
    secret_encrypted VARCHAR(512) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(game_id, url)
);

-- Webhook配信ログ（監査・リトライ用）
CREATE TABLE game_webhook_deliveries (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID REFERENCES game_webhook_endpoints(webhook_id),
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    response_code INT,
    response_body TEXT,
    attempt INT DEFAULT 1,
    next_retry_at TIMESTAMPTZ,
    status VARCHAR(16) DEFAULT 'pending',
    -- pending, delivered, failed, exhausted
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_webhook_deliveries_status ON game_webhook_deliveries (status, next_retry_at)
    WHERE status IN ('pending', 'failed');

-- ============================================
-- catalog_items の価格テーブル（多通貨対応）
-- ============================================

CREATE TABLE catalog_prices (
    price_id VARCHAR(128) PRIMARY KEY,
    sku VARCHAR(64) REFERENCES catalog_items(sku) ON DELETE CASCADE,
    currency VARCHAR(3) NOT NULL,
    amount_cents INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    provider VARCHAR(32) DEFAULT 'stripe',
    provider_price_id VARCHAR(255),
    -- Stripe Price ID
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_catalog_prices_sku ON catalog_prices (sku, is_active);
