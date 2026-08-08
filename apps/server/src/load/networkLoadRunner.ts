/**
 * Real Socket.IO network load — cross-process and in-process loopback.
 * Measures localhost join/influence RTT p50/p95/p99 for 8×25/50/100/300.
 */

import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  buildNetworkLoadReport,
  NETWORK_LOAD_DISCLAIMER,
  summarizeLatencies,
  type NetworkLoadReport,
  type NetworkLoadTierMetrics,
} from '@beatlink/game-engine';
import { EVENT_AUDIENCE_TIERS, MAX_PERFORMERS, type EventAudienceTier } from '@beatlink/shared';
import { setupRealtime } from '../realtime/socket.js';
import { roomManager as defaultRoomManager } from '../rooms/RoomManager.js';
function connectClient(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 10_000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('socket connect timeout'));
    }, 10_000);
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

function emitAck<T>(socket: Socket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), 15_000);
    if (payload === undefined) {
      socket.emit(event, (res: T) => {
        clearTimeout(timer);
        resolve(res);
      });
    } else {
      socket.emit(event, payload, (res: T) => {
        clearTimeout(timer);
        resolve(res);
      });
    }
  });
}

export async function runNetworkLoadAgainstServer(
  baseUrl: string,
  options: {
    performers?: number;
    tiers?: EventAudienceTier[];
    mode?: NetworkLoadReport['mode'];
  } = {},
): Promise<NetworkLoadReport> {
  const performers = options.performers ?? MAX_PERFORMERS;
  const tiers = options.tiers ?? [...EVENT_AUDIENCE_TIERS];
  const mode = options.mode ?? 'cross_process';
  const metrics: NetworkLoadTierMetrics[] = [];

  for (const tier of tiers) {
    const notes: string[] = [NETWORK_LOAD_DISCLAIMER];
    const t0 = Date.now();
    const sockets: Socket[] = [];
    const joinRtts: number[] = [];
    const influenceRtts: number[] = [];
    let ok = true;

    try {
      const host = await connectClient(baseUrl);
      sockets.push(host);
      const created = await emitAck<{ code: string; hostToken?: string }>(host, 'room.create', {
        capacityProfile: 'event_sim',
      });
      if (!created?.code) throw new Error('room.create failed');
      const code = created.code;

      let performersJoined = 0;
      for (let i = 0; i < performers; i++) {
        const sock = await connectClient(baseUrl);
        sockets.push(sock);
        const j0 = Date.now();
        const joined = await emitAck<{ ok: boolean }>(sock, 'room.join', {
          code,
          name: `P${i}`,
        });
        joinRtts.push(Date.now() - j0);
        if (joined?.ok) performersJoined += 1;
        else ok = false;
      }

      let audienceJoined = 0;
      const audience: Array<{ sock: Socket; id: string }> = [];
      for (let i = 0; i < tier; i++) {
        const sock = await connectClient(baseUrl);
        sockets.push(sock);
        const j0 = Date.now();
        const joined = await emitAck<{
          ok: boolean;
          audience?: { id: string };
        }>(sock, 'room.join_audience', { code, name: `A${i}` });
        joinRtts.push(Date.now() - j0);
        if (joined?.ok && joined.audience?.id) {
          audienceJoined += 1;
          audience.push({ sock, id: joined.audience.id });
        } else {
          ok = false;
        }
      }

      // Force playing so influence path can accept (optional — RTT measured either way).
      defaultRoomManager.forcePhase?.(code, 'playing');

      for (const a of audience.slice(0, Math.min(40, audience.length))) {
        const i0 = Date.now();
        await emitAck(a.sock, 'audience.influence', {
          code,
          audienceId: a.id,
          type: 'hype',
        }).catch(() => null);
        influenceRtts.push(Date.now() - i0);
      }

      if (performersJoined !== performers || audienceJoined !== tier) {
        ok = false;
        notes.push(
          `join_mismatch performers=${performersJoined}/${performers} audience=${audienceJoined}/${tier}`,
        );
      }
    } catch (err) {
      ok = false;
      notes.push(err instanceof Error ? err.message : String(err));
    } finally {
      for (const s of sockets) {
        try {
          s.close();
        } catch {
          // ignore
        }
      }
    }

    metrics.push({
      tier,
      performers,
      audience: tier,
      joinRttMs: summarizeLatencies(joinRtts),
      influenceRttMs: summarizeLatencies(influenceRtts),
      wallMs: Date.now() - t0,
      ok,
      notes,
    });
  }

  return buildNetworkLoadReport({ mode, baseUrl, performers, tiers, metrics });
}

/**
 * In-process HTTP+Socket.IO server on ephemeral port — still real WebSocket frames.
 * Uses a dedicated RoomManager so tests do not collide with the singleton.
 */
export async function runInProcessSocketNetworkLoad(
  options: {
    performers?: number;
    tiers?: EventAudienceTier[];
  } = {},
): Promise<NetworkLoadReport> {
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', harness: 'network-load' }));
  });
  setupRealtime(httpServer, '*');
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    httpServer.close();
    throw new Error('failed to bind ephemeral port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await runNetworkLoadAgainstServer(baseUrl, {
      performers: options.performers,
      tiers: options.tiers,
      mode: 'in_process_socket',
    });
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

/**
 * Cross-process load via `tsx` child (real separate Node process + WebSocket clients).
 */
export async function runCrossProcessNetworkLoad(options: {
  port?: number;
  performers?: number;
  tiers?: EventAudienceTier[];
  env?: Record<string, string>;
  readyTimeoutMs?: number;
}): Promise<NetworkLoadReport> {
  const port = options.port ?? 3200 + Math.floor(Math.random() * 400);
  const baseUrl = `http://127.0.0.1:${port}`;
  const { spawn } = await import('node:child_process');
  const serverEntry = resolve(process.cwd(), 'apps/server/src/index.ts');
  // Prefer `node --import tsx` (reliable under pnpm CI shims); fall back to tsx bin.
  const tsxBin = resolveTsxBin();
  const child = spawn(process.execPath, ['--import', 'tsx', serverEntry], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...options.env,
      PORT: String(port),
      BEATLINK_ROOM_STORE: options.env?.BEATLINK_ROOM_STORE ?? 'memory',
      CORS_ORIGIN: '*',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  void tsxBin;
  let stderrBuf = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });

  const readyTimeout = options.readyTimeoutMs ?? 45_000;
  const started = Date.now();
  let ready = false;
  while (Date.now() - started < readyTimeout) {
    if (child.exitCode != null) break;
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!ready) {
    child.kill('SIGTERM');
    return buildNetworkLoadReport({
      mode: 'cross_process',
      baseUrl,
      performers: options.performers,
      tiers: options.tiers,
      metrics: [
        {
          tier: (options.tiers?.[0] ?? 25) as EventAudienceTier,
          performers: options.performers ?? MAX_PERFORMERS,
          audience: options.tiers?.[0] ?? 25,
          joinRttMs: { p50: 0, p95: 0, p99: 0, samples: 0 },
          influenceRttMs: { p50: 0, p95: 0, p99: 0, samples: 0 },
          wallMs: Date.now() - started,
          ok: false,
          notes: [
            NETWORK_LOAD_DISCLAIMER,
            `child_not_ready exit=${child.exitCode} launcher=node --import tsx`,
            stderrBuf.slice(0, 800),
          ],
        },
      ],
    });
  }

  try {
    return await runNetworkLoadAgainstServer(baseUrl, {
      performers: options.performers,
      tiers: options.tiers,
      mode: 'cross_process',
    });
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    if (!child.killed) child.kill('SIGKILL');
  }
}
