/**
 * Independent verifier GAME-RC-002 session — not the implementer test.
 * Challenges static-page multiplayer, JSON-only session, cheat unlocks, DRM rip.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { RoomManager, roomManager } from '../apps/server/src/rooms/RoomManager.js';
import { setupRealtime } from '../apps/server/src/realtime/socket.js';
import { getProviderAuthStatus } from '../apps/server/src/music/linkResolver.js';
import { resolveContentPath } from '../packages/game-engine/src/contentPaths.js';
import {
  AchievementRuntime,
  parseAchievementCatalog,
} from '../packages/game-engine/src/achievementRuntime.js';
import { GAME_MODE_IDS, type GameModeId } from '../packages/shared/src/types.js';

const ROOT = process.cwd();
const serverRequire = createRequire(resolve(ROOT, 'apps/server/package.json'));
const { io: ioClient } = serverRequire('socket.io-client') as typeof import('socket.io-client');
type Socket = import('socket.io-client').Socket;

const CATALOG_IDS = [
  'bl.first_party',
  'bl.beat_tap',
  'bl.call_and_response',
  'bl.karaoke',
  'bl.band_cooperation',
  'bl.prediction',
  'bl.audience',
  'bl.host_recovery',
  'bl.comeback',
  'bl.five_mode',
  'bl.pause_and_breathe',
  'bl.hidden_full_house',
];

function emitAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = 4000): Promise<T> {
  return new Promise((resolveAck, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), timeoutMs);
    socket.emit(event, payload, (res: T) => {
      clearTimeout(timer);
      resolveAck(res);
    });
  });
}

function connect(url: string): Promise<Socket> {
  return new Promise((resolveSock, reject) => {
    const socket = ioClient(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    socket.on('connect', () => resolveSock(socket));
    socket.on('connect_error', reject);
  });
}

function waitEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolveEv, reject) => {
    const timer = setTimeout(() => reject(new Error(`wait ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolveEv(payload);
    });
  });
}

describe('INDEPENDENT VERIFIER GAME-RC-002 Beat Link', () => {
  it('has no cheat unlock-by-id API and blocks rip URLs', () => {
    const proto = AchievementRuntime.prototype as unknown as Record<string, unknown>;
    expect(typeof proto.unlockById).toBe('undefined');
    expect(typeof proto.forceUnlock).toBe('undefined');
    expect(typeof proto.unlockAchievement).toBe('undefined');
    expect(AchievementRuntime.prototype.unlock.length).toBe(1);
    const catalog = parseAchievementCatalog(
      JSON.parse(readFileSync(resolve(ROOT, 'release/ACHIEVEMENTS.json'), 'utf8')),
    );
    expect(catalog.achievements).toHaveLength(12);
    for (const item of catalog.achievements) {
      expect(['test', 'debug', 'cheat', 'always']).not.toContain(item.unlock?.type);
    }
    const rip = resolveContentPath({ claimedRipUrl: 'https://youtube.com/watch?v=abc' });
    expect(rip.ok).toBe(false);
    expect(rip.path).toBe('blocked_rip_attempt');
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    expect(getProviderAuthStatus().authState).toBe('EXTERNAL_PENDING');
  });

  it('unlocks 12/12 from live RoomManager session (not catalog setFlag-only)', () => {
    const manager = new RoomManager();
    const created = manager.createRoom('iv-host');
    const code = created.code;
    const hostToken = created.hostToken;
    const alice = manager.joinRoom(code, 'p-a', 'Alice')!;
    const bob = manager.joinRoom(code, 'p-b', 'Bob')!;
    const aud = manager.joinAudience(code, 'aud-iv', 'Crowd')!;
    manager.setAudienceSandboxed(code, aud.audience.id, false);
    manager.setRole(code, alice.player.id, 'beat_tapper');
    manager.setRole(code, bob.player.id, 'vocalist');
    manager.setReady(code, alice.player.id, true);
    manager.setReady(code, bob.player.id, true);
    expect(manager.selectSong(code, 'launch-pd-tap-grid')).toBeTruthy();

    for (let i = 0; i < GAME_MODE_IDS.length; i++) {
      const mode = GAME_MODE_IDS[i]!;
      if (manager.getRoom(code)?.phase === 'results') manager.rematch(code);
      manager.setReady(code, alice.player.id, true);
      manager.setReady(code, bob.player.id, true);
      expect(manager.setGameMode(code, mode)).toBeTruthy();
      expect(manager.selectSong(code, 'demo-neon-groove')).toBeTruthy();
      expect(manager.startCalibration(code)).toBeTruthy();
      expect(manager.submitCalibration(code, 0)).toBeTruthy();
      expect(manager.startCountdown(code)).toBeTruthy();
      manager.tickCountdown(code);
      manager.tickCountdown(code);
      manager.tickCountdown(code);
      expect(manager.getRoom(code)?.phase).toBe('playing');
      expect(manager.pauseSession(code, 'iv-host', hostToken)?.phase).toBe('paused');
      expect(manager.resumeSession(code, 'iv-host', hostToken)?.phase).toBe('playing');
      if (i < GAME_MODE_IDS.length - 1) manager.endGame(code);
    }

    const crowd = manager.processAudienceInfluence(code, aud.audience.id, 'hype');
    expect(crowd?.event.accepted).toBe(true);

    manager.leaveRoom('p-a');
    manager.reconnectPlayer(code, alice.player.id, alice.playerToken, 'p-a-2');
    const migrated = manager.migrateHostOnDisconnect('iv-host');
    expect(migrated?.newHostPlayerId).toBeTruthy();

    const internal = manager.getRoom(code)!;
    internal.players[0]!.score = 10;
    internal.players[1]!.score = 400;
    manager.processInput(code, {
      playerId: alice.player.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: 'iv-note',
    });
    internal.players[0]!.score = 900;
    const results = manager.endGame(code);
    expect(results?.awards.length).toBeGreaterThan(0);

    const rt = manager.getAchievements();
    const missing = CATALOG_IDS.filter((id) => !rt.isUnlocked(id));
    // eslint-disable-next-line no-console
    console.log(
      'INDEPENDENT_BEATLINK_ROOMMANAGER_EVIDENCE',
      JSON.stringify({
        unlockedCount: rt.unlockedCount(),
        missing,
        awards: results?.awards.length,
        rematch: manager.rematch(code)?.phase,
      }),
    );
    expect(missing, `missing ${missing.join(',')}`).toEqual([]);
    expect(rt.unlockedCount()).toBe(12);
    expect(manager.shutdownRoom(code, { hostToken: migrated?.hostToken ?? hostToken })?.phase).toBe(
      'closed',
    );
  });
});

describe('INDEPENDENT VERIFIER Socket.IO topology (not a static page)', () => {
  let httpServer: ReturnType<typeof createServer> | null = null;
  let baseUrl = '';

  afterAll(async () => {
    httpServer?.close();
  });

  it('create/join/audience/five modes/score/pause/reconnect/migrate/results/rematch over sockets', async () => {
    httpServer = createServer((_req, res) => {
      res.writeHead(200).end('ok');
    });
    setupRealtime(httpServer, '*');
    await new Promise<void>((resolveListen) =>
      httpServer!.listen(0, '127.0.0.1', () => resolveListen()),
    );
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('bind failed');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const host = await connect(baseUrl);
    const created = await emitAck<{ code: string; hostToken?: string }>(host, 'room.create', {});
    expect(created.code).toBeTruthy();
    const code = created.code;
    const hostToken = created.hostToken!;

    const player = await connect(baseUrl);
    const joined = await emitAck<{ ok: boolean; player?: { id: string }; playerToken?: string }>(
      player,
      'room.join',
      { code, name: 'LiveAlice' },
    );
    expect(joined.ok).toBe(true);
    const aliceId = joined.player!.id;
    const aliceToken = joined.playerToken!;

    const player2 = await connect(baseUrl);
    const joined2 = await emitAck<{ ok: boolean; player?: { id: string } }>(player2, 'room.join', {
      code,
      name: 'LiveBob',
    });
    expect(joined2.ok).toBe(true);
    const bobId = joined2.player!.id;

    const audience = await connect(baseUrl);
    const audJoined = await emitAck<{ ok: boolean; audience?: { id: string } }>(
      audience,
      'room.join_audience',
      { code, name: 'Crowd' },
    );
    expect(audJoined.ok).toBe(true);

    player.emit('room.set_role', { code, playerId: aliceId, role: 'beat_tapper' });
    player2.emit('room.set_role', { code, playerId: bobId, role: 'vocalist' });
    player.emit('room.ready', { code, playerId: aliceId, ready: true });
    player2.emit('room.ready', { code, playerId: bobId, ready: true });

    const roomLive = roomManager.getRoom(code)!;
    roomLive.gameDurationMs = 80;

    const modesPlayed: GameModeId[] = [];
    for (const mode of GAME_MODE_IDS) {
      if (roomManager.getRoom(code)?.phase === 'results') {
        host.emit('game.rematch', { code, hostToken });
        await new Promise((r) => setTimeout(r, 30));
        player.emit('room.ready', { code, playerId: aliceId, ready: true });
        player2.emit('room.ready', { code, playerId: bobId, ready: true });
      }
      host.emit('room.set_mode', { code, gameMode: mode, hostToken });
      host.emit('room.select_song', { code, songId: 'demo-neon-groove', hostToken });
      host.emit('game.start_calibration', { code, hostToken });
      host.emit('game.submit_calibration', { code, offsetMs: 0, hostToken });
      const started = waitEvent(player, 'game.started', 6000);
      host.emit('game.start_countdown', { code, hostToken });
      await started;
      expect(roomManager.getRoom(code)?.phase).toBe('playing');
      const paused = await emitAck<{ ok: boolean }>(host, 'room.session_pause', { code, hostToken });
      expect(paused.ok).toBe(true);
      const resumed = await emitAck<{ ok: boolean }>(host, 'room.session_resume', {
        code,
        hostToken,
      });
      expect(resumed.ok).toBe(true);
      player.emit('game.input', {
        code,
        input: { playerId: aliceId, type: 'tap', clientTimeMs: Date.now(), noteId: `n-${mode}` },
      });
      modesPlayed.push(mode);
      roomManager.endGame(code);
    }

    host.emit('audience.sandbox', {
      code,
      audienceId: audJoined.audience!.id,
      sandboxed: false,
      hostToken,
    });
    const influence = await emitAck<{ ok: boolean }>(audience, 'audience.influence', {
      code,
      audienceId: audJoined.audience!.id,
      type: 'hype',
    });
    expect(influence.ok).toBe(true);

    player.emit('room.leave');
    await new Promise((r) => setTimeout(r, 40));
    const rejoin = await emitAck<{ ok: boolean }>(player, 'room.join', {
      code,
      name: 'LiveAlice',
      playerId: aliceId,
      playerToken: aliceToken,
    });
    expect(rejoin.ok).toBe(true);

    const migratedEv = waitEvent<{ newHostPlayerId?: string }>(player2, 'room.host_migrated', 4000);
    host.close();
    const migrated = await migratedEv;
    expect(migrated.newHostPlayerId).toBeTruthy();

    const results = roomManager.endGame(code);
    host.emit?.('game.rematch', { code, hostToken });
    const nextHost = await connect(baseUrl);
    const rematchAck = await emitAck<{ ok?: boolean }>(nextHost, 'room.host_reconnect', {
      code,
      hostToken: roomManager.getRoom(code)?.hostToken,
    }).catch(() => ({ ok: false }));

    const rt = roomManager.getAchievements();
    const evidence = {
      modesPlayed,
      phase: roomManager.getRoom(code)?.phase,
      awards: results?.awards.length ?? 0,
      unlockedCount: rt.unlockedCount(),
      unlocked: CATALOG_IDS.filter((id) => rt.isUnlocked(id)),
      missing: CATALOG_IDS.filter((id) => !rt.isUnlocked(id)),
      rematchReconnect: rematchAck,
      provider: getProviderAuthStatus().authState,
    };
    // eslint-disable-next-line no-console
    console.log('INDEPENDENT_BEATLINK_SOCKET_EVIDENCE', JSON.stringify(evidence));

    expect(modesPlayed).toEqual([...GAME_MODE_IDS]);
    expect(rt.isUnlocked('bl.first_party')).toBe(true);
    expect(rt.isUnlocked('bl.five_mode')).toBe(true);
    expect(rt.isUnlocked('bl.pause_and_breathe')).toBe(true);
    expect(rt.isUnlocked('bl.audience')).toBe(true);
    expect(rt.isUnlocked('bl.host_recovery')).toBe(true);

    player.close();
    player2.close();
    audience.close();
    nextHost.close();
  }, 30_000);
});
