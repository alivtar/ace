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

tasksRouter.put(
  '/:taskId',
  validate(tasksValidations.updateTask),
  tasksController.updateTask,
);

tasksRouter.patch(
  '/:taskId',
  validate(tasksValidations.partialUpdateTask),
  tasksController.partialUpdateTask,
);

export default tasksRouter;
