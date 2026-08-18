import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';
import bcrypt from 'bcryptjs';
import { signAccessToken } from '../utils/jwt';

const registerUser = async (email: string, password: string) => {
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already exists.');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.createUser(normalizedEmail, hashedPassword);

  return user;
};

const loginUser = async (email: string, password: string): Promise<string> => {
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findUserByEmail(normalizedEmail);

  if (!existingUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found.');
  }

  if (!existingUser.password_hash) {
    // todo: maybe user has logged in with google
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid Email or Password.');
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    existingUser.password_hash,
  );

  if (!isPasswordValid) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid Email or Password.');
  }

  const accessToken = await signAccessToken({
    userId: existingUser.id,
    email: existingUser.email,
    role: existingUser.role,
  });

  return accessToken;
};

const authService = {
  registerUser,
  loginUser,
};

export default authService;
