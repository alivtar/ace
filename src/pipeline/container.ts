import Redis from 'ioredis';
import config from '../configs/env';
import logger from '../configs/logger';
import pool from '../db/pool';
import { judgement, speechToText, textGeneration } from '../ai';
import { InstagramChannel } from '../channels/instagram.channel';
import { InstagramGraphClient } from '../integrations/instagram/graph.client';
import { createInboundQueue, enqueueInstagramEvent } from '../queues/instagram-inbound';
import type { InstagramWebhookDeps } from '../routes/webhooks/instagram.router';
import { decryptSecret } from '../utils/crypto';
import { PipelineStore } from './store';
import { RedisLock } from './lock';
import type { PipelineDeps } from './process-inbound';

// The only place where real providers, stores, and config are wired into the pipeline and webhook.

let sharedRedis: Redis | null = null;

/** One ioredis connection for locks and queues. BullMQ requires maxRetriesPerRequest = null. */
export const getRedis = (): Redis => {
  if (!sharedRedis) {
    sharedRedis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return sharedRedis;
};

let sharedQueue: ReturnType<typeof createInboundQueue> | null = null;
export const getInboundQueue = () => {
  if (!sharedQueue) sharedQueue = createInboundQueue(getRedis());
  return sharedQueue;
};

export const buildWebhookDeps = (): InstagramWebhookDeps => {
  const store = new PipelineStore(pool);
  return {
    verifyToken: config.META_WEBHOOK_VERIFY_TOKEN,
    appSecret: config.META_APP_SECRET,
    recordDelivery: (eventKey, payload) => store.recordWebhookEvent(eventKey, 'instagram', payload),
    enqueue: (event) => enqueueInstagramEvent(getInboundQueue(), event),
  };
};

let sharedPipelineDeps: PipelineDeps | null = null;

/** Built once per process and reused for every job. */
export const buildPipelineDeps = (): PipelineDeps => {
  if (sharedPipelineDeps) return sharedPipelineDeps;
  const key = config.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is not configured');

  sharedPipelineDeps = {
    store: new PipelineStore(pool),
    lock: new RedisLock(getRedis()),
    channel: new InstagramChannel(new InstagramGraphClient()),
    judgement,
    writer: textGeneration,
    stt: speechToText,
    decryptToken: (encrypted) => decryptSecret(encrypted, key),
    now: () => new Date(),
    log: (message, details) => logger.info(details ?? {}, message),
  };
  return sharedPipelineDeps;
};
