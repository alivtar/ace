import Joi from 'joi';
import customValidations from './custom.validation';

const register = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(customValidations.password),
  }),
};

const login = {
  body: Joi.object().keys({
    email: Joi.string().required().email(),
    password: Joi.string().required().custom(customValidations.password),
  }),
};

const authValidations = {
  register,
  login,
};

export default authValidations;
