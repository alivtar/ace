"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = __importDefault(require("node:path"));
const pool_1 = __importDefault(require("./pool"));
const logger_1 = __importDefault(require("../configs/logger"));
const promises_1 = __importDefault(require("fs/promises"));
const MIGRATION_FILES_DIR = node_path_1.default.join(process.cwd(), 'src', 'db', 'migrations');
const CREATE_MIGRATIONS_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`;
const getExecutedMigrations = async () => {
    const result = await pool_1.default.query(`
        SELECT name FROM migrations
        ORDER BY name
    `);
    const executedMigrations = result.rows.map((row) => row.name);
    return executedMigrations;
};
const getAllMigrations = async () => {
    const allFiles = await promises_1.default.readdir(MIGRATION_FILES_DIR);
    const allMigrationFiles = allFiles
        .filter((file) => file.endsWith('.sql'))
        .sort();
    return allMigrationFiles;
};
const runMigration = async (migrationFilename) => {
    const sql = await promises_1.default.readFile(node_path_1.default.join(MIGRATION_FILES_DIR, migrationFilename), 'utf-8');
    const client = await pool_1.default.connect();
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO migrations (name) VALUES ($1)`, [
            migrationFilename,
        ]);
        await client.query('COMMIT');
        logger_1.default.info(`Migration completed: ${migrationFilename}`);
    }
    catch (error) {
        await client.query('ROLLBACK');
        logger_1.default.error({
            error: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                ...(typeof error === 'object' && error !== null ? error : {}),
            },
        }, `Could not finish migration ${migrationFilename}`);
        throw error;
    }
    finally {
        client.release();
    }
};
const migrate = async () => {
    await pool_1.default.query(CREATE_MIGRATIONS_TABLE_SQL);
    const executedMigrations = await getExecutedMigrations();
    const allMigrations = await getAllMigrations();
    const pendingMigrations = allMigrations.filter((migration) => !executedMigrations.includes(migration));
    if (pendingMigrations.length === 0) {
        logger_1.default.info('No pending migration.');
        return;
    }
    for (const migration of pendingMigrations) {
        await runMigration(migration);
    }
    logger_1.default.info('All migrations completed.');
};
migrate()
    .catch((error) => {
    logger_1.default.error({ error }, 'Migrations failed.');
    process.exit(1);
})
    .finally(async () => {
    await pool_1.default.end();
});
