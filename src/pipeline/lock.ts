import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

// Serializes work per conversation so two messages from one customer are answered in order.

export type LockLease = { key: string; token: string };

export interface ConversationLock {
  acquire(key: string, ttlMs: number): Promise<LockLease | null>;
  release(lease: LockLease): Promise<void>;
}

const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export class RedisLock implements ConversationLock {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, ttlMs: number): Promise<LockLease | null> {
    const token = randomUUID();
    const result = await this.redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? { key, token } : null;
  }

  async release(lease: LockLease): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, `lock:${lease.key}`, lease.token);
  }
}

/** In-process lock for tests and single-process runs. */
export class MemoryLock implements ConversationLock {
  private readonly held = new Map<string, string>();

  async acquire(key: string): Promise<LockLease | null> {
    if (this.held.has(key)) return null;
    const token = randomUUID();
    this.held.set(key, token);
    return { key, token };
  }

  async release(lease: LockLease): Promise<void> {
    if (this.held.get(lease.key) === lease.token) this.held.delete(lease.key);
  }
}
