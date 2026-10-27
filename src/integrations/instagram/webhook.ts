import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Meta webhook handling for Instagram (Business Login setup, graph.instagram.com).
// Spec: developers.facebook.com/documentation/instagram-platform/webhooks

/** GET verification: returns the challenge to echo back, or null when the request is not valid. */
export const verifyWebhookChallenge = (
  query: Record<string, unknown>,
  expectedVerifyToken: string,
): string | null => {
  if (query['hub.mode'] !== 'subscribe') return null;
  const token = query['hub.verify_token'];
  if (typeof token !== 'string' || !safeEqual(token, expectedVerifyToken)) return null;
  const challenge = query['hub.challenge'];
  return typeof challenge === 'string' ? challenge : null;
};

const safeEqual = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
};

/**
 * Checks X-Hub-Signature-256 (sha256=<hex>) against the raw request body.
 * Must run on the exact bytes Meta sent, before any JSON parsing.
 */
export const verifyWebhookSignature = (
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean => {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(signatureHeader.slice('sha256='.length), expected);
};

export type InstagramAttachment = { type: string; url: string | null };

export type InboundKind = 'customer_message' | 'echo' | 'deleted' | 'unsupported' | 'ignored';

export type InstagramEvent = {
  kind: InboundKind;
  /** Our Instagram account (the page receiving or sending). */
  accountId: string;
  /** Customer IGSID. For echoes this is the recipient. */
  customerId: string;
  /** Message id (mid). The dedupe key. */
  messageId: string;
  text: string | null;
  attachments: InstagramAttachment[];
  timestampMs: number;
};

type RawMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    is_self?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
};

/** Parses a webhook body into normalized events. Unknown shapes are skipped, never thrown. */
export const parseInstagramWebhook = (body: unknown): InstagramEvent[] => {
  if (!body || typeof body !== 'object') return [];
  const payload = body as { object?: string; entry?: Array<{ id?: string; messaging?: RawMessaging[] }> };
  if (payload.object !== 'instagram' || !Array.isArray(payload.entry)) return [];

  const events: InstagramEvent[] = [];
  for (const entry of payload.entry) {
    const entryAccountId = entry.id ? String(entry.id) : '';
    for (const item of entry.messaging ?? []) {
      const message = item.message;
      if (!message?.mid) continue; // reads, postbacks, reactions: not handled in V1

      const senderId = item.sender?.id ? String(item.sender.id) : '';
      const recipientId = item.recipient?.id ? String(item.recipient.id) : '';
      const attachments: InstagramAttachment[] = (message.attachments ?? []).map((attachment) => ({
        type: attachment.type ?? 'unknown',
        url: attachment.payload?.url ?? null,
      }));

      let kind: InboundKind;
      let accountId = entryAccountId;
      let customerId = senderId;

      if (message.is_echo) {
        // Our own outgoing message (or one sent from the Instagram app by a human).
        kind = 'echo';
        accountId = senderId || entryAccountId;
        customerId = recipientId;
      } else if (message.is_deleted) {
        kind = 'deleted';
      } else if (message.is_unsupported) {
        kind = 'unsupported';
      } else if (message.is_self) {
        kind = 'ignored';
      } else {
        kind = 'customer_message';
        accountId = recipientId || entryAccountId;
      }

      events.push({
        kind,
        accountId,
        customerId,
        messageId: message.mid,
        text: typeof message.text === 'string' ? message.text : null,
        attachments,
        timestampMs: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      });
    }
  }
  return events;
};

/** Stable key for the whole delivery, used to log raw webhook payloads without storing duplicates. */
export const webhookBodyHash = (rawBody: Buffer): string =>
  createHash('sha256').update(rawBody).digest('hex');
