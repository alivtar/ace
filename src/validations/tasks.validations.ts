import Joi from 'joi';
import {
  DEFAULT_TASK_STATUS,
  TASK_STATUSES,
  TASK_TITLE_MIN_LENGTH,
} from '../constants/tasks.constants';

const createTask = {
  body: Joi.object().keys({
    title: Joi.string().required().max(TASK_TITLE_MIN_LENGTH),
    status: Joi.string()
      .valid(...TASK_STATUSES)
      .default(DEFAULT_TASK_STATUS),
  }),
};

const getTasks = {
  query: Joi.object({
    search: Joi.string().trim().max(150).optional(),
    status: Joi.string()
      .valid(...TASK_STATUSES)
      .optional(),
  }),
};

const updateTask = {
  body: Joi.object().keys({
    title: Joi.string().required().max(TASK_TITLE_MIN_LENGTH),
    status: Joi.string()
      .required()
      .valid(...TASK_STATUSES),
  }),
};

const partialUpdateTask = {
  body: Joi.object()
    .keys({
      title: Joi.string().max(TASK_TITLE_MIN_LENGTH),
      status: Joi.string().valid(...TASK_STATUSES),
    })
    .min(1),
};

const tasksValidations = {
  createTask,
  getTasks,
  updateTask,
  partialUpdateTask,
};

export default tasksValidations;
