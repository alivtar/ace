import { Pool } from 'pg';
import config from '../configs/env';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

export default pool;
