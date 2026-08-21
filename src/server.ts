import http from 'http';
import app from './app';
import config from './configs/env';
import logger from './configs/logger';
import { testDBConnection } from './db/pool';
import { disconnectRedis } from './redis/client';

const server = http.createServer(app);

const startServer = async () => {
  try {
    await testDBConnection();

    server.listen(config.PORT, () => {
      logger.info(`Server started on port ${config.PORT}`);
    });
  } catch (error: any) {
    logger.error('Error starting the server.', error);
    await exitHandler();
  }
};

const exitHandler = async () => {
  await disconnectRedis();

  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = async (error: any) => {
  logger.error(error);
  await exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received');

  await disconnectRedis();

  if (server) {
    server.close();
  }
});

startServer();
