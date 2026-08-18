import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import httpStatus from 'http-status';
import bcrypt from 'bcryptjs';

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

const authService = {
  registerUser,
};

export default authService;
