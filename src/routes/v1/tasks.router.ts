import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import tasksValidations from '../../validations/tasks.validations';
import validate from '../../middlewares/validate';
import tasksController from '../../controllers/tasks.controller';

const tasksRouter = Router();

tasksRouter.use(authenticate);

tasksRouter.post(
  '/',
  validate(tasksValidations.createTask),
  tasksController.createTask,
);

tasksRouter.get('/', tasksController.getTasks);

export default tasksRouter;
