import { createHash } from 'node:crypto';
import express from 'express';
import {
  parseInstagramWebhook,
  verifyWebhookChallenge,
  verifyWebhookSignature,
  type InstagramEvent,
} from '../../integrations/instagram/webhook';

export type InstagramWebhookDeps = {
  verifyToken: string | undefined;
  appSecret: string | undefined;
  /** Stores the raw delivery for audit. Failures propagate so Meta retries the delivery. */
  recordDelivery: (eventKey: string, payload: unknown) => Promise<void>;
  /** Queues one event for the pipeline. Must not do the work itself. */
  enqueue: (event: InstagramEvent) => Promise<void>;
};

/**
 * Meta's webhook endpoint. Verifies the request, records it, queues each event, and answers 200.
 * Deduplication happens in the pipeline (by platform message id), not here: the queue may
 * receive the same event twice, and that is safe.
 */
export const createInstagramWebhookRouter = (deps: InstagramWebhookDeps) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const challenge = verifyWebhookChallenge(req.query as Record<string, unknown>, deps.verifyToken ?? '');
    if (challenge === null || !deps.verifyToken) {
      res.sendStatus(403);
      return;
    }
    res.status(200).type('text/plain').send(challenge);
  });

  router.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!deps.appSecret) {
      res.sendStatus(500);
      return;
    }
    const rawBody = req.body as Buffer;
    if (!Buffer.isBuffer(rawBody) || !verifyWebhookSignature(rawBody, req.get('x-hub-signature-256'), deps.appSecret)) {
      res.sendStatus(401);
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.sendStatus(400);
      return;
    }

    const events = parseInstagramWebhook(body);
    try {
      const eventKey = createHash('sha256').update(rawBody).digest('hex');
      await deps.recordDelivery(eventKey, body);
      for (const event of events) {
        await deps.enqueue(event);
      }
    } catch {
      // Not acknowledged, so Meta redelivers. Nothing is lost.
      res.sendStatus(500);
      return;
    }
    res.sendStatus(200);
  });

  return router;
};
