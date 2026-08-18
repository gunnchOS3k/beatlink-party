import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, type Socket } from 'socket.io-client';
import { setupRealtime } from '../apps/server/src/realtime/socket.js';
import { roomManager } from '../apps/server/src/rooms/RoomManager.js';

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

function connect(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
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

describe('Socket.IO host + two players (in-process)', () => {
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

  it('create/join/code/roles/ready/song and reconnect after disconnect', async () => {
    httpServer = createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    setupRealtime(httpServer, '*');
    await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', () => resolve()));
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('bind failed');
    const url = `http://127.0.0.1:${addr.port}`;

    const host = await connect(url);
    sockets.push(host);
    const created = await emitAck<{ code: string; hostToken?: string }>(host, 'room.create', {});
    expect(created.code).toMatch(/^[A-Z0-9]{5}$/);

    const p1 = await connect(url);
    sockets.push(p1);
    const joined1 = await emitAck<{
      ok: boolean;
      player?: { id: string };
      playerToken?: string;
    }>(p1, 'room.join', { code: created.code, name: 'P1' });
    expect(joined1.ok).toBe(true);

    const p2 = await connect(url);
    sockets.push(p2);
    const joined2 = await emitAck<{ ok: boolean; player?: { id: string } }>(p2, 'room.join', {
      code: created.code,
      name: 'P2',
    });
    expect(joined2.ok).toBe(true);
    expect(roomManager.getRoom(created.code)?.players).toHaveLength(2);

    p1.emit('room.set_role', {
      code: created.code,
      playerId: joined1.player!.id,
      role: 'beat_tapper',
    });
    p1.emit('room.ready', { code: created.code, playerId: joined1.player!.id, ready: true });
    p2.emit('room.set_role', {
      code: created.code,
      playerId: joined2.player!.id,
      role: 'vocalist',
    });
    p2.emit('room.ready', { code: created.code, playerId: joined2.player!.id, ready: true });
    await new Promise((r) => setTimeout(r, 40));

    const room = roomManager.getRoom(created.code)!;
    expect(room.players.find((p) => p.id === joined1.player!.id)?.role).toBe('beat_tapper');
    expect(room.players.find((p) => p.id === joined2.player!.id)?.ready).toBe(true);

    host.emit('room.select_song', {
      code: created.code,
      hostToken: created.hostToken,
      songId: 'demo-neon-groove',
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(roomManager.getRoom(created.code)?.selectedSongId).toBe('demo-neon-groove');

    p1.disconnect();
    await new Promise((r) => setTimeout(r, 40));
    expect(roomManager.getRoom(created.code)?.players.find((p) => p.id === joined1.player!.id)?.connected).toBe(
      false,
    );

    const p1b = await connect(url);
    sockets.push(p1b);
    const re = await emitAck<{ ok: boolean; player?: { id: string } }>(p1b, 'room.join', {
      code: created.code,
      name: 'P1',
      playerId: joined1.player!.id,
      playerToken: joined1.playerToken,
    });
    expect(re.ok).toBe(true);
    expect(re.player?.id).toBe(joined1.player!.id);
    expect(roomManager.getRoom(created.code)?.players.find((p) => p.id === joined1.player!.id)?.connected).toBe(
      true,
    );
  }, 20_000);
});
