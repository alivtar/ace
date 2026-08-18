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

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const accessToken = await authService.loginUser(email, password);

  // todo: how to make all success/error responses all over the project have the same schema?
  res.status(200).json({
    success: true,
    data: {
      accessToken,
    },
  });
});

const authController = {
  register,
  login,
};

export default authController;
