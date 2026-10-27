import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// Runs against a real Postgres. Set TEST_DATABASE_URL to enable (skipped otherwise).
// Each run uses its own schema, so it never touches other data in the database.
const TEST_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `test_${process.pid}_${Date.now()}`;
const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'db', 'migrations');

const skip = TEST_URL ? false : 'TEST_DATABASE_URL not set';

let client: pg.Client;

before(async () => {
  if (skip) return;
  client = new pg.Client({ connectionString: TEST_URL });
  await client.connect();
  await client.query(`CREATE SCHEMA ${SCHEMA}`);
  await client.query(`SET search_path TO ${SCHEMA}`);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
  }
});

after(async () => {
  if (skip || !client) return;
  await client.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
  await client.end();
});

const seedBusiness = async () => {
  const user = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
    [`owner-${Math.random()}@example.ir`],
  );
  const business = await client.query<{ id: string }>(
    `INSERT INTO businesses (owner_id, name) VALUES ($1, 'فروشگاه تست') RETURNING id`,
    [user.rows[0].id],
  );
  return business.rows[0].id;
};

test('migrations apply in order to an empty schema', { skip }, async () => {
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
    [SCHEMA],
  );
  const names = rows.map((r) => r.table_name);
  for (const expected of ['users', 'businesses', 'channel_connections', 'products', 'product_variants', 'orders', 'messages']) {
    assert.ok(names.includes(expected), `missing table ${expected}`);
  }
  assert.ok(!names.includes('support_tasks'));
  assert.ok(!names.includes('banners'));
});

test('a platform message id can be stored only once', { skip }, async () => {
  const businessId = await seedBusiness();
  const customer = await client.query<{ id: string }>(
    `INSERT INTO customers (business_id, platform, platform_user_id) VALUES ($1, 'instagram', 'IGSID-1') RETURNING id`,
    [businessId],
  );
  const conversation = await client.query<{ id: string }>(
    `INSERT INTO conversations (business_id, customer_id) VALUES ($1, $2) RETURNING id`,
    [businessId, customer.rows[0].id],
  );
  const conversationId = conversation.rows[0].id;
  const insert = (mid: string | null) => client.query(
    `INSERT INTO messages (business_id, conversation_id, direction, platform_message_id) VALUES ($1, $2, 'in', $3)`,
    [businessId, conversationId, mid],
  );

  await insert('mid.1');
  await assert.rejects(insert('mid.1'), (error: { code?: string }) => error.code === '23505');
  // Messages without a platform id are not deduplicated.
  await insert(null);
  await insert(null);
});

test('one Instagram account can belong to only one business', { skip }, async () => {
  const first = await seedBusiness();
  const second = await seedBusiness();
  const connect = (businessId: string) => client.query(
    `INSERT INTO channel_connections (business_id, platform, external_account_id, access_token_encrypted)
     VALUES ($1, 'instagram', 'IG-ACCOUNT-9', 'enc')`,
    [businessId],
  );
  await connect(first);
  await assert.rejects(connect(second), (error: { code?: string }) => error.code === '23505');
});

test('plans and business types are restricted to known values', { skip }, async () => {
  const user = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
    [`check-${Math.random()}@example.ir`],
  );
  const insertBusiness = (plan: string, type: string) => client.query(
    `INSERT INTO businesses (owner_id, name, plan, business_type) VALUES ($1, 'x', $2, $3)`,
    [user.rows[0].id, plan, type],
  );
  await assert.rejects(insertBusiness('gold', 'online_shop'), (error: { code?: string }) => error.code === '23514');
  await assert.rejects(insertBusiness('basic', 'restaurant'), (error: { code?: string }) => error.code === '23514');
  await insertBusiness('premium', 'online_shop');
});

test('one customer record per business and platform user', { skip }, async () => {
  const businessId = await seedBusiness();
  const insert = () => client.query(
    `INSERT INTO customers (business_id, platform, platform_user_id) VALUES ($1, 'instagram', 'IGSID-dup')`,
    [businessId],
  );
  await insert();
  await assert.rejects(insert(), (error: { code?: string }) => error.code === '23505');
});
