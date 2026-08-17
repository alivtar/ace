export type UserRow = {
  id: string;
  email: string;
  password_hash?: string;
  google_id?: string;
  role: 'USER' | 'ADMIN';
  created_at: Date;
  updated_at: Date;
};
