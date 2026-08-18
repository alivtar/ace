import pino from 'pino';
import config from './env';

const logger = pino(
  !config.IS_PRODUCTION
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
