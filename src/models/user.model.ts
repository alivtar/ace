import pool from '../db/pool';
import { type UserRow } from '../types/User';

const findUserByEmail = async (email: string) => {
  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email],
  );

  return result.rows[0];
};

const createUser = async (email: string, password: string) => {
  const result = await pool.query<Omit<UserRow, 'password_hash' | 'google_id'>>(
    `
            INSERT INTO users (email, password_hash)
            VALUES ($1, $2)
            RETURNING id, email, role, created_at, updated_at
        `,
    [email, password],
  );

  return result.rows[0];
};

const User = {
  findUserByEmail,
  createUser,
};

export default User;
