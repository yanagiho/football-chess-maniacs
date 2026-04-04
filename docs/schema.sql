-- FOOTBALL CENTURY Platform DDL v1.1 Final
-- Target: PostgreSQL 13+ (Cloudflare Hyperdrive compatible)

-- Use standard pgcrypto/built-in gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users & Auth
CREATE TYPE user_state AS ENUM ('active', 'suspended', 'banned', 'deleted');

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    state user_state DEFAULT 'active',
    region VARCHAR(10) DEFAULT 'JP',
    locale VARCHAR(10) DEFAULT 'ja-JP',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    device_info JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    display_name VARCHAR(32) NOT NULL,
    bio VARCHAR(160),
    avatar_public BOOLEAN DEFAULT true,
    avatar_config JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Commerce & Entitlements
CREATE TABLE catalog_items (
    sku VARCHAR(64) PRIMARY KEY,
    type VARCHAR(32) NOT NULL, -- subscription, consumable, bundle
    name VARCHAR(128) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE purchase_status AS ENUM ('pending', 'paid', 'refunded', 'failed');

CREATE TABLE purchases (
    purchase_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    sku VARCHAR(64) REFERENCES catalog_items(sku),
    price_id VARCHAR(128),
    amount_cents INTEGER, -- Nullable for creation phase (MVP)
    currency VARCHAR(3),  -- Nullable for creation phase (MVP)
    provider VARCHAR(32) NOT NULL, -- stripe
    provider_tx_id VARCHAR(255), -- Stripe PaymentIntent/Session ID
    status purchase_status DEFAULT 'pending',
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider, provider_tx_id)
);

CREATE TYPE entitlement_state AS ENUM ('active', 'revoked', 'expired');

CREATE TABLE entitlements (
    entitlement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    sku VARCHAR(64) REFERENCES catalog_items(sku),
    kind VARCHAR(32) NOT NULL, -- subscription, purchase, grant
    state entitlement_state DEFAULT 'active',
    start_at TIMESTAMPTZ DEFAULT NOW(),
    end_at TIMESTAMPTZ,
    source_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Community (Forum)
CREATE TABLE forum_categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    is_public_read BOOLEAN DEFAULT true
);

CREATE TABLE forum_threads (
    thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES forum_categories(category_id),
    author_id UUID REFERENCES users(user_id),
    title VARCHAR(128) NOT NULL,
    is_locked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE forum_posts (
    post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES forum_threads(thread_id),
    author_id UUID REFERENCES users(user_id),
    body TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Social (DM / Friends)
CREATE TABLE dm_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dm_messages_pair ON dm_messages (sender_id, recipient_id, created_at DESC);

CREATE TYPE friend_req_status AS ENUM ('pending', 'accepted', 'rejected', 'canceled');

CREATE TABLE friend_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    to_user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    status friend_req_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(from_user_id, to_user_id)
);

CREATE TABLE friendships (
    user_id_a UUID REFERENCES users(user_id) ON DELETE CASCADE,
    user_id_b UUID REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id_a, user_id_b),
    -- Ensure A < B to prevent duplicates (A-B vs B-A)
    CHECK (user_id_a < user_id_b)
);

-- 5. Moderation
CREATE TYPE report_status AS ENUM ('open', 'triaged', 'resolved', 'rejected');

CREATE TABLE moderation_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id UUID REFERENCES users(user_id),
    target_type VARCHAR(32) NOT NULL, -- user, forum_post, dm_message
    target_id UUID NOT NULL,
    reason_code VARCHAR(32),
    detail TEXT,
    status report_status DEFAULT 'open',
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. System & Audit
CREATE TABLE audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id UUID,
    metadata JSONB,
    trace_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE idempotency_keys (
    key_id VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    path VARCHAR(255) NOT NULL,
    response_code INT,
    response_body JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);