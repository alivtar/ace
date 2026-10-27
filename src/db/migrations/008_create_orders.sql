-- Orders are created in this app only (V1). Order status is verified with
-- order code + the phone number stored on the order before anything is disclosed.
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,

    order_code VARCHAR(32) NOT NULL,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'returned')),

    total_toman BIGINT NOT NULL DEFAULT 0 CHECK (total_toman >= 0),

    tracking_code VARCHAR(100),
    carrier VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (business_id, order_code)
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,

    -- Snapshot at order time, so later catalog edits don't rewrite history.
    product_name VARCHAR(255) NOT NULL,
    variant_label VARCHAR(255),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_toman BIGINT NOT NULL CHECK (unit_price_toman >= 0)
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);
