ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Tenant = the owner (users). A business belongs to one owner; one owner may have several.
-- business_type is an extension point: V1 supports 'online_shop' only.
CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    business_type VARCHAR(30) NOT NULL DEFAULT 'online_shop'
        CHECK (business_type IN ('online_shop')),

    name VARCHAR(255) NOT NULL,

    plan VARCHAR(20) NOT NULL DEFAULT 'basic'
        CHECK (plan IN ('basic', 'medium', 'premium')),

    ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Owner-editable facts the bot may quote: opening hours, shipping, payment, returns, etc.
    -- price_unit is 'toman' or 'rial' and tells the importers how to read prices.
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX businesses_owner_id_idx ON businesses (owner_id);

-- One row per connected messaging account. Platform-neutral on purpose:
-- adding Bale or Rubika means a new platform value and an adapter, not a schema change.
CREATE TABLE channel_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    platform VARCHAR(20) NOT NULL CHECK (platform IN ('instagram', 'bale', 'rubika')),

    -- For Instagram: the professional account ID that appears as entry.id in webhooks.
    external_account_id VARCHAR(255) NOT NULL,

    -- AES-256-GCM encrypted with TOKEN_ENCRYPTION_KEY. Never store plaintext tokens.
    access_token_encrypted TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,

    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'disconnected')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (platform, external_account_id)
);

CREATE INDEX channel_connections_business_id_idx ON channel_connections (business_id);
