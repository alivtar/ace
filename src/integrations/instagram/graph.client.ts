// Instagram Graph API client for DMs (Instagram Login, graph.instagram.com).
// Spec: POST /<API_VERSION>/<IG_ACCOUNT_ID>/messages with body { recipient: { id }, message: { text } }.
// Response: { recipient_id, message_id }. Errors: { error: { message, type, code, error_subcode } }.

export const DEFAULT_GRAPH_VERSION = 'v26.0';
export const DEFAULT_GRAPH_BASE_URL = 'https://graph.instagram.com';

// Meta returns subcodes 2534022 and 2018278 for "outside the 24-hour standard messaging window".
// The docs and forum threads disagree on which applies, so both are checked.
const OUTSIDE_WINDOW_SUBCODES = new Set([2534022, 2018278]);

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
    readonly subcode: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'InstagramApiError';
  }

  get outsideMessagingWindow(): boolean {
    return this.code === 10 && this.subcode !== null && OUTSIDE_WINDOW_SUBCODES.has(this.subcode);
  }
}

export type GraphClientOptions = {
  baseUrl?: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type SendResult = { recipientId: string; messageId: string };

export class InstagramGraphClient {
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GraphClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_GRAPH_BASE_URL;
    this.apiVersion = options.apiVersion ?? DEFAULT_GRAPH_VERSION;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async sendText(input: { accountId: string; accessToken: string; recipientId: string; text: string }): Promise<SendResult> {
    const url = new URL(`/${this.apiVersion}/${encodeURIComponent(input.accountId)}/messages`, this.baseUrl);
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: input.recipientId },
        message: { text: input.text },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const body = (await response.json().catch(() => null)) as
      | { recipient_id?: string; message_id?: string; error?: { message?: string; code?: number; error_subcode?: number } }
      | null;

    if (!response.ok || body?.error) {
      const error = body?.error;
      throw new InstagramApiError(
        error?.message ?? `Instagram API responded with HTTP ${response.status}`,
        response.status,
        error?.code ?? null,
        error?.error_subcode ?? null,
        response.status >= 500 || response.status === 429 || error?.code === 4 || error?.code === 17,
      );
    }
    if (!body?.message_id) {
      throw new InstagramApiError('Instagram API returned no message_id', response.status, null, null, false);
    }
    return { recipientId: body.recipient_id ?? input.recipientId, messageId: body.message_id };
  }
}
