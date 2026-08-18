import config from '../configs/env';
import type { UserRole } from '../types/User';
import jwt, { type SignOptions } from 'jsonwebtoken';
import ApiError from './ApiError';
import httpStatus from 'http-status';

export type TokenPayload = {
  userId: string;
  email: string;
  role: UserRole;
};

export const signAccessToken = (payload: TokenPayload): string => {
  const options: SignOptions = {
    expiresIn: `${config.JWT_ACCESS_EXPIRATION_MINUTES}m`,
  };

  return jwt.sign(payload, config.JWT_SECRET, options);
};

export const verifyAccessToken = (accessToken: string) => {
  try {
    return jwt.verify(accessToken, config.JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Invalid or expired access token.',
    );
  }
};
