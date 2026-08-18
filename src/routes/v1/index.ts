import { Router } from 'express';
import authRouter from './auth.router';
import tasksRouter from './tasks.router';

const router = Router();

router.use('/auth', authRouter);
router.use('/tasks', tasksRouter);

export default router;
