import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createMemoryTelemetryBuffer,
  registerTelemetrySink,
  AUDIENCE_INFLUENCE_COOLDOWN_MS,
  AUDIENCE_INFLUENCE_MAX_PER_ROUND,
  AUDIENCE_INFLUENCE_MAX_DELTA,
  AUDIENCE_CROWD_METER_CEILING,
} from '../packages/shared/src/index.js';
import { isJoinQrExpired } from '../packages/game-engine/src/joinQr.js';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';
import { loadCatalog } from '../apps/server/src/beatmaps/store.js';

describe('room lifecycle Wave G gaps', () => {
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

  it('mints join QR payload with code + expiry', () => {
    const room = manager.createRoom('host-1', {
      publicOrigin: 'https://party.example',
    });
    expect(room.joinQr).not.toBeNull();
    expect(room.joinQr?.code).toBe(room.code);
    expect(room.joinQr?.joinUrl).toContain(`code=${room.code}`);
    expect(room.joinQr?.qrText).toContain(room.code);
    expect(room.joinQr?.expiresAt).toBe(room.expiresAt);
    expect(isJoinQrExpired(room.joinQr!, room.expiresAt - 1)).toBe(false);
    expect(isJoinQrExpired(room.joinQr!, room.expiresAt + 1)).toBe(true);
  });

  it('purges expired rooms and emits telemetry', () => {
    const created = manager.createRoom('host-exp');
    const internal = manager.getRoom(created.code)!;
    internal.expiresAt = Date.now() - 1000;
    const removed = manager.purgeExpiredRooms();
    expect(removed).toContain(created.code);
    expect(manager.getRoom(created.code)).toBeNull();
    expect(buffer.events.some((e) => e.name === 'room_expired' || e.name === 'room_shutdown')).toBe(
      true,
    );
  });

  it('clean-shutdowns with host token', () => {
    const created = manager.createRoom('host-sd');
    manager.joinRoom(created.code, 'p1', 'Alice');
    const closed = manager.shutdownRoom(created.code, {
      hostToken: created.hostToken,
      reason: 'host_end',
    });
    expect(closed?.phase).toBe('closed');
    expect(manager.getRoom(created.code)).toBeNull();
    expect(buffer.events.some((e) => e.name === 'room_shutdown')).toBe(true);
  });

  it('supports rematch and nextRound aliases', () => {
    const created = manager.createRoom('host-nx');
    const { player } = manager.joinRoom(created.code, 'p1', 'Alice')!;
    manager.setRole(created.code, player.id, 'beat_tapper');
    manager.setReady(created.code, player.id, true);
    manager.setGameMode(created.code, 'BandRoles');
    manager.setDifficulty(created.code, 'pro');
    manager.selectSong(created.code, 'demo-neon-groove');
    manager.startCalibration(created.code);
    manager.submitCalibration(created.code, 0);
    manager.startCountdown(created.code);
    manager.tickCountdown(created.code);
    manager.tickCountdown(created.code);
    manager.tickCountdown(created.code);
    manager.endGame(created.code);

    const next = manager.nextRound(created.code);
    expect(next?.phase).toBe('lobby');
    expect(next?.rematchRound).toBe(1);
    expect(next?.gameMode).toBe('BandRoles');
    expect(next?.difficulty).toBe('pro');
    expect(next?.joinQr?.code).toBe(created.code);
  });

  it('sets first-class game mode on the room', () => {
    const created = manager.createRoom('host-mode');
    expect(created.gameMode).toBe('BeatTap');
    const updated = manager.setGameMode(created.code, 'PredictionTrivia');
    expect(updated?.gameMode).toBe('PredictionTrivia');
    expect(buffer.events.some((e) => e.name === 'mode_selected')).toBe(true);
    expect(manager.setGameMode(created.code, 'NotAMode')).toBeNull();
  });
});

describe('audience anti-grief bounded impact', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('caps per-action delta and soft-ceiling crowd meter', () => {
    const created = manager.createRoom('host-aud');
    const { audience } = manager.joinAudience(created.code, 'aud-1', 'Crowd')!;
    const internal = manager.getRoom(created.code)!;
    internal.phase = 'playing';
    internal.crowdMeter = AUDIENCE_CROWD_METER_CEILING - 1;

    const first = manager.processAudienceInfluence(created.code, audience.id, 'hype');
    expect(first?.event.accepted).toBe(true);
    expect(first!.event.crowdDelta).toBeLessThanOrEqual(AUDIENCE_INFLUENCE_MAX_DELTA);
    expect(first!.room.crowdMeter).toBeLessThanOrEqual(AUDIENCE_CROWD_METER_CEILING);

    const member = manager.getRoom(created.code)!.audience[0]!;
    member.lastInfluenceAt = Date.now() - AUDIENCE_INFLUENCE_COOLDOWN_MS - 1;
    const second = manager.processAudienceInfluence(created.code, audience.id, 'hype');
    expect(second?.event.accepted).toBe(true);
    expect(second!.event.crowdDelta).toBe(0);
    expect(second!.room.crowdMeter).toBe(AUDIENCE_CROWD_METER_CEILING);
  });

  it('enforces round cap so cumulative impact stays bounded', () => {
    const created = manager.createRoom('host-cap');
    const { audience } = manager.joinAudience(created.code, 'aud-2', 'Fan')!;
    const internal = manager.getRoom(created.code)!;
    internal.phase = 'playing';
    internal.crowdMeter = 40;

    let accepted = 0;
    for (let i = 0; i < AUDIENCE_INFLUENCE_MAX_PER_ROUND + 3; i++) {
      const member = manager.getRoom(created.code)!.audience[0]!;
      member.lastInfluenceAt = Date.now() - AUDIENCE_INFLUENCE_COOLDOWN_MS - 1;
      const result = manager.processAudienceInfluence(created.code, audience.id, 'vote', 'a');
      if (result?.event.accepted) accepted += 1;
    }
    expect(accepted).toBe(AUDIENCE_INFLUENCE_MAX_PER_ROUND);
    const meter = manager.getRoom(created.code)!.crowdMeter;
    const maxPossible =
      40 + AUDIENCE_INFLUENCE_MAX_PER_ROUND * AUDIENCE_INFLUENCE_MAX_DELTA;
    expect(meter).toBeLessThanOrEqual(Math.min(AUDIENCE_CROWD_METER_CEILING, maxPossible));
  });
});

describe('catalog floor', () => {
  it('has at least 12 rights-cleared / demo tracks', () => {
    const songs = loadCatalog();
    expect(songs.length).toBeGreaterThanOrEqual(12);
    for (const song of songs) {
      expect(['demo_generated', 'synthetic_original', 'public_domain', 'royalty_free']).toContain(
        song.license,
      );
    }
  });
});
