CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    platform VARCHAR(20) NOT NULL CHECK (platform IN ('instagram', 'bale', 'rubika')),
    -- Instagram-scoped user ID (IGSID) for Instagram.
    platform_user_id VARCHAR(255) NOT NULL,

    display_name VARCHAR(255),
    phone VARCHAR(20),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (business_id, platform, platform_user_id)
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

    -- 'human' means the bot stays silent until a handoff is resolved.
    mode VARCHAR(10) NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),

    -- Small working memory for multi-step flows (e.g. order verification).
    state JSONB NOT NULL DEFAULT '{}'::jsonb,

    last_inbound_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (business_id, customer_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

    direction VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),
    -- Platform message ID (mid). Used for deduplication and echo detection.
    platform_message_id VARCHAR(255),

    content_type VARCHAR(20) NOT NULL DEFAULT 'text'
        CHECK (content_type IN ('text', 'audio', 'other')),
    text TEXT,
    transcript TEXT,

    handled_by VARCHAR(10) CHECK (handled_by IN ('bot', 'human', 'owner_app')),
    intent VARCHAR(64),
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX messages_platform_message_id_uidx
    ON messages (platform_message_id) WHERE platform_message_id IS NOT NULL;
CREATE INDEX messages_conversation_id_idx ON messages (conversation_id, created_at);

CREATE TABLE handoff_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

    reason VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX handoff_tasks_business_status_idx ON handoff_tasks (business_id, status);

-- Raw inbound payloads, kept for audit and replay. event_key is a hash of the raw body,
-- so identical redeliveries from the platform are stored once.
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    platform VARCHAR(20) NOT NULL,
    event_key VARCHAR(64) NOT NULL UNIQUE,
    payload JSONB NOT NULL,

    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    error TEXT
);

-- Monthly usage per business, checked against the plan limit before every AI reply.
CREATE TABLE usage_counters (
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    period CHAR(7) NOT NULL,            -- 'YYYY-MM'
    kind VARCHAR(30) NOT NULL,          -- e.g. 'ai_reply', 'transcription'
    count INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (business_id, period, kind)
);
