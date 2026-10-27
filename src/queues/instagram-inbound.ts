import { createHash } from 'node:crypto';
import { Queue, Worker, DelayedError, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { InstagramEvent } from '../integrations/instagram/webhook';
import { processInboundEvent, type PipelineDeps } from '../pipeline/process-inbound';
import { LockBusyError } from '../pipeline/errors';

export const INSTAGRAM_INBOUND_QUEUE = 'instagram-inbound';
const MAX_ATTEMPTS = 5;
const LOCK_BUSY_RETRY_MS = 1_500;

export type InboundJobData = { event: InstagramEvent; receivedAt: string };

/**
 * Deterministic job id per platform message. BullMQ then ignores a second add of the same
 * event while the first job is still kept, and the pipeline dedupes anyway.
 */
export const jobIdFor = (event: InstagramEvent): string =>
  `ig-${event.kind}-${createHash('sha256').update(event.messageId).digest('hex').slice(0, 40)}`;

export const createInboundQueue = (connection: Redis) =>
  new Queue<InboundJobData>(INSTAGRAM_INBOUND_QUEUE, { connection });

export const enqueueInstagramEvent = async (queue: Queue<InboundJobData>, event: InstagramEvent): Promise<void> => {
  await queue.add(
    'event',
    { event, receivedAt: new Date().toISOString() },
    {
      jobId: jobIdFor(event),
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 3_000 },
      removeOnComplete: { age: 24 * 3600, count: 5_000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  );
};

/** Runs the pipeline for queued events. Conversation locks are waited out without using up attempts. */
export const createInboundWorker = (connection: Redis, deps: () => PipelineDeps, concurrency = 10) =>
  new Worker<InboundJobData>(
    INSTAGRAM_INBOUND_QUEUE,
    async (job: Job<InboundJobData>, token?: string) => {
      try {
        return await processInboundEvent(
          job.data.event,
          { attempt: job.attemptsMade + 1, maxAttempts: job.opts.attempts ?? 1 },
          deps(),
        );
      } catch (error) {
        if (error instanceof LockBusyError && token) {
          await job.moveToDelayed(Date.now() + LOCK_BUSY_RETRY_MS, token);
          throw new DelayedError();
        }
        throw error;
      }
    },
    { connection, concurrency },
  );
