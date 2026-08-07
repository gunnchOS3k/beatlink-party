import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMemoryTelemetryBuffer,
  registerTelemetrySink,
  AUDIENCE_INFLUENCE_COOLDOWN_MS,
} from '@beatlink/shared';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

describe('RoomManager audience + host migration', () => {
  let manager: RoomManager;
  let buffer: ReturnType<typeof createMemoryTelemetryBuffer>;
  let unregister: () => void;

  beforeEach(() => {
    manager = new RoomManager();
    buffer = createMemoryTelemetryBuffer();
    unregister = registerTelemetrySink(buffer.sink);
  });

  afterEach(() => {
    unregister();
  });

  it('creates a room with audience list and rematchRound', () => {
    const room = manager.createRoom('host-1');
    expect(room.code).toMatch(/^[A-Z0-9]{5}$/);
    expect(room.audience).toEqual([]);
    expect(room.rematchRound).toBe(0);
    expect(room.hostToken).toBeTruthy();
    expect(buffer.events.some((e) => e.name === 'room_created')).toBe(true);
  });

  it('joins a real audience seat (not a player)', () => {
    const room = manager.createRoom('host-1');
    const result = manager.joinAudience(room.code, 'aud-sock', 'Viewer');
    expect(result).not.toBeNull();
    expect(result!.audience.name).toBe('Viewer');
    expect(result!.room.players).toHaveLength(0);
    expect(result!.room.audience).toHaveLength(1);
    expect(buffer.events.some((e) => e.name === 'audience_join')).toBe(true);
  });

  it('rate-limits audience influence and honors mute/sandbox', () => {
    const created = manager.createRoom('host-1');
    const { audience } = manager.joinAudience(created.code, 'aud-1', 'Crowd')!;

    // Influence only accepted during playing/countdown/results — force phase
    const internal = manager.getRoom(created.code)!;
    internal.phase = 'playing';

    const first = manager.processAudienceInfluence(created.code, audience.id, 'hype');
    expect(first?.event.accepted).toBe(true);
    expect(first!.room.crowdMeter).toBeGreaterThan(50);

    const second = manager.processAudienceInfluence(created.code, audience.id, 'hype');
    expect(second?.event.accepted).toBe(false);
    expect(second?.event.reason).toBe('rate_limited');

    const member = manager.getRoom(created.code)!.audience[0]!;
    member.lastInfluenceAt = Date.now() - AUDIENCE_INFLUENCE_COOLDOWN_MS - 1;
    manager.setAudienceMuted(created.code, audience.id, true);
    const muted = manager.processAudienceInfluence(created.code, audience.id, 'vote', 'encore');
    expect(muted?.event.accepted).toBe(false);
    expect(muted?.event.reason).toBe('muted');

    manager.setAudienceMuted(created.code, audience.id, false);
    manager.setAudienceSandboxed(created.code, audience.id, true);
    member.lastInfluenceAt = Date.now() - AUDIENCE_INFLUENCE_COOLDOWN_MS - 1;
    const sandboxed = manager.processAudienceInfluence(created.code, audience.id, 'hype');
    expect(sandboxed?.event.accepted).toBe(false);
    expect(sandboxed?.event.reason).toBe('sandboxed');
  });

  it('authorizes host via token and migrates on host disconnect', () => {
    const created = manager.createRoom('host-sock');
    const token = created.hostToken;
    expect(manager.authorizeHost(created.code, 'host-sock', token)).toBe(true);
    expect(manager.getHostToken(created.code, 'host-sock')).toBe(token);

    const { player, playerToken } = manager.joinRoom(created.code, 'p1', 'Alice')!;
    expect(manager.ownsPlayer(created.code, 'p1', player.id)).toBe(true);

    const migrated = manager.migrateHostOnDisconnect('host-sock');
    expect(migrated).not.toBeNull();
    expect(migrated!.newHostPlayerId).toBe(player.id);
    expect(migrated!.room.hostId).toBe(`player-host:${player.id}`);

    const claimed = manager.claimHostAsPlayer(created.code, player.id, playerToken, 'p1-host');
    expect(claimed).not.toBeNull();
    expect(claimed!.hostToken).toBe(token);
    expect(claimed!.room.hostId).toBe('p1-host');
  });

  it('reconnects player with token and rematches while keeping seats', () => {
    const created = manager.createRoom('host-1');
    const { player, playerToken } = manager.joinRoom(created.code, 'sock-a', 'Alice')!;
    manager.leaveRoom('sock-a');
    const re = manager.reconnectPlayer(created.code, player.id, playerToken, 'sock-b');
    expect(re?.connected).toBe(true);
    expect(manager.ownsPlayer(created.code, 'sock-b', player.id)).toBe(true);

    manager.setRole(created.code, player.id, 'beat_tapper');
    manager.setReady(created.code, player.id, true);
    manager.selectSong(created.code, 'demo-neon-groove');
    manager.startCalibration(created.code);
    manager.submitCalibration(created.code, 10);
    manager.startCountdown(created.code);
    manager.tickCountdown(created.code);
    manager.tickCountdown(created.code);
    manager.tickCountdown(created.code);
    manager.endGame(created.code);

    const rematched = manager.rematch(created.code);
    expect(rematched?.phase).toBe('lobby');
    expect(rematched?.rematchRound).toBe(1);
    expect(rematched?.players).toHaveLength(1);
    expect(rematched?.players[0]?.id).toBe(player.id);
    expect(buffer.events.some((e) => e.name === 'rematch')).toBe(true);
  });
});
