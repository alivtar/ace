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

const tasksValidations = {
  createTask,
  updateTask,
};

export default tasksValidations;
