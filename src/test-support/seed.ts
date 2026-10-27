import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { normalizePersian } from '../utils/persian';

export type SeededShop = {
  businessId: string;
  accountId: string;
  /** Plaintext token. Tests inject an identity decryptToken, so the token stays readable. */
  encryptedToken: string;
};

export const seedShop = async (
  pool: Pool,
  options: { plan?: 'basic' | 'medium' | 'premium'; aiEnabled?: boolean; settings?: Record<string, unknown>; accountId?: string } = {},
): Promise<SeededShop> => {
  // Unique per shop: one Instagram account can belong to only one business.
  const accountId = options.accountId ?? `PAGE_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
    [`owner-${Math.random()}@example.ir`],
  );
  const business = await pool.query<{ id: string }>(
    `INSERT INTO businesses (owner_id, name, plan, ai_enabled, settings)
     VALUES ($1, 'فروشگاه نمونه', $2, $3, $4::jsonb) RETURNING id`,
    [
      user.rows[0].id,
      options.plan ?? 'premium',
      options.aiEnabled ?? true,
      JSON.stringify(options.settings ?? defaultSettings),
    ],
  );
  const businessId = business.rows[0].id;
  const encryptedToken = 'token-abc';
  await pool.query(
    `INSERT INTO channel_connections (business_id, platform, external_account_id, access_token_encrypted)
     VALUES ($1, 'instagram', $2, $3)`,
    [businessId, accountId, encryptedToken],
  );
  return { businessId, accountId, encryptedToken };
};

export const defaultSettings = {
  store: { address: 'تهران، ولیعصر', phone: '02188000000', opening_hours: 'شنبه تا پنجشنبه ۹ تا ۱۸' },
  shipping: 'ارسال با پست پیشتاز، ۳ تا ۵ روز کاری',
  returns: 'تا ۷ روز پس از دریافت، با شرط سالم بودن کالا',
  faq: [{ q: 'ضمانت دارید؟', a: 'بله، ضمانت اصالت کالا' }],
};

export const seedProduct = async (
  pool: Pool,
  businessId: string,
  product: {
    name: string;
    aliases?: string[];
    variants: Array<{ attributes: Record<string, string>; price: number; stock: number }>;
  },
): Promise<string> => {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO products (business_id, name, name_normalized, aliases, source)
     VALUES ($1, $2, $3, $4, 'manual') RETURNING id`,
    [businessId, product.name, normalizePersian(product.name), product.aliases ?? []],
  );
  const productId = rows[0].id;
  for (const variant of product.variants) {
    await pool.query(
      `INSERT INTO product_variants (product_id, business_id, attributes, price_toman, stock_quantity)
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [productId, businessId, JSON.stringify(variant.attributes), variant.price, variant.stock],
    );
  }
  return productId;
};

export const seedOrder = async (
  pool: Pool,
  businessId: string,
  order: { code: string; phone: string; status: string; trackingCode?: string; carrier?: string; total: number },
) => {
  await pool.query(
    `INSERT INTO orders (business_id, order_code, customer_phone, status, tracking_code, carrier, total_toman)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [businessId, order.code, order.phone, order.status, order.trackingCode ?? null, order.carrier ?? null, order.total],
  );
};
