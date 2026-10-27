import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JevProvider, parseJevResponse } from './jev.provider';
import type { JudgementQuestion } from './types';
import { JudgementUnavailableError } from './types';

const questions: Record<string, JudgementQuestion> = {
  intent: {
    type: 'choice',
    instructions: 'Which intent is the customer expressing?',
    criteria: { product_price: 'asks price', product_stock: 'asks stock', none: 'none fits' },
  },
  severity: {
    type: 'score',
    instructions: 'How angry is the customer?',
    criteria: ['calm', 'annoyed', 'angry'],
  },
  needs_human: {
    type: 'noul',
    instructions: 'Does this need a person?',
    criteria: { true: 'yes', false: 'no' },
  },
};

const validBody = {
  model: 'jev-1.14.0',
  answers: {
    intent: {
      type: 'choice',
      choice: 'product_price',
      probabilities: { product_price: 0.9, product_stock: 0.05, none: 0.05 },
      confidence: 0.8,
    },
    severity: {
      type: 'score',
      score: 0.4,
      probabilities: { '0': 0.7, '1': 0.2, '2': 0.1 },
      legend: { '0': 'calm', '1': 'annoyed', '2': 'angry' },
      confidence: 0.6,
    },
    needs_human: { type: 'noul', noul: 0.1 },
  },
  usage: { input_tokens: 120, output_tokens: 0 },
};

test('parses a valid response into typed answers', () => {
  const result = parseJevResponse(validBody, questions);
  assert.equal(result.model, 'jev-1.14.0');
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 0 });
  assert.equal((result.answers.intent as { choice: string }).choice, 'product_price');
  assert.equal((result.answers.needs_human as { noul: number }).noul, 0.1);
});

test('rejects a choice that was not offered', () => {
  const body = structuredClone(validBody);
  body.answers.intent.choice = 'refund_now';
  assert.throws(() => parseJevResponse(body, questions), JudgementUnavailableError);
});

test('rejects probabilities that do not sum to 1', () => {
  const body = structuredClone(validBody);
  body.answers.intent.probabilities.product_price = 0.4;
  assert.throws(() => parseJevResponse(body, questions), JudgementUnavailableError);
});

test('rejects a missing answer', () => {
  const body = structuredClone(validBody) as { answers: Record<string, unknown> };
  delete body.answers.needs_human;
  assert.throws(() => parseJevResponse(body, questions), JudgementUnavailableError);
});

test('rejects a noul value outside 0..1', () => {
  const body = structuredClone(validBody);
  body.answers.needs_human.noul = 1.5;
  assert.throws(() => parseJevResponse(body, questions), JudgementUnavailableError);
});

test('provider reports timeouts and HTTP errors as unavailable, not as a negative answer', async () => {
  const failing = new JevProvider({
    apiKey: 'k',
    baseUrl: 'https://example.invalid/v1/systemone',
    model: 'jev-latest',
    timeoutMs: 1000,
    fetchImpl: async () => new Response('busy', { status: 503 }),
  });
  await assert.rejects(
    failing.judge({ state: 'hi', questions }),
    JudgementUnavailableError,
  );

  const timingOut = new JevProvider({
    apiKey: 'k',
    baseUrl: 'https://example.invalid/v1/systemone',
    model: 'jev-latest',
    timeoutMs: 1000,
    fetchImpl: async () => {
      throw new Error('aborted');
    },
  });
  await assert.rejects(timingOut.judge({ state: 'hi', questions }), JudgementUnavailableError);
});

test('provider sends model, state and questions in the documented shape', async () => {
  let captured: { url: string; body: unknown; auth: string | null } | null = null;
  const provider = new JevProvider({
    apiKey: 'secret-key',
    baseUrl: 'https://example.invalid/v1/systemone',
    model: 'jev-latest',
    timeoutMs: 1000,
    fetchImpl: async (url, init) => {
      captured = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
        auth: new Headers(init?.headers).get('Authorization'),
      };
      return new Response(JSON.stringify(validBody), { status: 200 });
    },
  });

  await provider.judge({ state: { message: 'قیمت این شلوار چنده؟' }, questions });

  assert.ok(captured);
  const sent = captured as { url: string; body: { model: string; state: unknown; questions: unknown }; auth: string | null };
  assert.equal(sent.url, 'https://example.invalid/v1/systemone');
  assert.equal(sent.auth, 'Bearer secret-key');
  assert.equal(sent.body.model, 'jev-latest');
  assert.deepEqual(sent.body.state, { message: 'قیمت این شلوار چنده؟' });
  assert.deepEqual(Object.keys(sent.body.questions as object), ['intent', 'severity', 'needs_human']);
});
