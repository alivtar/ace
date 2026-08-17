import authService from '../services/auth.service';
import catchAsync from '../utils/catchAsync';
import httpStatus from 'http-status';

const register = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const user = await authService.registerUser(email, password);

  res.status(httpStatus.CREATED).json({
    success: true,
    user,
  });
});

const authController = {
  register,
};

export default authController;
