import { Router } from 'express';
import authController from '../../controllers/auth.controller';

const authRouter = Router();

authRouter.post('/register', authController.register);

authRouter.get('/', (req, res, next) => {
  try {
    res.status(200).json({ msg: 'Hello Auth.' });
    return;
  } catch (error) {
    next(error);
  }
});

export default authRouter;
