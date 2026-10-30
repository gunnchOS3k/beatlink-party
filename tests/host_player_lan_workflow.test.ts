import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, type Socket } from 'socket.io-client';
import { setupRealtime } from '../apps/server/src/realtime/socket.js';
import { roomManager } from '../apps/server/src/rooms/RoomManager.js';
import {
  PROPOSED_PARTY_TIMING_BUDGET,
  applyServerClockResync,
  assessPartyTiming,
} from '../packages/game-engine/src/partyTimingBudget.js';

/**
 * Host + player LAN-style workflow over real Socket.IO (loopback).
 * Honest: dual-socket / browser-tab equivalent — NOT a physical phone claim.
 */
function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), 10_000);
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

describe('host/player LAN workflow (socket dual-client — not physical phone)', () => {
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

  it(
    'create → join → calibrate → tick resync → rejoin seat (claimedPassed false)',
    async () => {
      expect(PROPOSED_PARTY_TIMING_BUDGET.claimedPassed).toBe(false);

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
      const hostToken = created.hostToken;

      const player = await connect(url);
      sockets.push(player);
      const joined = await emitAck<{
        ok: boolean;
        player?: { id: string };
        playerToken?: string;
      }>(player, 'room.join', { code: created.code, name: 'LanPhoneSim' });
      expect(joined.ok).toBe(true);
      const playerId = joined.player!.id;
      const playerToken = joined.playerToken;

      player.emit('room.set_role', {
        code: created.code,
        playerId,
        role: 'beat_tapper',
      });
      player.emit('room.ready', { code: created.code, playerId, ready: true });

      host.emit('room.select_song', {
        code: created.code,
        hostToken,
        songId: 'demo-neon-groove',
      });
      await new Promise((r) => setTimeout(r, 40));
      expect(roomManager.getRoom(created.code)?.selectedSongId).toBe('demo-neon-groove');

      const calibStart = await emitAck<{ ok: boolean; error?: string }>(
        host,
        'game.start_calibration',
        { code: created.code, hostToken },
      );
      expect(calibStart.ok).toBe(true);
      expect(roomManager.getRoom(created.code)?.phase).toBe('calibrating');

      const calibSubmit = await emitAck<{ ok: boolean }>(host, 'game.submit_calibration', {
        code: created.code,
        hostToken,
        offsetMs: 45,
      });
      expect(calibSubmit.ok).toBe(true);

      // Device calibration has no ack — fire and wait for room.state.
      player.emit('game.submit_player_device_calibration', {
        code: created.code,
        playerId,
        deviceId: 'sim-lan-phone-1',
        samples: [
          { expectedMs: 1000, tappedMs: 1040 },
          { expectedMs: 2000, tappedMs: 2035 },
          { expectedMs: 3000, tappedMs: 3045 },
          { expectedMs: 4000, tappedMs: 4030 },
        ],
      });
      await new Promise((r) => setTimeout(r, 50));

      const room = roomManager.getRoom(created.code);
      expect(room).toBeTruthy();
      expect(room!.players.some((p) => p.id === playerId)).toBe(true);

      // Tick resync path once playing.
      if (room && !room.gameStartTime) {
        room.phase = 'playing';
        room.gameStartTime = Date.now() - 5000;
      }

      const tick = await new Promise<{ gameTimeMs: number; calibratedMs?: number }>(
        (resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('tick timeout')), 5000);
          player.once('game.tick', (payload: { gameTimeMs: number; calibratedMs?: number }) => {
            clearTimeout(timer);
            resolve(payload);
          });
          player.emit('game.tick', { code: created.code });
        },
      );
      expect(tick.gameTimeMs).toBeGreaterThan(0);

      const staleClient = tick.gameTimeMs - 4000;
      const assessment = assessPartyTiming({
        scenario: 'background_resume',
        clientGameTimeMs: staleClient,
        serverGameTimeMs: tick.gameTimeMs,
        hiddenMs: 4000,
      });
      expect(assessment.requiresResync).toBe(true);
      expect(assessment.claimedPassed).toBe(false);
      const resynced = applyServerClockResync({ serverGameTimeMs: tick.gameTimeMs });
      expect(resynced.rawElapsedMs).toBe(tick.gameTimeMs);

      // Rejoin seat with persisted token (LAN phone refresh simulation)
      player.close();
      const rejoinSock = await connect(url);
      sockets.push(rejoinSock);
      const rejoin = await emitAck<{ ok: boolean }>(rejoinSock, 'room.join', {
        code: created.code,
        name: 'LanPhoneSim',
        playerId,
        playerToken,
      });
      expect(rejoin.ok).toBe(true);
      expect(roomManager.getRoom(created.code)?.players.some((p) => p.id === playerId)).toBe(true);

      expect(PROPOSED_PARTY_TIMING_BUDGET.claimedPassed).toBe(false);
    },
    20_000,
  );
});
