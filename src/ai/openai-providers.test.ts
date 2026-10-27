import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OpenAITextProvider } from './text/openai-text.provider';
import { OpenAITranscribeProvider, PERSIAN_TRANSCRIPTION_PROMPT } from './speech/openai-transcribe.provider';

// Runs the real OpenAI SDK against a local server that returns bodies shaped like the official API
// (Responses: developers.openai.com/api/reference/resources/responses; transcription: .../audio/subresources/transcriptions).
// The SDK reads OPENAI_BASE_URL, so no network is used.

type Captured = { method?: string; url?: string; contentType?: string; body: string };
let server: http.Server;
let captured: Captured | null = null;
let nextResponse: { status: number; body: unknown } = { status: 200, body: {} };
const previousBaseUrl = process.env.OPENAI_BASE_URL;

before(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      captured = {
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8'),
      };
      res.writeHead(nextResponse.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(nextResponse.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (previousBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = previousBaseUrl;
});

test('writer reads output_text from a Responses API body and sends the documented fields', async () => {
  nextResponse = {
    status: 200,
    body: {
      id: 'resp_1',
      object: 'response',
      created_at: 1760000000,
      status: 'completed',
      model: 'gpt-4.1-mini-2025-04-14',
      output: [
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'قیمت ۲۵۰٬۰۰۰ تومان است.', annotations: [] }],
        },
      ],
      usage: { input_tokens: 40, output_tokens: 12, total_tokens: 52 },
    },
  };
  const provider = new OpenAITextProvider({ apiKey: 'sk-test', model: 'gpt-4.1-mini' });

  const result = await provider.generate({ instructions: 'rules', input: '{"facts":{}}', maxOutputTokens: 400 });

  assert.equal(result.text, 'قیمت ۲۵۰٬۰۰۰ تومان است.');
  assert.equal(result.model, 'gpt-4.1-mini-2025-04-14');
  assert.equal(captured!.method, 'POST');
  assert.equal(captured!.url, '/v1/responses');
  const sent = JSON.parse(captured!.body);
  assert.equal(sent.model, 'gpt-4.1-mini');
  assert.equal(sent.instructions, 'rules');
  assert.equal(sent.input, '{"facts":{}}');
  assert.equal(sent.max_output_tokens, 400);
});

test('writer joins several output_text parts in order', async () => {
  nextResponse = {
    status: 200,
    body: {
      id: 'resp_2', object: 'response', created_at: 1, status: 'completed', model: 'm',
      output: [
        { type: 'reasoning', id: 'r', summary: [] },
        { type: 'message', id: 'msg', role: 'assistant', status: 'completed', content: [
          { type: 'output_text', text: 'سلام. ', annotations: [] },
          { type: 'output_text', text: 'موجود است.', annotations: [] },
        ] },
      ],
    },
  };
  const result = await new OpenAITextProvider({ apiKey: 'sk-test', model: 'gpt-4.1-mini' })
    .generate({ instructions: 'x', input: 'y', maxOutputTokens: 10 });
  assert.equal(result.text, 'سلام. موجود است.');
});

test('writer surfaces an HTTP error instead of returning empty text', async () => {
  nextResponse = { status: 500, body: { error: { message: 'boom', type: 'server_error' } } };
  await assert.rejects(
    new OpenAITextProvider({ apiKey: 'sk-test', model: 'gpt-4.1-mini' })
      .generate({ instructions: 'x', input: 'y', maxOutputTokens: 10 }),
  );
});

test('transcription sends the Persian prompt and model as multipart, and returns text', async () => {
  nextResponse = { status: 200, body: { text: 'سلام قیمت شلوار جین چنده؟' } };
  const provider = new OpenAITranscribeProvider({ apiKey: 'sk-test', model: 'gpt-4o-transcribe' });

  const result = await provider.transcribe({
    audio: Buffer.from('fake-audio-bytes'),
    filename: 'voice.mp4',
    mimeType: 'audio/mp4',
    languageHint: 'fa',
  });

  assert.equal(result.text, 'سلام قیمت شلوار جین چنده؟');
  assert.equal(result.model, 'gpt-4o-transcribe');
  assert.equal(captured!.url, '/v1/audio/transcriptions');
  assert.match(captured!.contentType!, /^multipart\/form-data/);
  assert.match(captured!.body, /name="model"\r\n\r\ngpt-4o-transcribe/);
  assert.match(captured!.body, /name="language"\r\n\r\nfa/);
  assert.match(captured!.body, /name="file"; filename="voice\.mp4"/);
  assert.ok(captured!.body.includes(PERSIAN_TRANSCRIPTION_PROMPT), 'Persian prompt is always sent');
});

test('providers refuse to run without their API key', async () => {
  await assert.rejects(
    new OpenAITextProvider({ model: 'gpt-4.1-mini' }).generate({ instructions: 'x', input: 'y', maxOutputTokens: 1 }),
    /OPENAI_API_KEY/,
  );
  await assert.rejects(
    new OpenAITranscribeProvider({ model: 'gpt-4o-transcribe' })
      .transcribe({ audio: Buffer.from('a'), filename: 'a.mp4', mimeType: 'audio/mp4' }),
    /OPENAI_API_KEY/,
  );
});
