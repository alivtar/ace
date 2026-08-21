import { createClient } from 'redis';
import config from '../configs/env';
import logger from '../configs/logger';

const redisClient = createClient({ url: config.REDIS_URL });

redisClient.on('connect', () => {
  logger.info('Redis client connected.');
});

redisClient.on('ready', () => {
  logger.info('Redis client is ready.');
});

redisClient.on('error', (error) => {
  logger.error('Redis client faced error.', error);
});

redisClient.on('end', () => {
  logger.info('Redis client connection closed.');
});

export const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  const pong = await redisClient.ping();
  logger.info(`Redis ping response: ${pong}`);
};

export const disconnectRedis = async () => {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
};
