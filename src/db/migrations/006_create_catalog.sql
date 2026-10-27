CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    -- Persian-normalized name used for search (see src/utils/persian.ts).
    name_normalized VARCHAR(255) NOT NULL,

    -- Owner-curated search aliases, including Finglish spellings (e.g. 'shalvar', 'tishert').
    aliases TEXT[] NOT NULL DEFAULT '{}',

    description TEXT,
    category VARCHAR(255),

    status VARCHAR(20) NOT NULL DEFAULT 'published'
        CHECK (status IN ('published', 'draft', 'archived')),

    image_urls TEXT[] NOT NULL DEFAULT '{}',

    source VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'csv', 'woocommerce', 'basalam')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX products_business_name_idx ON products (business_id, name_normalized);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    sku VARCHAR(255),

    -- e.g. {"رنگ": "مشکی", "سایز": "M"}
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Prices are integers in toman. Never store floats for money.
    price_toman BIGINT NOT NULL CHECK (price_toman >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_variants_product_id_idx ON product_variants (product_id);

CREATE TABLE product_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    source VARCHAR(20) NOT NULL CHECK (source IN ('csv', 'woocommerce', 'basalam')),

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'staged', 'failed')),

    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX product_import_jobs_business_id_idx ON product_import_jobs (business_id);

-- Staged drafts. Nothing reaches `products` until the owner approves the item.
CREATE TABLE product_import_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    job_id UUID NOT NULL REFERENCES product_import_jobs(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    external_id VARCHAR(255) NOT NULL,
    draft JSONB NOT NULL,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),

    product_id UUID REFERENCES products(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (job_id, external_id)
);

CREATE INDEX product_import_items_job_id_idx ON product_import_items (job_id, status);

-- Maps a product in a shop's own system to ours, so re-imports update instead of duplicating.
CREATE TABLE external_product_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    source VARCHAR(20) NOT NULL CHECK (source IN ('csv', 'woocommerce', 'basalam')),
    external_id VARCHAR(255) NOT NULL,

    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    content_hash VARCHAR(64) NOT NULL,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (business_id, source, external_id)
);
