import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JudgementUnavailableError } from '../ai/judgement/types';
import type { InstagramEvent } from '../integrations/instagram/webhook';
import { createTestDatabase, TEST_DATABASE_URL, type TestDatabase } from '../test-support/db';
import { seedOrder, seedProduct, seedShop, type SeededShop } from '../test-support/seed';
import { FakeChannel, FakeJudgement, FakeSpeech, FakeWriter, RejectedError } from '../test-support/fakes';
import { MemoryLock } from './lock';
import { processInboundEvent, HANDOFF_NOTICE, type PipelineDeps, type ProcessAttempt } from './process-inbound';
import { PipelineStore } from './store';
import { usagePeriod } from '../domain/plans';

// These tests run the real processor against real Postgres (TEST_DATABASE_URL).
// Providers (Jev, OpenAI, Instagram) are fakes; their response shapes match the official docs.
const skip = TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL not set';
const FINAL: ProcessAttempt = { attempt: 5, maxAttempts: 5 };
const FIRST: ProcessAttempt = { attempt: 1, maxAttempts: 5 };

let db: TestDatabase;
let store: PipelineStore;
let shop: SeededShop;
let judgement: FakeJudgement;
let writer: FakeWriter;
let channel: FakeChannel;
let speech: FakeSpeech;
let deps: PipelineDeps;
let counter = 0;

before(async () => {
  if (skip) return;
  db = await createTestDatabase(TEST_DATABASE_URL!);
});

after(async () => {
  if (skip) return;
  await db.close();
});

beforeEach(async () => {
  if (skip) return;
  // Fresh shop per test, so each test sees only its own data.
  shop = await seedShop(db.pool);
  store = new PipelineStore(db.pool);
  judgement = new FakeJudgement({ intent: 'product_price' });
  writer = new FakeWriter();
  channel = new FakeChannel();
  speech = new FakeSpeech('');
  deps = {
    store,
    lock: new MemoryLock(),
    channel,
    judgement,
    writer,
    stt: speech,
    decryptToken: (value) => value,
    now: () => new Date(),
  };
});

const customerEvent = (text: string | null, overrides: Partial<InstagramEvent> = {}): InstagramEvent => ({
  kind: 'customer_message',
  accountId: shop?.accountId ?? 'PAGE_UNSET',
  customerId: 'CUST_1',
  messageId: `mid.in.${++counter}`,
  text,
  attachments: [],
  timestampMs: Date.now(),
  ...overrides,
});

const countOutbound = async (businessId: string) => {
  const { rows } = await db.pool.query(
    `SELECT count(*)::int AS n FROM messages WHERE business_id = $1 AND direction = 'out'`,
    [businessId],
  );
  return rows[0].n as number;
};

const openTasks = async (businessId: string, reason: string) => {
  const { rows } = await db.pool.query(
    `SELECT count(*)::int AS n FROM handoff_tasks WHERE business_id = $1 AND reason = $2 AND status = 'open'`,
    [businessId, reason],
  );
  return rows[0].n as number;
};

const conversationMode = async (businessId: string) => {
  const { rows } = await db.pool.query(`SELECT mode FROM conversations WHERE business_id = $1`, [businessId]);
  return rows[0].mode as string;
};

test('answers a product price question from database facts', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, {
    name: 'شلوار جین',
    aliases: ['shalvar jin'],
    variants: [{ attributes: { رنگ: 'مشکی', سایز: 'M' }, price: 250000, stock: 3 }],
  });
  writer.queueReplies('قیمت شلوار جین مشکی سایز M، ۲۵۰٬۰۰۰ تومان است و موجود است.');

  const result = await processInboundEvent(customerEvent('سلام، شلوار جین مشکی سایز M چنده؟'), FIRST, deps);

  assert.deepEqual(result, { outcome: 'replied' });
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].target.recipientId, 'CUST_1');
  assert.equal(channel.sent[0].target.accessToken, 'token-abc');
  assert.deepEqual(writer.lastFacts().product, {
    name: 'شلوار جین',
    variants: [{ attributes: { رنگ: 'مشکی', سایز: 'M' }, price_toman: 250000, price_text: '۲۵۰٬۰۰۰ تومان', in_stock: true }],
  });
  assert.equal(await conversationMode(shop.businessId), 'ai');

  const { rows } = await db.pool.query(
    `SELECT direction, handled_by, meta->>'status' AS status, platform_message_id, intent
     FROM messages WHERE business_id = $1 ORDER BY created_at`,
    [shop.businessId],
  );
  assert.equal(rows[0].direction, 'in');
  assert.equal(rows[0].intent, 'product_price');
  assert.equal(rows[1].direction, 'out');
  assert.equal(rows[1].handled_by, 'bot');
  assert.equal(rows[1].status, 'sent');
  assert.equal(rows[1].platform_message_id, channel.sent[0].messageId);
});

test('a redelivered message is answered once', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'کیف چرم', variants: [{ attributes: {}, price: 350000, stock: 1 }] });
  const event = customerEvent('کیف چرم چنده؟');

  assert.deepEqual(await processInboundEvent(event, FIRST, deps), { outcome: 'replied' });
  assert.deepEqual(await processInboundEvent(event, FIRST, deps), { outcome: 'duplicate' });
  assert.equal(channel.sent.length, 1);
  assert.equal(judgement.calls.length, 1);
});

test('a complaint goes to a person with a notice, without asking the writer', { skip }, async () => {
  judgement.set({ intent: 'complaint' });

  const result = await processInboundEvent(customerEvent('سفارشم خراب رسید، خیلی ناراحتم!'), FIRST, deps);

  assert.deepEqual(result, { outcome: 'handoff', reason: 'complaint' });
  assert.equal(writer.calls.length, 0);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].text, HANDOFF_NOTICE);
  assert.equal(await conversationMode(shop.businessId), 'human');
  assert.equal(await openTasks(shop.businessId, 'complaint'), 1);
});

test('messages are gated while a person owns the conversation', { skip }, async () => {
  const conversation = await store.getOrCreateConversation(shop.businessId, 'instagram', 'CUST_1');
  await store.setMode(conversation.id, 'human');

  const result = await processInboundEvent(customerEvent('سلام، قیمت؟'), FIRST, deps);

  assert.deepEqual(result, { outcome: 'gated', reason: 'human_mode' });
  assert.equal(judgement.calls.length, 0);
  assert.equal(channel.sent.length, 0);
});

test('a reply that quotes an invented price is never sent', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'کیف چرم', variants: [{ attributes: {}, price: 350000, stock: 1 }] });
  writer.queueReplies('قیمتش ۱۹۰٬۰۰۰ تومان است.', 'قیمتش ۱۹۰٬۰۰۰ تومان است.');

  const result = await processInboundEvent(customerEvent('کیف چرم چنده؟'), FIRST, deps);

  assert.deepEqual(result, { outcome: 'handoff', reason: 'validation_failed' });
  assert.equal(writer.calls.length, 2, 'writer gets one retry with the validation problems');
  assert.ok(JSON.parse(writer.calls[1].input).previous_attempt_problems.length > 0);
  assert.deepEqual(channel.sent.map((sent) => sent.text), [HANDOFF_NOTICE]);
});

test('a judgement outage is retried before the last attempt, then goes to a person', { skip }, async () => {
  judgement.failWith = new JudgementUnavailableError('timeout');
  const event = customerEvent('سلام');

  await assert.rejects(processInboundEvent(event, FIRST, deps), JudgementUnavailableError);
  assert.equal(channel.sent.length, 0, 'nothing is sent on an unavailable judgement');

  const result = await processInboundEvent(event, FINAL, deps);
  assert.deepEqual(result, { outcome: 'handoff', reason: 'system_error' });
  assert.equal(await conversationMode(shop.businessId), 'human');
});

test('an echo we cannot place means a person replied in the Instagram app', { skip }, async () => {
  const echo: InstagramEvent = {
    kind: 'echo',
    accountId: shop.accountId,
    customerId: 'CUST_1',
    messageId: 'mid.human.1',
    text: 'سلام، بله موجوده',
    attachments: [],
    timestampMs: Date.now(),
  };

  await assert.rejects(processInboundEvent(echo, FIRST, deps));
  assert.deepEqual(await processInboundEvent(echo, FINAL, deps), { outcome: 'human_takeover' });
  assert.equal(await conversationMode(shop.businessId), 'human');
  const { rows } = await db.pool.query(
    `SELECT handled_by FROM messages WHERE platform_message_id = 'mid.human.1'`,
  );
  assert.equal(rows[0].handled_by, 'owner_app');
});

test('the echo of our own reply is recognised and does not hand off', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'کیف چرم', variants: [{ attributes: {}, price: 350000, stock: 1 }] });
  await processInboundEvent(customerEvent('کیف چرم چنده؟'), FIRST, deps);
  const ourEcho: InstagramEvent = {
    kind: 'echo',
    accountId: shop.accountId,
    customerId: 'CUST_1',
    messageId: channel.sent[0].messageId,
    text: channel.sent[0].text,
    attachments: [],
    timestampMs: Date.now(),
  };

  assert.deepEqual(await processInboundEvent(ourEcho, FIRST, deps), { outcome: 'duplicate' });
  assert.equal(await conversationMode(shop.businessId), 'ai');
});

test('a send refused because the window is closed becomes a handoff', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'کیف چرم', variants: [{ attributes: {}, price: 350000, stock: 1 }] });
  channel.windowClosedOnSend = true;

  const result = await processInboundEvent(customerEvent('کیف چرم چنده؟'), FIRST, deps);

  assert.deepEqual(result, { outcome: 'handoff', reason: 'window_expired' });
  const { rows } = await db.pool.query(
    `SELECT meta->>'status' AS status FROM messages WHERE business_id = $1 AND direction = 'out'`,
    [shop.businessId],
  );
  assert.equal(rows[0].status, 'failed');
  assert.equal(await openTasks(shop.businessId, 'window_expired'), 1);
});

test('a send that timed out is never repeated: the retry hands off instead', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'کیف چرم', variants: [{ attributes: {}, price: 350000, stock: 1 }] });
  const event = customerEvent('کیف چرم چنده؟');
  channel.failNextSendWith = new Error('The operation was aborted due to timeout');

  await assert.rejects(processInboundEvent(event, FIRST, deps));
  // The first attempt may have reached Instagram, so the message is not re-sent on retry.
  const retry = await processInboundEvent(event, { attempt: 2, maxAttempts: 5 }, deps);

  assert.deepEqual(retry, { outcome: 'handoff', reason: 'send_outcome_unknown' });
  assert.equal(channel.sendAttempts, 1);
  assert.equal(channel.sent.length, 0);
  assert.equal(await openTasks(shop.businessId, 'send_outcome_unknown'), 1);
});

test('a send Instagram definitively rejected is safe to retry', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'کیف چرم', variants: [{ attributes: {}, price: 350000, stock: 1 }] });
  const event = customerEvent('کیف چرم چنده؟');
  channel.failNextSendWith = new RejectedError('(#100) Invalid parameter');

  await assert.rejects(processInboundEvent(event, FIRST, deps), RejectedError);
  const retry = await processInboundEvent(event, { attempt: 2, maxAttempts: 5 }, deps);

  assert.deepEqual(retry, { outcome: 'replied' });
  assert.equal(channel.sendAttempts, 2);
  assert.equal(channel.sent.length, 1);
});

test('a message older than the 24-hour window is never answered', { skip }, async () => {
  const old = Date.now() - 25 * 60 * 60 * 1000;
  const result = await processInboundEvent(customerEvent('سلام', { timestampMs: old }), FIRST, deps);

  assert.deepEqual(result, { outcome: 'handoff', reason: 'window_expired' });
  assert.equal(channel.sent.length, 0);
});

test('order status needs the order code and phone before anything is disclosed', { skip }, async () => {
  judgement.set({ intent: 'order_status' });
  await seedOrder(db.pool, shop.businessId, {
    code: '4567', phone: '09121234567', status: 'shipped', trackingCode: 'TRK99', carrier: 'پست', total: 500000,
  });

  writer.queueReplies('لطفاً کد سفارش و شماره موبایلی که با آن سفارش دادید را بفرستید.');
  await processInboundEvent(customerEvent('سفارشم کجاست؟'), FIRST, deps);
  assert.deepEqual(writer.lastFacts().order, { verification: 'needed', missing: ['order_code', 'phone'] });

  writer.queueReplies('سفارش شما ارسال شده است.');
  await processInboundEvent(customerEvent('کد 4567 شماره 09121234567'), FIRST, deps);
  assert.deepEqual(writer.lastFacts().order, {
    verification: 'verified',
    order_code: '4567',
    status: 'ارسال شده',
    tracking_code: 'TRK99',
    carrier: 'پست',
    total_text: '۵۰۰٬۰۰۰ تومان',
  });
});

test('a wrong order phone number is not disclosed and counts toward a handoff', { skip }, async () => {
  judgement.set({ intent: 'order_status' });
  await seedOrder(db.pool, shop.businessId, { code: '4567', phone: '09121234567', status: 'shipped', total: 1 });

  writer.queueReplies('اطلاعات مطابقت ندارد.');
  await processInboundEvent(customerEvent('کد 4567 شماره 09999999999'), FIRST, deps);
  assert.deepEqual(writer.lastFacts().order, { verification: 'failed' });
  assert.equal(JSON.stringify(writer.lastFacts()).includes('ارسال شده'), false);
});

test('quota exhaustion gates the bot and opens one task, not one per message', { skip }, async () => {
  const basic = await seedShop(db.pool, { plan: 'basic' });
  const period = usagePeriod(new Date());
  await db.pool.query(
    `INSERT INTO usage_counters (business_id, period, kind, count) VALUES ($1, $2, 'ai_reply', 300)`,
    [basic.businessId, period],
  );

  const event = (mid: string): InstagramEvent => ({
    kind: 'customer_message', accountId: basic.accountId, customerId: 'CUST_Q', messageId: mid,
    text: 'سلام', attachments: [], timestampMs: Date.now(),
  });
  assert.deepEqual(await processInboundEvent(event('mid.q.1'), FIRST, deps), { outcome: 'gated', reason: 'quota_exceeded' });
  assert.deepEqual(await processInboundEvent(event('mid.q.2'), FIRST, deps), { outcome: 'gated', reason: 'quota_exceeded' });
  assert.equal(judgement.calls.length, 0);
  assert.equal(channel.sent.length, 0);
  assert.equal(await openTasks(basic.businessId, 'quota_exceeded'), 1);
});

test('a voice note is transcribed with a Persian hint before judgement', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'شلوار جین', variants: [{ attributes: {}, price: 250000, stock: 2 }] });
  speech.calls.length = 0;
  const transcriptText = 'سلام قیمت شلوار جین چنده؟';
  const sttFake = new FakeSpeech(transcriptText);
  deps.stt = sttFake;
  writer.queueReplies('شلوار جین ۲۵۰٬۰۰۰ تومان است.');

  const event = customerEvent(null, {
    attachments: [{ type: 'audio', url: 'https://cdn.example/voice.mp4?sig=1' }],
  });
  assert.deepEqual(await processInboundEvent(event, FIRST, deps), { outcome: 'replied' });

  assert.equal(sttFake.calls.length, 1);
  assert.equal(sttFake.calls[0].languageHint, 'fa');
  assert.equal(judgement.calls[0].state && (judgement.calls[0].state as { latest_message: string }).latest_message, transcriptText);
  const { rows } = await db.pool.query(
    `SELECT content_type, transcript FROM messages WHERE business_id = $1 AND direction = 'in'`,
    [shop.businessId],
  );
  assert.equal(rows[0].content_type, 'audio');
  assert.equal(rows[0].transcript, transcriptText);
});

test('media other than audio goes to a person without judgement', { skip }, async () => {
  const result = await processInboundEvent(
    customerEvent(null, { attachments: [{ type: 'image', url: 'https://cdn.example/x.jpg' }] }),
    FIRST,
    deps,
  );
  assert.deepEqual(result, { outcome: 'handoff', reason: 'media_message' });
  assert.equal(judgement.calls.length, 0);
});

test('an ambiguous product name is resolved by a product-match judgement', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'شلوار جین مشکی', variants: [{ attributes: {}, price: 250000, stock: 1 }] });
  await seedProduct(db.pool, shop.businessId, { name: 'شلوار جین آبی', variants: [{ attributes: {}, price: 260000, stock: 1 }] });
  judgement.set({ pickProduct: (criteria) => Object.keys(criteria).find((key) => criteria[key].includes('آبی')) ?? 'none' });
  writer.queueReplies('شلوار جین آبی ۲۶۰٬۰۰۰ تومان است.');

  const result = await processInboundEvent(customerEvent('شلوار جین چنده؟'), FIRST, deps);

  assert.deepEqual(result, { outcome: 'replied' });
  assert.equal(writer.lastFacts().product && (writer.lastFacts().product as { name: string }).name, 'شلوار جین آبی');
  assert.equal(judgement.calls.length, 2, 'intent judgement, then product match');
  const productQuestion = judgement.calls[1].questions.product;
  assert.equal(productQuestion.type, 'choice');
  assert.ok('none' in (productQuestion.type === 'choice' ? productQuestion.criteria : {}));
});

test('a reply whose earlier send is in an unknown state is never sent again', { skip }, async () => {
  await seedProduct(db.pool, shop.businessId, { name: 'کیف چرم', variants: [{ attributes: {}, price: 350000, stock: 1 }] });
  const event = customerEvent('کیف چرم چنده؟');
  const conversation = await store.getOrCreateConversation(shop.businessId, 'instagram', 'CUST_1');
  // An earlier attempt wrote the outbound row, then died before the send was confirmed.
  await store.insertMessage({
    businessId: shop.businessId,
    conversationId: conversation.id,
    direction: 'out',
    text: 'کیف چرم ۳۵۰٬۰۰۰ تومان است.',
    handledBy: 'bot',
    meta: { status: 'sending', inMid: event.messageId, kind: 'reply', intent: 'product_price' },
  });

  const result = await processInboundEvent(event, FIRST, deps);

  assert.deepEqual(result, { outcome: 'handoff', reason: 'send_outcome_unknown' });
  assert.equal(channel.sent.length, 0);
});

test('a message for an unknown Instagram account is dropped', { skip }, async () => {
  const result = await processInboundEvent(customerEvent('سلام', { accountId: 'NOT_CONNECTED' }), FIRST, deps);
  assert.deepEqual(result, { outcome: 'no_tenant' });
  assert.equal(await countOutbound(shop.businessId), 0);
});

test('a shop with AI turned off receives no bot reply', { skip }, async () => {
  const off = await seedShop(db.pool, { aiEnabled: false });
  const result = await processInboundEvent(customerEvent('سلام', { accountId: off.accountId }), FIRST, deps);
  assert.deepEqual(result, { outcome: 'gated', reason: 'ai_disabled' });
  assert.equal(judgement.calls.length, 0);
  assert.equal(await countOutbound(off.businessId), 0);
});
