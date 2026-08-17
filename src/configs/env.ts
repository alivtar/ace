import dotenv from 'dotenv';

dotenv.config();

function checkRequiredEnvVariable(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required env variable: ${key}`);
  }

  return value;
}

const config = {
  env: process.env.NODE_ENV,
  port: process.env.port ?? 5000,
  isProduction: process.env.NODE_ENV === 'production',
  DATABASE_URL: checkRequiredEnvVariable('DATABASE_URL'),
} as const;

export default config;
