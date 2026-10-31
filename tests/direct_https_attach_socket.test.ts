/**
 * Socket-level enforcement: host auth required; forged catalog denied;
 * failed evaluation cannot elevate scored attach.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, type Socket } from 'socket.io-client';
import { firstPartyOriginalRightsLayers } from '../packages/game-engine/src/index.js';
import { setupRealtime } from '../apps/server/src/realtime/socket.js';
import { roomManager } from '../apps/server/src/rooms/RoomManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launchWav = join(__dirname, '../content/songs/audio/launch-pd-tap-grid.wav');
const hash = createHash('sha256').update(readFileSync(launchWav)).digest('hex');
const layers = firstPartyOriginalRightsLayers();
const url = 'https://cdn.example.com/owned/launch-pd-tap-grid.wav';

function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), 8_000);
    const cb = (res: T) => {
      clearTimeout(timer);
      resolve(res);
    };
    if (payload === undefined) socket.emit(event, cb);
    else socket.emit(event, payload, cb);
  });
}

function connect(serverUrl: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 8_000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('connect timeout'));
    }, 8_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe('room.attach_direct_https socket enforcement', () => {
  let httpServer: ReturnType<typeof createServer> | null = null;
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const s of sockets) s.close();
    sockets.length = 0;
    await new Promise<void>((resolve) => {
      if (!httpServer) return resolve();
      httpServer.close(() => resolve());
    });
    httpServer = null;
  });

  async function boot() {
    httpServer = createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    setupRealtime(httpServer, '*');
    await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', () => resolve()));
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('bind failed');
    return `http://127.0.0.1:${addr.port}`;
  }

  it('NEGATIVE: missing host permission refuses attach', async () => {
    const base = await boot();
    const host = await connect(base);
    sockets.push(host);
    const created = await emitAck<{ code: string; hostToken?: string }>(host, 'room.create', {});

    const interloper = await connect(base);
    sockets.push(interloper);
    const denied = await emitAck<{ ok: boolean; error?: string; scoredPlayAllowed?: boolean }>(
      interloper,
      'room.attach_direct_https',
      {
        code: created.code,
        // wrong / missing host token
        attach: {
          url,
          contentSha256: hash,
          composition: layers.composition,
          soundRecording: layers.soundRecording,
          beatGridReady: true,
          chartsReady: true,
        },
      },
    );
    expect(denied.ok).toBe(false);
    expect(denied.error?.toLowerCase()).toMatch(/host/);
    expect(denied.scoredPlayAllowed).not.toBe(true);
    expect(roomManager.getRoom(created.code)?.selectedSongId).toBeNull();
  });

  it('NEGATIVE: forged catalog id is rejected even with host auth + syncEligible', async () => {
    const base = await boot();
    const host = await connect(base);
    sockets.push(host);
    const created = await emitAck<{ code: string; hostToken?: string }>(host, 'room.create', {});

    const forged = await emitAck<{
      ok: boolean;
      error?: string;
      scoredPlayAllowed?: boolean;
      message?: string;
    }>(host, 'room.attach_direct_https', {
      code: created.code,
      hostToken: created.hostToken,
      attach: {
        url,
        contentSha256: hash,
        composition: layers.composition,
        soundRecording: layers.soundRecording,
        beatGridReady: true,
        chartsReady: true,
        matchedCatalogId: 'demo-neon-groove',
      },
    });
    expect(forged.ok).toBe(false);
    expect(forged.scoredPlayAllowed).not.toBe(true);
    expect((forged.error ?? forged.message ?? '').toLowerCase()).toMatch(/forged|mismatch/);
    expect(roomManager.getRoom(created.code)?.selectedSongId).toBeNull();
  });

  it('NEGATIVE: playback-allowed syncEligible=false never selects scored beatmap via socket', async () => {
    const base = await boot();
    const host = await connect(base);
    sockets.push(host);
    const created = await emitAck<{ code: string; hostToken?: string }>(host, 'room.create', {});

    const denied = await emitAck<{
      ok: boolean;
      scoredPlayAllowed?: boolean;
      message?: string;
    }>(host, 'room.attach_direct_https', {
      code: created.code,
      hostToken: created.hostToken,
      attach: {
        url,
        contentSha256: hash,
        composition: {
          ...layers.composition,
          basis: 'creative_commons',
          syncAuthorized: false,
          adaptationAuthorized: false,
          attributionText: 'no sync',
        },
        soundRecording: {
          ...layers.soundRecording,
          reproductionAuthorized: true,
        },
        beatGridReady: true,
        chartsReady: true,
      },
    });
    // decision.ok may still be true (rights verified) — scored must stay false
    expect(denied.scoredPlayAllowed).toBe(false);
    expect(roomManager.getRoom(created.code)?.selectedSongId).toBeNull();
  });
});
