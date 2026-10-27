import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute, type JudgementSummary } from './handoff-policy';
import { ONLINE_SHOP_INTENTS } from './intents';

const base = (overrides: Partial<JudgementSummary> = {}): JudgementSummary => ({
  intentProbabilities: { product_price: 0.9, shipping_info: 0.05, complaint: 0.05 },
  topIntent: 'product_price',
  needsHumanProbability: 0.05,
  angryProbability: 0.05,
  multiRequestProbability: 0.05,
  ...overrides,
});

test('answers a clear answerable intent', () => {
  const route = decideRoute(base(), ONLINE_SHOP_INTENTS);
  assert.equal(route.action, 'answer');
});

test('hands off handoff-class intents such as complaints', () => {
  const route = decideRoute(base({ topIntent: 'complaint' }), ONLINE_SHOP_INTENTS);
  assert.deepEqual(route, { action: 'handoff', reason: 'complaint' });
});

test('ignores spam without replying', () => {
  const route = decideRoute(base({ topIntent: 'spam' }), ONLINE_SHOP_INTENTS);
  assert.equal(route.action, 'ignore');
});

test('hands off when the customer needs a person, even for an answerable intent', () => {
  const route = decideRoute(base({ needsHumanProbability: 0.8 }), ONLINE_SHOP_INTENTS);
  assert.deepEqual(route, { action: 'handoff', reason: 'customer_needs_human' });
});

test('hands off when the customer is angry', () => {
  const route = decideRoute(base({ angryProbability: 0.6 }), ONLINE_SHOP_INTENTS);
  assert.deepEqual(route, { action: 'handoff', reason: 'customer_angry' });
});

test('hands off on low intent confidence', () => {
  const route = decideRoute(
    base({ intentProbabilities: { product_price: 0.4, shipping_info: 0.35 } }),
    ONLINE_SHOP_INTENTS,
  );
  assert.deepEqual(route, { action: 'handoff', reason: 'low_intent_confidence' });
});

test('answers a second intent for multi-request messages', () => {
  const route = decideRoute(
    base({
      intentProbabilities: { product_price: 0.7, shipping_info: 0.25, complaint: 0.05 },
      multiRequestProbability: 0.9,
    }),
    ONLINE_SHOP_INTENTS,
  );
  assert.equal(route.action, 'answer');
  if (route.action === 'answer') {
    assert.deepEqual(route.intents.map((i) => i.id), ['product_price', 'shipping_info']);
  }
});
