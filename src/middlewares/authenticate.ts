import type { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';
import { verifyAccessToken } from '../utils/jwt';

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const bearerToken = req.headers.authorization;

  if (!bearerToken || !bearerToken.startsWith('Bearer ')) {
    next(
      new ApiError(httpStatus.UNAUTHORIZED, 'Authorization header is missing.'),
    );
    return;
  }

  const accessToken = bearerToken.split(' ')[1];

  const payload = verifyAccessToken(accessToken);

  req.user = payload;

  next();
};
