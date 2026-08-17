import { MIN_PASSWORD_LENGTH } from '../constants/auth.constants';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';
import bcrypt from 'bcryptjs';

const registerUser = async (email: string, password: string) => {
  if (!email) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email is required.');
  }

  if (!password) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Password is required.');
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already exists.');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.createUser(normalizedEmail, hashedPassword);

  return user;
};

const authService = {
  registerUser,
};

export default authService;
