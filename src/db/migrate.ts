import path from 'node:path';
import pool from './pool';
import logger from '../configs/logger';
import fs from 'fs/promises';

const MIGRATION_FILES_DIR = path.join(process.cwd(), 'src', 'db', 'migrations');

const CREATE_MIGRATIONS_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`;

type Migration = {
  id: string;
  name: string;
  executed_at: string;
};

const getExecutedMigrations = async (): Promise<Array<Migration['name']>> => {
  const result = await pool.query<Migration>(
    `
        SELECT name FROM migrations
        ORDER BY name
    `,
  );

  const executedMigrations = result.rows.map((row) => row.name);
  return executedMigrations;
};

const getAllMigrations = async (): Promise<Array<string>> => {
  const allFiles = await fs.readdir(MIGRATION_FILES_DIR);

  const allMigrationFiles = allFiles
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return allMigrationFiles;
};

const runMigration = async (migrationFilename: string) => {
  const sql = await fs.readFile(
    path.join(MIGRATION_FILES_DIR, migrationFilename),
    'utf-8',
  );

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`INSERT INTO migrations (name) VALUES ($1)`, [
      migrationFilename,
    ]);
    await client.query('COMMIT');

    logger.info(`Migration completed: ${migrationFilename}`);
  } catch (error) {
    await client.query('ROLLBACK');

    logger.error(
      {
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          ...(typeof error === 'object' && error !== null ? error : {}),
        },
      },
      `Could not finish migration ${migrationFilename}`,
    );

    throw error;
  } finally {
    client.release();
  }
};

const migrate = async () => {
  await pool.query(CREATE_MIGRATIONS_TABLE_SQL);

  const executedMigrations = await getExecutedMigrations();
  const allMigrations = await getAllMigrations();
  const pendingMigrations = allMigrations.filter(
    (migration) => !executedMigrations.includes(migration),
  );

  if (pendingMigrations.length === 0) {
    logger.info('No pending migration.');
    return;
  }

  for (const migration of pendingMigrations) {
    await runMigration(migration);
  }

  logger.info('All migrations completed.');
};

migrate()
  .catch((error) => {
    logger.error({ error }, 'Migrations failed.');
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
