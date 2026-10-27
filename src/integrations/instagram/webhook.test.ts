import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseInstagramWebhook, verifyWebhookChallenge, verifyWebhookSignature } from './webhook';
import { InstagramApiError, InstagramGraphClient } from './graph.client';

const SECRET = 'app-secret';

test('answers the subscription challenge only with the right token', () => {
  const query = { 'hub.mode': 'subscribe', 'hub.verify_token': 'vt', 'hub.challenge': '1158201444' };
  assert.equal(verifyWebhookChallenge(query, 'vt'), '1158201444');
  assert.equal(verifyWebhookChallenge(query, 'wrong'), null);
  assert.equal(verifyWebhookChallenge({ ...query, 'hub.mode': 'unsubscribe' }, 'vt'), null);
});

test('verifies the HMAC signature over the raw body', () => {
  const body = Buffer.from('{"object":"instagram"}');
  const header = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
  assert.equal(verifyWebhookSignature(body, header, SECRET), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{"object":"x"}'), header, SECRET), false);
  assert.equal(verifyWebhookSignature(body, undefined, SECRET), false);
  assert.equal(verifyWebhookSignature(body, 'sha1=abc', SECRET), false);
});

test('parses a customer DM with our account as recipient', () => {
  const events = parseInstagramWebhook({
    object: 'instagram',
    entry: [{
      id: 'PAGE_IG',
      time: 1,
      messaging: [{
        sender: { id: 'CUSTOMER' },
        recipient: { id: 'PAGE_IG' },
        timestamp: 1700000000000,
        message: { mid: 'm1', text: 'سلام' },
      }],
    }],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'customer_message');
  assert.equal(events[0].accountId, 'PAGE_IG');
  assert.equal(events[0].customerId, 'CUSTOMER');
  assert.equal(events[0].text, 'سلام');
});

test('treats echoes as human/bot outbound with the customer as recipient', () => {
  const [event] = parseInstagramWebhook({
    object: 'instagram',
    entry: [{ id: 'PAGE_IG', messaging: [{
      sender: { id: 'PAGE_IG' }, recipient: { id: 'CUSTOMER' }, timestamp: 1,
      message: { mid: 'echo1', text: 'hi', is_echo: true },
    }] }],
  });
  assert.equal(event.kind, 'echo');
  assert.equal(event.customerId, 'CUSTOMER');
  assert.equal(event.accountId, 'PAGE_IG');
});

test('captures audio attachments and skips non-message events', () => {
  const events = parseInstagramWebhook({
    object: 'instagram',
    entry: [{ id: 'PAGE_IG', messaging: [
      { sender: { id: 'C' }, recipient: { id: 'PAGE_IG' }, timestamp: 1,
        message: { mid: 'a1', attachments: [{ type: 'audio', payload: { url: 'https://cdn/x.mp4' } }] } },
      { sender: { id: 'C' }, recipient: { id: 'PAGE_IG' }, timestamp: 2, read: { mid: 'r' } },
    ] }],
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].attachments, [{ type: 'audio', url: 'https://cdn/x.mp4' }]);
});

test('ignores payloads that are not from Instagram', () => {
  assert.deepEqual(parseInstagramWebhook({ object: 'page', entry: [] }), []);
  assert.deepEqual(parseInstagramWebhook(null), []);
});

test('graph client sends text and maps the outside-window error', async () => {
  const sent: unknown[] = [];
  const ok = new InstagramGraphClient({
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), 'https://graph.instagram.com/v26.0/PAGE_IG/messages');
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ recipient_id: 'C', message_id: 'mid.1' }));
    }) as typeof fetch,
  });
  const result = await ok.sendText({ accountId: 'PAGE_IG', accessToken: 't', recipientId: 'C', text: 'سلام' });
  assert.deepEqual(result, { recipientId: 'C', messageId: 'mid.1' });
  assert.deepEqual(sent[0], { recipient: { id: 'C' }, message: { text: 'سلام' } });

  const windowClosed = new InstagramGraphClient({
    fetchImpl: (async () => new Response(JSON.stringify({
      error: { message: 'outside window', code: 10, error_subcode: 2534022 },
    }), { status: 400 })) as typeof fetch,
  });
  await assert.rejects(
    windowClosed.sendText({ accountId: 'PAGE_IG', accessToken: 't', recipientId: 'C', text: 'x' }),
    (error: unknown) => error instanceof InstagramApiError && error.outsideMessagingWindow && !error.retryable,
  );
});

test('marks rate limits and server errors as retryable', async () => {
  const limited = new InstagramGraphClient({
    fetchImpl: (async () => new Response(JSON.stringify({ error: { message: 'limit', code: 4 } }), { status: 429 })) as typeof fetch,
  });
  await assert.rejects(
    limited.sendText({ accountId: 'A', accessToken: 't', recipientId: 'C', text: 'x' }),
    (error: unknown) => error instanceof InstagramApiError && error.retryable,
  );
});
