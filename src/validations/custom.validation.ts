import { type CustomHelpers } from 'joi';
import { MIN_PASSWORD_LENGTH } from '../constants/auth.constants';

const password = (value: string, helpers: CustomHelpers) => {
  if (value.length < MIN_PASSWORD_LENGTH) {
    return helpers.message({
      custom: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
    return helpers.message({
      custom: 'Password must contain at least 1 letter and 1 number',
    });
  }

  return value;
};

const customValidations = { password };

export default customValidations;
