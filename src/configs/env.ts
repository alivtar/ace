import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config();

type EnvVars = {
  NODE_ENV: 'production' | 'development' | 'test';
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_ACCESS_EXPIRATION_MINUTES: number;
  JWT_REFRESH_EXPIRATION_DAYS: number;
  REDIS_URL: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
};

const envVarsSchema = Joi.object<EnvVars>()
  .keys({
    NODE_ENV: Joi.string()
      .valid('production', 'development', 'test')
      .required(),
    PORT: Joi.number().default(5000),
    DATABASE_URL: Joi.string()
      .required()
      .description('PostgreSQL connection string.'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(30)
      .description('Minutes after which access tokens expire.'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description('Days after which refresh tokens expire.'),
    REDIS_URL: Joi.string().required().description('Redis connection URL'),
    CLOUDINARY_CLOUD_NAME: Joi.string().required(),
    CLOUDINARY_API_KEY: Joi.string().required(),
    CLOUDINARY_API_SECRET: Joi.string().required(),
    // JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
    //   .default(10)
    //   .description('Minutes after which reset password token expires.'),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: 'key' } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

const config = {
  env: envVars.NODE_ENV,
  PORT: envVars.PORT,
  IS_PRODUCTION: envVars.NODE_ENV === 'production',
  DATABASE_URL: envVars.DATABASE_URL,
  JWT_SECRET: envVars.JWT_SECRET,
  JWT_ACCESS_EXPIRATION_MINUTES: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
  JWT_REFRESH_EXPIRATION_DAYS: envVars.JWT_REFRESH_EXPIRATION_DAYS,
  REDIS_URL: envVars.REDIS_URL,
  CLOUDINARY_CLOUD_NAME: envVars.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: envVars.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: envVars.CLOUDINARY_API_SECRET,
} as const;

export default config;
