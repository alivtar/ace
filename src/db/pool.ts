import { Pool } from 'pg';
import config from '../configs/env';
import logger from '../configs/logger';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

export const testDBConnection = async () => {
  const client = await pool.connect();

  try {
    await client.query('SELECT 1');
    logger.info('PostgreSQL connected successfully.');
  } finally {
    client.release();
  }
};

export default pool;
