// Errors the pipeline uses to decide what happens next.

/** Another job is working on the same conversation. Retry shortly without spending an attempt. */
export class LockBusyError extends Error {
  constructor(readonly lockKey: string) {
    super(`conversation is busy: ${lockKey}`);
    this.name = 'LockBusyError';
  }
}

/** A failure that may succeed on retry (network, provider outage, DB hiccup). */
export class TransientError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransientError';
  }
}
