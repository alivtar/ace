import config from './configs/env';
import logger from './configs/logger';
import { testDBConnection } from './db/pool';
import { createInboundWorker, createInboundQueue } from './queues/instagram-inbound';
import { buildPipelineDeps, getRedis } from './pipeline/container';

// Entry point for the message worker. Runs separately from the web server (npm run worker).
const start = async () => {
  await testDBConnection();

  // Built at startup so a missing key or provider config fails the boot, not the first job.
  const deps = buildPipelineDeps();
  const redis = getRedis();
  const queue = createInboundQueue(redis);
  const worker = createInboundWorker(redis, () => deps);

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error: error.message }, 'inbound job failed');
  });

  logger.info(`Instagram inbound worker started (NODE_ENV=${config.env})`);

  const shutdown = async () => {
    logger.info('Worker shutting down');
    await worker.close();
    await queue.close();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch((error) => {
  logger.error(error, 'worker failed to start');
  process.exit(1);
});
