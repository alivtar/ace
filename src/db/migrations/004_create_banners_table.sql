CREATE TABLE banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    image_url TEXT NOT NULL,

    cloudinary_public_id TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);