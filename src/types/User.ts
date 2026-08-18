export type UserRole = 'USER' | 'ADMIN';

export type UserRow = {
  id: string;
  email: string;
  password_hash?: string;
  google_id?: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
};
