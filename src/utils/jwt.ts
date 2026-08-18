import config from '../configs/env';
import type { UserRole } from '../types/User';
import jwt, { type SignOptions } from 'jsonwebtoken';

type TokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
};

export const signAccessToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: config.JWT_ACCESS_EXPIRATION_MINUTES,
  };

  return jwt.sign(payload, config.JWT_SECRET, options);
};
