import { Router } from 'express';
import authController from '../../controllers/auth.controller';
import authValidations from '../../validations/auth.validations';
import validate from '../../middlewares/validate';
import { authenticate } from '../../middlewares/authenticate';

const authRouter = Router();

authRouter.post(
  '/register',
  validate(authValidations.register),
  authController.register,
);

authRouter.post(
  '/login',
  validate(authValidations.login),
  authController.login,
);

// todo: test route
authRouter.get('/me', authenticate, authController.me);

export default authRouter;
