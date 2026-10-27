import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Real-Postgres test support. Each suite gets its own schema, built from the real migrations,
// so tests never touch other data. Enabled only when TEST_DATABASE_URL is set.

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL;

const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'db', 'migrations');

export type TestDatabase = {
  pool: pg.Pool;
  schema: string;
  close: () => Promise<void>;
};

export const createTestDatabase = async (url: string): Promise<TestDatabase> => {
  const schema = `t_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      await admin.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    }
  } finally {
    await admin.end();
  }

  const pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  return {
    pool,
    schema,
    close: async () => {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: url });
      await cleanup.connect();
      await cleanup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await cleanup.end();
    },
  };
};
