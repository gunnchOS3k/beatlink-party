/**
 * Continuation VI — Redis durable rooms against a real Redis daemon (CI service).
 * Skips when REDIS_URL is unset unless BEATLINK_REDIS_CI=1 (then fails).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  RedisRoomStore,
  createRedisClientFromEnv,
  type RedisLike,
} from '../apps/server/src/rooms/store/index.js';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

const redisUrl = process.env.REDIS_URL?.trim();
const requireRedis = process.env.BEATLINK_REDIS_CI === '1';

describe('Continuation VI — real Redis durable rooms', () => {
  let redis: RedisLike | null = null;
  let store: RedisRoomStore | null = null;

  beforeAll(async () => {
    if (!redisUrl) {
      if (requireRedis) {
        throw new Error('BEATLINK_REDIS_CI=1 but REDIS_URL is unset');
      }
      return;
    }
    try {
      redis = await createRedisClientFromEnv();
    } catch (err) {
      if (requireRedis) {
        throw new Error(
          `failed to connect Redis for CI: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }
    if (!redis) {
      if (requireRedis) throw new Error('failed to connect Redis for CI');
      return;
    }
    store = new RedisRoomStore(redis, { defaultTtlSec: 120 });
  }, 30_000);

  afterAll(async () => {
    if (store) await store.close().catch(() => null);
    else if (redis) await redis.quit().catch(() => null);
  });

  const skipIfNoRedis = () => {
    if (!store || !redis) {
      if (requireRedis) throw new Error('Redis required');
      return true;
    }
    return false;
  };

  it('create / join / preserve across manager restart (hydrate)', async () => {
    if (skipIfNoRedis()) return;
    const a = new RoomManager(store!);
    const room = a.createRoom('redis-host');
    const joined = a.joinRoom(room.code, 'sock-p1', 'Ada');
    expect(joined).not.toBeNull();
    const audience = a.joinAudience(room.code, 'sock-a1', 'Crowd');
    expect(audience).not.toBeNull();
    await store!.flush();

    const store2 = new RedisRoomStore(redis!);
    const hydrated = await store2.hydrate();
    expect(hydrated).toBeGreaterThanOrEqual(1);
    const b = new RoomManager(store2);
    const restored = b.getRoom(room.code);
    expect(restored?.players.some((p) => p.name === 'Ada')).toBe(true);
    expect(restored?.audience.some((m) => m.name === 'Crowd')).toBe(true);
    expect(restored?.hostToken).toBe(room.hostToken);

    b.shutdownRoom(room.code, { hostToken: room.hostToken });
    await store2.flush();
    await store2.close();
  });

  it('TTL expiry + purge cleanup', async () => {
    if (skipIfNoRedis()) return;
    const manager = new RoomManager(store!);
    const room = manager.createRoom('ttl-host');
    const live = manager.getRoom(room.code)!;
    live.expiresAt = Date.now() - 1000;
    const purged = manager.purgeExpiredRooms(Date.now());
    expect(purged).toContain(room.code);
    await store!.flush();

    const store2 = new RedisRoomStore(redis!);
    await store2.hydrate();
    expect(store2.get(room.code)).toBeNull();
    await store2.close();
  });

  it('host migration + player/audience reconnect', async () => {
    if (skipIfNoRedis()) return;
    const manager = new RoomManager(store!);
    const room = manager.createRoom('sock-host');
    const p = manager.joinRoom(room.code, 'sock-p', 'HostPlayer');
    expect(p).not.toBeNull();
    const a = manager.joinAudience(room.code, 'sock-aud', 'Aud');
    expect(a).not.toBeNull();

    const migration = manager.migrateHostOnDisconnect('sock-host');
    expect(migration).not.toBeNull();
    expect(migration!.newHostPlayerId).toBe(p!.player.id);

    const rePlayer = manager.reconnectPlayer(
      room.code,
      p!.player.id,
      p!.playerToken,
      'sock-p-re',
    );
    expect(rePlayer).not.toBeNull();

    const reAud = manager.reconnectAudience(
      room.code,
      a!.audience.id,
      a!.audienceToken,
      'sock-a-re',
    );
    expect(reAud).not.toBeNull();

    await store!.flush();
    manager.shutdownRoom(room.code, { hostToken: room.hostToken });
    await store!.flush();
  });

  it('concurrent create/join + cleanup', async () => {
    if (skipIfNoRedis()) return;
    const manager = new RoomManager(store!);
    const created = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        Promise.resolve(manager.createRoom(`c-host-${i}`)),
      ),
    );
    await Promise.all(
      created.map((room, i) =>
        Promise.resolve(manager.joinRoom(room.code, `c-p-${i}`, `P${i}`)),
      ),
    );
    await store!.flush();

    for (const room of created) {
      expect(store!.get(room.code)?.players.length).toBeGreaterThanOrEqual(1);
      manager.shutdownRoom(room.code, { hostToken: room.hostToken });
    }
    await store!.flush();

    for (const room of created) {
      expect(store!.get(room.code)).toBeNull();
    }
  });

  it('no-Redis degraded path stays memory', async () => {
    const prev = process.env.REDIS_URL;
    const prevStore = process.env.BEATLINK_ROOM_STORE;
    delete process.env.REDIS_URL;
    process.env.BEATLINK_ROOM_STORE = 'memory';
    const { createRoomStoreFromEnv } = await import('../apps/server/src/rooms/store/index.js');
    const result = await createRoomStoreFromEnv();
    expect(result.backend).toBe('memory');
    if (prev !== undefined) process.env.REDIS_URL = prev;
    else delete process.env.REDIS_URL;
    if (prevStore !== undefined) process.env.BEATLINK_ROOM_STORE = prevStore;
    else delete process.env.BEATLINK_ROOM_STORE;
  });
});
