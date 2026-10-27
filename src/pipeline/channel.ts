// Platform-neutral messaging contract. Each platform (Instagram now; Bale, Rubika later)
// provides one implementation. Platform error details are translated here, so the
// pipeline never checks platform-specific error codes.

export type SendTarget = {
  externalAccountId: string;
  accessToken: string;
  recipientId: string;
};

export type MediaFile = { buffer: Buffer; mimeType: string };

export interface MessagingChannel {
  readonly platform: string;
  sendText(target: SendTarget, text: string): Promise<{ messageId: string }>;
  /** Downloads a media URL right away. Platform media URLs expire quickly. */
  downloadMedia(url: string): Promise<MediaFile>;
  /** True when the platform refused the send because the messaging window is closed. */
  isWindowClosedError(error: unknown): boolean;
  /**
   * True only when the platform definitively rejected the request, so the message was not sent.
   * Timeouts, network errors, and 5xx responses are not definitive: the message may have gone out.
   */
  isRejectedBeforeSend(error: unknown): boolean;
}
