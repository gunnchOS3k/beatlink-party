/**
 * Redis durable room backend — write-through local cache + Redis snapshots.
 * Requires REDIS_URL (see docker-compose.yml). Unit tests keep InMemoryRoomStore.
 */

import type { RoomSnapshot, RoomStore } from './types.js';

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
  quit(): Promise<unknown>;
}

const KEY_PREFIX = 'beatlink:room:';

export function roomRedisKey(code: string): string {
  return `${KEY_PREFIX}${code.toUpperCase()}`;
}

export class RedisRoomStore implements RoomStore {
  readonly backend = 'redis' as const;
  private cache = new Map<string, RoomSnapshot>();
  private pending = new Map<string, Promise<unknown>>();
  private redis: RedisLike;
  private defaultTtlSec: number;

  constructor(redis: RedisLike, options: { defaultTtlSec?: number } = {}) {
    this.redis = redis;
    this.defaultTtlSec = options.defaultTtlSec ?? 2 * 60 * 60;
  }

  has(code: string): boolean {
    return this.cache.has(code.toUpperCase());
  }

  get(code: string): RoomSnapshot | null {
    return this.cache.get(code.toUpperCase()) ?? null;
  }

  set(code: string, snapshot: RoomSnapshot): void {
    const key = code.toUpperCase();
    this.cache.set(key, snapshot);
    const ttl = Math.max(1, Math.ceil((snapshot.expiresAt - Date.now()) / 1000) || this.defaultTtlSec);
    const write = this.redis
      .set(roomRedisKey(key), JSON.stringify(snapshot), 'EX', ttl)
      .catch((err: unknown) => {
        console.error('[beatlink] redis room save failed', key, err);
      });
    this.pending.set(key, write);
  }

  delete(code: string): void {
    const key = code.toUpperCase();
    this.cache.delete(key);
    const write = this.redis.del(roomRedisKey(key)).catch((err: unknown) => {
      console.error('[beatlink] redis room delete failed', key, err);
    });
    this.pending.set(key, write);
  }

  *entries(): IterableIterator<[string, RoomSnapshot]> {
    yield* this.cache.entries();
  }

  async hydrate(): Promise<number> {
    const keys = await this.redis.keys(`${KEY_PREFIX}*`);
    let loaded = 0;
    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      try {
        const snapshot = JSON.parse(raw) as RoomSnapshot;
        if (!snapshot?.code) continue;
        if (Date.now() > snapshot.expiresAt) {
          await this.redis.del(key);
          continue;
        }
        this.cache.set(snapshot.code.toUpperCase(), snapshot);
        loaded += 1;
      } catch {
        // skip corrupt
      }
    }
    return loaded;
  }

  async flush(): Promise<void> {
    await Promise.all([...this.pending.values()]);
    this.pending.clear();
  }

  async close(): Promise<void> {
    await this.flush();
    await this.redis.quit();
  }
}

/** Create Redis client when REDIS_URL is set; returns null otherwise. */
export async function createRedisClientFromEnv(): Promise<RedisLike | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  const mod = (await import('ioredis')) as unknown as {
    default: new (url: string, opts?: object) => RedisLike & {
      connect(): Promise<void>;
      status: string;
      on(event: string, cb: (...args: unknown[]) => void): void;
      off(event: string, cb: (...args: unknown[]) => void): void;
    };
  };
  const client = new mod.default(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  await client.connect();
  if (client.status !== 'ready') {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        client.off('ready', onReady);
        client.off('error', onError);
      };
      client.on('ready', onReady);
      client.on('error', onError);
    });
  }
  return client;
}

/** In-process fake Redis for unit tests of the Redis adapter (no daemon). */
export class FakeRedis implements RedisLike {
  private data = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const row = this.data.get(key);
    if (!row) return null;
    if (row.expiresAt != null && Date.now() > row.expiresAt) {
      this.data.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<'OK'> {
    let expiresAt: number | undefined;
    for (let i = 0; i < args.length; i++) {
      if (String(args[i]).toUpperCase() === 'EX' && typeof args[i + 1] === 'number') {
        expiresAt = Date.now() + (args[i + 1] as number) * 1000;
      }
    }
    this.data.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace(/\*$/, '');
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }

  async quit(): Promise<'OK'> {
    this.data.clear();
    return 'OK';
  }
}
