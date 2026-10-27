import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { InstagramEvent } from '../../integrations/instagram/webhook';
import { createInstagramWebhookRouter, type InstagramWebhookDeps } from './instagram.router';

const SECRET = 'app-secret';
const VERIFY = 'verify-me';

let server: http.Server;
let baseUrl: string;
let enqueued: InstagramEvent[] = [];
let recorded: string[] = [];
let failEnqueue = false;

before(async () => {
  const deps: InstagramWebhookDeps = {
    verifyToken: VERIFY,
    appSecret: SECRET,
    recordDelivery: async (key) => {
      recorded.push(key);
    },
    enqueue: async (event) => {
      if (failEnqueue) throw new Error('redis is down');
      enqueued.push(event);
    },
  };
  const app = express();
  app.use('/webhooks/instagram', createInstagramWebhookRouter(deps));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/instagram`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const signed = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

const dmPayload = (mid = 'mid.dm.1') =>
  JSON.stringify({
    object: 'instagram',
    entry: [{
      id: 'PAGE_IG',
      time: 1,
      messaging: [{
        sender: { id: 'CUSTOMER' },
        recipient: { id: 'PAGE_IG' },
        timestamp: 1700000000000,
        message: { mid, text: 'سلام، شلوار جین دارید؟' },
      }],
    }],
  });

const reset = () => {
  enqueued = [];
  recorded = [];
  failEnqueue = false;
};

test('answers Meta\'s subscription challenge with the right token', async () => {
  const response = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=1158201444`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '1158201444');
});

test('refuses the subscription challenge with the wrong token', async () => {
  const response = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`);
  assert.equal(response.status, 403);
});

test('rejects deliveries without a valid signature and queues nothing', async () => {
  reset();
  const body = dmPayload();
  const unsigned = await fetch(baseUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const wrong = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signed(body, 'other-secret') },
    body,
  });
  assert.equal(unsigned.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(enqueued.length, 0);
  assert.equal(recorded.length, 0);
});

test('a signed DM is recorded and queued, then acknowledged with 200', async () => {
  reset();
  const body = dmPayload('mid.dm.2');
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signed(body) },
    body,
  });

  assert.equal(response.status, 200);
  assert.equal(recorded.length, 1);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].kind, 'customer_message');
  assert.equal(enqueued[0].customerId, 'CUSTOMER');
  assert.equal(enqueued[0].messageId, 'mid.dm.2');
});

test('a failed enqueue answers 500 so Meta redelivers instead of losing the message', async () => {
  reset();
  failEnqueue = true;
  const body = dmPayload('mid.dm.3');
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signed(body) },
    body,
  });
  assert.equal(response.status, 500);
});

test('a signed body that is not JSON is rejected', async () => {
  reset();
  const body = '{not json';
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signed(body) },
    body,
  });
  assert.equal(response.status, 400);
});

test('payloads from other Meta products are acknowledged and ignored', async () => {
  reset();
  const body = JSON.stringify({ object: 'page', entry: [] });
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signed(body) },
    body,
  });
  assert.equal(response.status, 200);
  assert.equal(enqueued.length, 0);
});
