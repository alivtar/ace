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
  OPENAI_API_KEY?: string;
  OPENAI_TEXT_MODEL?: string;
  OPENAI_STT_MODEL: string;
  JEV_API_KEY?: string;
  JEV_BASE_URL: string;
  JEV_MODEL: string;
  JEV_TIMEOUT_MS: number;
  META_APP_SECRET?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  TOKEN_ENCRYPTION_KEY?: string;
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
    // AI providers. Optional at boot; each provider throws a clear error when used without its key.
    OPENAI_API_KEY: Joi.string().optional().description('OpenAI key for text generation and speech-to-text.'),
    OPENAI_TEXT_MODEL: Joi.string().optional().description('Model used to write replies and extract product fields.'),
    OPENAI_STT_MODEL: Joi.string().default('gpt-4o-transcribe').description('Speech-to-text model for voice notes.'),
    JEV_API_KEY: Joi.string().optional().description('TypeSafe Jev API key (judgement engine).'),
    JEV_BASE_URL: Joi.string().uri().default('https://api.typesafe.ai/v1/systemone'),
    JEV_MODEL: Joi.string().default('jev-latest'),
    JEV_TIMEOUT_MS: Joi.number().default(8000).description('Judgement calls slower than this are treated as unavailable, not as a negative answer.'),
    META_APP_SECRET: Joi.string().optional().description('Used to verify X-Hub-Signature-256 on Instagram webhooks.'),
    META_WEBHOOK_VERIFY_TOKEN: Joi.string().optional().description('Token echoed back during webhook subscription.'),
    TOKEN_ENCRYPTION_KEY: Joi.string().hex().length(64).optional().description('32-byte hex key for encrypting platform access tokens at rest.'),
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
  OPENAI_API_KEY: envVars.OPENAI_API_KEY,
  OPENAI_TEXT_MODEL: envVars.OPENAI_TEXT_MODEL,
  OPENAI_STT_MODEL: envVars.OPENAI_STT_MODEL,
  JEV_API_KEY: envVars.JEV_API_KEY,
  JEV_BASE_URL: envVars.JEV_BASE_URL,
  JEV_MODEL: envVars.JEV_MODEL,
  JEV_TIMEOUT_MS: envVars.JEV_TIMEOUT_MS,
  META_APP_SECRET: envVars.META_APP_SECRET,
  META_WEBHOOK_VERIFY_TOKEN: envVars.META_WEBHOOK_VERIFY_TOKEN,
  TOKEN_ENCRYPTION_KEY: envVars.TOKEN_ENCRYPTION_KEY,
} as const;

export default config;
