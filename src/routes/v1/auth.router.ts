import { Router } from 'express';
import authController from '../../controllers/auth.controller';
import authValidations from '../../validations/auth.validations';
import validate from '../../middlewares/validate';

const authRouter = Router();

authRouter.post(
  '/register',
  validate(authValidations.register),
  authController.register,
);

export default authRouter;
