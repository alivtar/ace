import pino from 'pino';
import config from './env';

const logger = pino(
  !config.isProduction
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
      }
    : undefined,
);

export default logger;
