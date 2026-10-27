import { InstagramApiError, InstagramGraphClient } from '../integrations/instagram/graph.client';
import type { MediaFile, MessagingChannel, SendTarget } from '../pipeline/channel';

const MAX_MEDIA_BYTES = 25 * 1024 * 1024; // Meta's documented audio/video/file limit
const MEDIA_TIMEOUT_MS = 15_000;

export class InstagramChannel implements MessagingChannel {
  readonly platform = 'instagram';

  constructor(
    private readonly graph: InstagramGraphClient,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async sendText(target: SendTarget, text: string): Promise<{ messageId: string }> {
    const result = await this.graph.sendText({
      accountId: target.externalAccountId,
      accessToken: target.accessToken,
      recipientId: target.recipientId,
      text,
    });
    return { messageId: result.messageId };
  }

  async downloadMedia(url: string): Promise<MediaFile> {
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`media download failed with HTTP ${response.status}`);

    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_MEDIA_BYTES) throw new Error('media file is too large');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) throw new Error('media file is too large');

    return {
      buffer,
      mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  isWindowClosedError(error: unknown): boolean {
    return error instanceof InstagramApiError && error.outsideMessagingWindow;
  }

  isRejectedBeforeSend(error: unknown): boolean {
    return error instanceof InstagramApiError && error.status >= 400 && error.status < 500;
  }
}
