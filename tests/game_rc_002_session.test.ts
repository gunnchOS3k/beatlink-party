import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { RoomManager, roomManager } from '../apps/server/src/rooms/RoomManager.js';
import { setupRealtime } from '../apps/server/src/realtime/socket.js';
import { getProviderAuthStatus } from '../apps/server/src/music/linkResolver.js';
import {
  AchievementRuntime,
  parseAchievementCatalog,
  memoryPersist,
} from '../packages/game-engine/src/achievementRuntime.js';
import { GAME_MODE_IDS, type GameModeId } from '../packages/shared/src/types.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '..');
const serverRequire = createRequire(resolve(ROOT, 'apps/server/package.json'));
const { io: ioClient } = serverRequire('socket.io-client') as typeof import('socket.io-client');
type Socket = import('socket.io-client').Socket;

const catalog = parseAchievementCatalog(
  JSON.parse(readFileSync(resolve(ROOT, 'release/ACHIEVEMENTS.json'), 'utf8')),
);

function playRound(
  manager: RoomManager,
  code: string,
  hostSocket: string,
  hostToken: string,
  mode: GameModeId,
  songId = 'demo-neon-groove',
) {
  expect(manager.setGameMode(code, mode)).toBeTruthy();
  expect(manager.selectSong(code, songId)).toBeTruthy();
  expect(manager.startCalibration(code)).toBeTruthy();
  expect(manager.submitCalibration(code, 0)).toBeTruthy();
  expect(manager.startCountdown(code)).toBeTruthy();
  manager.tickCountdown(code);
  manager.tickCountdown(code);
  manager.tickCountdown(code);
  const playing = manager.getRoom(code);
  expect(playing?.phase).toBe('playing');
  expect(manager.pauseSession(code, hostSocket, hostToken)?.phase).toBe('paused');
  expect(manager.resumeSession(code, hostSocket, hostToken)?.phase).toBe('playing');
}

describe('GAME-RC-002 Beat Link contracts + achievement runtime', () => {
  it('validates release contracts', () => {
    const out = execFileSync('python3', ['scripts/validate_game_rc_contracts.py'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('GAME_RC_CONTRACTS_OK');
  });

  it('unlocks all 12 catalog entries from real conditions', () => {
    const persist = memoryPersist();
    const rt = new AchievementRuntime(catalog, persist);
    expect(rt.catalogCount()).toBe(12);
    expect(rt.completionPercent()).toBe(0);
    const hidden = rt.browserEntries().find((e) => e.id === 'bl.hidden_full_house');
    expect(hidden?.title).toBe('???');

    rt.reportEvent('party_started', 1);
    expect(rt.isUnlocked('bl.first_party')).toBe(true);
    const stamp = rt.unlockedAt('bl.first_party');
    rt.reportEvent('party_started', 1);
    expect(rt.unlockedAt('bl.first_party')).toBe(stamp);

    rt.setFlag('mode:BeatTap');
    rt.setFlag('mode:CallAndResponse');
    rt.setFlag('mode:KaraokePerformance');
    rt.setFlag('band_cooperation');
    rt.setFlag('mode:PredictionTrivia');
    rt.reportEvent('audience_influence', 1);
    rt.reportEvent('host_migrated', 1);
    rt.reportEvent('comeback', 1);
    rt.setFlag('five_mode_session');
    rt.reportEvent('pause_resume', 1);
    expect(rt.isUnlocked('bl.hidden_full_house')).toBe(true);
    expect(rt.unlockedCount()).toBe(12);
    expect(rt.completionPercent()).toBe(100);
    expect(rt.drainNotifications().length).toBeGreaterThanOrEqual(12);

    const rt2 = new AchievementRuntime(catalog, persist);
    expect(rt2.isUnlocked('bl.first_party')).toBe(true);
    expect(rt2.unlockedAt('bl.first_party')).toBe(stamp);
  });

  it('keeps honesty tokens false and provider EXTERNAL_PENDING without credentials', () => {
    const gate = JSON.parse(readFileSync(resolve(ROOT, 'release/RC_GATE.json'), 'utf8')) as {
      claims: Record<string, boolean>;
      critic_class: string;
      defects: { S0_open: number; S1_open: number };
    };
    expect(gate.claims.POLISHED_RELEASE_CANDIDATE).toBe(false);
    expect(gate.claims.FEATURE_COMPLETE_RC).toBe(false);
    expect(gate.claims.HUMAN_PLAYTEST_VALIDATED).toBe(false);
    expect(gate.critic_class).toBe('ALPHA');
    expect(gate.defects.S0_open).toBe(0);
    expect(gate.defects.S1_open).toBe(0);
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    expect(getProviderAuthStatus().authState).toBe('EXTERNAL_PENDING');
  });
});

describe('GAME-RC-002 complete party session on RoomManager', () => {
  it('walks create/join/audience/five modes/pause/reconnect/migration/results/rematch/leave', () => {
    const manager = new RoomManager();
    const created = manager.createRoom('host-1');
    const code = created.code;
    const hostToken = created.hostToken;
    expect(manager.getAchievements().isUnlocked('bl.first_party')).toBe(true);

    const alice = manager.joinRoom(code, 'p-alice', 'Alice')!;
    const bob = manager.joinRoom(code, 'p-bob', 'Bob')!;
    expect(alice.player.id).not.toBe(bob.player.id);
    const aud = manager.joinAudience(code, 'aud-1', 'Crowd')!;
    manager.setAudienceSandboxed(code, aud.audience.id, false);
    manager.setRole(code, alice.player.id, 'beat_tapper');
    manager.setRole(code, bob.player.id, 'vocalist');
    manager.setReady(code, alice.player.id, true);
    manager.setReady(code, bob.player.id, true);

    expect(manager.selectSong(code, 'launch-pd-tap-grid')).toBeTruthy();

    for (let i = 0; i < GAME_MODE_IDS.length; i++) {
      const mode = GAME_MODE_IDS[i]!;
      const phase = manager.getRoom(code)?.phase;
      if (phase === 'results') manager.rematch(code);
      manager.setReady(code, alice.player.id, true);
      manager.setReady(code, bob.player.id, true);
      playRound(manager, code, 'host-1', hostToken, mode, 'demo-neon-groove');
      if (i < GAME_MODE_IDS.length - 1) manager.endGame(code);
    }

    expect(manager.getAchievements().isUnlocked('bl.beat_tap')).toBe(true);
    expect(manager.getAchievements().isUnlocked('bl.call_and_response')).toBe(true);
    expect(manager.getAchievements().isUnlocked('bl.karaoke')).toBe(true);
    expect(manager.getAchievements().isUnlocked('bl.band_cooperation')).toBe(true);
    expect(manager.getAchievements().isUnlocked('bl.prediction')).toBe(true);
    expect(manager.getAchievements().isUnlocked('bl.five_mode')).toBe(true);
    expect(manager.getAchievements().isUnlocked('bl.pause_and_breathe')).toBe(true);

    const playing = manager.getRoom(code)!;
    expect(playing.phase).toBe('playing');
    const crowd = manager.processAudienceInfluence(code, aud.audience.id, 'hype');
    expect(crowd?.event.accepted).toBe(true);
    expect(manager.getAchievements().isUnlocked('bl.audience')).toBe(true);

    manager.leaveRoom('p-alice');
    expect(manager.getRoom(code)?.players.find((p) => p.id === alice.player.id)?.connected).toBe(
      false,
    );
    manager.reconnectPlayer(code, alice.player.id, alice.playerToken, 'p-alice-2');
    expect(manager.getRoom(code)?.players.find((p) => p.id === alice.player.id)?.connected).toBe(
      true,
    );

    const migrated = manager.migrateHostOnDisconnect('host-1');
    expect(migrated?.newHostPlayerId).toBeTruthy();
    expect(manager.getAchievements().isUnlocked('bl.host_recovery')).toBe(true);

    const internal = manager.getRoom(code)!;
    internal.players[0]!.score = 10;
    internal.players[1]!.score = 400;
    manager.processInput(code, {
      playerId: alice.player.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: 'note-1',
    });
    internal.players[0]!.score = 900;
    const results = manager.endGame(code);
    expect(results?.awards.length).toBeGreaterThan(0);
    expect(manager.getAchievements().isUnlocked('bl.comeback')).toBe(true);
    expect(manager.getAchievements().isUnlocked('bl.hidden_full_house')).toBe(true);
    expect(manager.getAchievements().unlockedCount()).toBe(12);

    expect(manager.rematch(code)?.phase).toBe('lobby');
    const closed = manager.shutdownRoom(code, { hostToken });
    expect(closed?.phase).toBe('closed');

    const next = manager.createRoom('host-new');
    expect(next.code).not.toBe(code);
    expect(next.achievementSummary?.total).toBe(12);
  });
});

describe('GAME-RC-002 live Socket.IO topology (not a static page)', () => {
  let httpServer: ReturnType<typeof createServer> | null = null;
  let baseUrl = '';

  afterAll(async () => {
    httpServer?.close();
  });

  it('host and player sockets create and join a real room', async () => {
    httpServer = createServer((_req, res) => {
      res.writeHead(200).end('ok');
    });
    setupRealtime(httpServer, '*');
    await new Promise<void>((resolve) => httpServer!.listen(0, '127.0.0.1', () => resolve()));
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('bind failed');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const connect = () =>
      new Promise<Socket>((resolve, reject) => {
        const socket = ioClient(baseUrl, {
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
        });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', reject);
      });

    const host = await connect();
    const created = await new Promise<{ code: string }>((resolve, reject) => {
      host.emit('room.create', {}, (res: { code?: string }) => {
        if (res?.code) resolve({ code: res.code });
        else reject(new Error('no code'));
      });
    });
    const player = await connect();
    const joined = await new Promise<{ ok: boolean }>((resolve, reject) => {
      player.emit(
        'room.join',
        { code: created.code, name: 'LivePlayer' },
        (res: { ok?: boolean }) => {
          if (res?.ok) resolve({ ok: true });
          else reject(new Error('join failed'));
        },
      );
    });
    expect(joined.ok).toBe(true);
    expect(roomManager.getRoom(created.code)?.players.length).toBeGreaterThan(0);
    host.close();
    player.close();
  });
});
