import Joi from 'joi';

const createTask = {
  body: Joi.object().keys({
    title: Joi.string().required().max(150),
    status: Joi.string()
      .valid('OPEN', 'IN_PROGRESS', 'RESOLVED')
      .default('OPEN'),
  }),
};

const updateTask = {
  body: Joi.object().keys({
    title: Joi.string().required().max(150),
    status: Joi.string().required().valid('OPEN', 'IN_PROGRESS', 'RESOLVED'),
  }),
};

const partialUpdateTask = {
  body: Joi.object()
    .keys({
      title: Joi.string().max(150),
      status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'RESOLVED'),
    })
    .min(1),
};

const tasksValidations = {
  createTask,
  updateTask,
  partialUpdateTask,
};

export default tasksValidations;
