import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import { createInboundQueue, createInboundWorker, enqueueInstagramEvent, INSTAGRAM_INBOUND_QUEUE, jobIdFor } from './instagram-inbound';
import { createTestDatabase, TEST_DATABASE_URL, TEST_REDIS_URL, type TestDatabase } from '../test-support/db';
import { seedProduct, seedShop } from '../test-support/seed';
import { FakeChannel, FakeJudgement, FakeSpeech, FakeWriter } from '../test-support/fakes';
import { MemoryLock } from '../pipeline/lock';
import { PipelineStore } from '../pipeline/store';
import type { PipelineDeps } from '../pipeline/process-inbound';
import type { InstagramEvent } from '../integrations/instagram/webhook';

// End to end: enqueue -> BullMQ on real Redis -> worker -> pipeline -> real Postgres.
const skip = TEST_DATABASE_URL && TEST_REDIS_URL ? false : 'TEST_DATABASE_URL and TEST_REDIS_URL not set';

let db: TestDatabase;
let redis: Redis;

before(async () => {
  if (skip) return;
  db = await createTestDatabase(TEST_DATABASE_URL!);
  redis = new Redis(TEST_REDIS_URL!, { maxRetriesPerRequest: null });
});

after(async () => {
  if (skip) return;
  redis.disconnect();
  await db.close();
});

test('a queued DM is answered by the worker and stored once', { skip }, async () => {
  const shop = await seedShop(db.pool);
  await seedProduct(db.pool, shop.businessId, { name: 'کیف چرم', variants: [{ attributes: {}, price: 350000, stock: 2 }] });

  const channel = new FakeChannel();
  const writer = new FakeWriter();
  writer.queueReplies('کیف چرم ۳۵۰٬۰۰۰ تومان است.');
  const deps: PipelineDeps = {
    store: new PipelineStore(db.pool),
    lock: new MemoryLock(),
    channel,
    judgement: new FakeJudgement({ intent: 'product_price' }),
    writer,
    stt: new FakeSpeech(''),
    decryptToken: (value) => value,
    now: () => new Date(),
  };

  const queue = createInboundQueue(redis);
  await queue.obliterate({ force: true });
  const worker = createInboundWorker(redis, () => deps, 2);
  const done = new Promise<unknown>((resolve, reject) => {
    worker.on('completed', (_job, result) => resolve(result));
    worker.on('failed', (_job, error) => reject(error));
  });

  const event: InstagramEvent = {
    kind: 'customer_message',
    accountId: shop.accountId,
    customerId: 'CUST_E2E',
    messageId: `mid.e2e.${Date.now()}`,
    text: 'کیف چرم چنده؟',
    attachments: [],
    timestampMs: Date.now(),
  };

  await enqueueInstagramEvent(queue, event);
  // The same delivery enqueued again must not create a second job.
  await enqueueInstagramEvent(queue, event);
  assert.equal(await queue.getJobCountByTypes('waiting', 'active', 'delayed'), 1);

  assert.deepEqual(await done, { outcome: 'replied' });
  assert.equal(channel.sent.length, 1);

  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();

  const { rows } = await db.pool.query(
    `SELECT count(*)::int AS n FROM messages WHERE business_id = $1 AND direction = 'out'`,
    [shop.businessId],
  );
  assert.equal(rows[0].n, 1);
});

test('job ids are stable per platform message and per kind', { skip }, async () => {
  const base: InstagramEvent = {
    kind: 'customer_message', accountId: 'A', customerId: 'C', messageId: 'mid.x', text: 'hi', attachments: [], timestampMs: 1,
  };
  assert.equal(jobIdFor(base), jobIdFor({ ...base, text: 'changed text' }));
  assert.notEqual(jobIdFor(base), jobIdFor({ ...base, kind: 'echo' }));
  assert.ok(!jobIdFor(base).includes(':'), 'BullMQ forbids colons in custom job ids');
  assert.equal(INSTAGRAM_INBOUND_QUEUE, 'instagram-inbound');
});
