import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('creates a room with a 5-character code', () => {
    const room = manager.createRoom('host-1');
    expect(room.code).toMatch(/^[A-Z0-9]{5}$/);
    expect(room.phase).toBe('lobby');
    expect(room.players).toHaveLength(0);
  });

  it('allows a player to join a room', () => {
    const room = manager.createRoom('host-1');
    const result = manager.joinRoom(room.code, 'socket-1', 'Alice');
    expect(result).not.toBeNull();
    expect(result!.player.name).toBe('Alice');
    expect(result!.room.players).toHaveLength(1);
  });

  it('rejects join when room is full (8 performers per ADR)', () => {
    const room = manager.createRoom('host-1');
    for (let i = 0; i < 8; i++) {
      manager.joinRoom(room.code, `socket-${i}`, `Player${i}`);
    }
    const ninth = manager.joinRoom(room.code, 'socket-9', 'Overflow');
    expect(ninth).toBeNull();
  });

  it('transitions song_select → calibrating → countdown → playing', () => {
    const room = manager.createRoom('host-1');
    expect(room.pastedLinkUrl).toBeNull();
    expect(room.calibrationOffsetMs).toBe(0);
    const { player } = manager.joinRoom(room.code, 'p1', 'Alice')!;
    manager.setRole(room.code, player.id, 'beat_tapper');
    manager.setReady(room.code, player.id, true);
    manager.selectSong(room.code, 'demo-neon-groove');
    const calibrating = manager.startCalibration(room.code);
    expect(calibrating?.phase).toBe('calibrating');
    const calibrated = manager.submitCalibration(room.code, 42);
    expect(calibrated?.calibrationOffsetMs).toBe(42);
    const countdown = manager.startCountdown(room.code);
    expect(countdown?.phase).toBe('countdown');
    expect(countdown?.countdown).toBe(3);
    manager.tickCountdown(room.code);
    manager.tickCountdown(room.code);
    const playing = manager.tickCountdown(room.code);
    expect(playing?.phase).toBe('playing');
    expect(playing?.gameStartTime).not.toBeNull();
  });

  it('persists resolved link snapshot on room state', () => {
    const room = manager.createRoom('host-1');
    const result = manager.setResolvedLink(room.code, 'https://open.spotify.com/track/abc', {
      platform: 'spotify',
      sourceId: 'track:abc',
      title: 'Neon Groove Extra',
      artist: 'BeatLink Demo Ensemble',
      album: null,
      artworkUrl: null,
      durationMs: 45000,
      playbackStatus: 'PLAYABLE_APPROVED',
      analysisEligible: true,
      lyricsEligible: false,
      matchedCatalogId: 'demo-neon-groove',
      message: 'Matched',
      fallbackOptions: [],
    });
    expect(result?.pastedLinkUrl).toContain('spotify');
    expect(result?.linkResolveResult?.playbackStatus).toBe('PLAYABLE_APPROVED');
    expect(result?.selectedSongId).toBe('demo-neon-groove');
    expect(result?.phase).toBe('song_select');
  });

  it('rejects countdown before calibration', () => {
    const room = manager.createRoom('host-1');
    const { player } = manager.joinRoom(room.code, 'p1', 'Alice')!;
    manager.setRole(room.code, player.id, 'beat_tapper');
    manager.setReady(room.code, player.id, true);
    manager.selectSong(room.code, 'demo-neon-groove');
    expect(manager.startCountdown(room.code)).toBeNull();
  });

  it('scores beat tapper input during gameplay', () => {
    const room = manager.createRoom('host-1');
    const { player } = manager.joinRoom(room.code, 'p1', 'Alice')!;
    manager.setRole(room.code, player.id, 'beat_tapper');
    manager.setReady(room.code, player.id, true);
    manager.selectSong(room.code, 'demo-neon-groove');
    manager.startCalibration(room.code);
    manager.submitCalibration(room.code, 0);
    manager.startCountdown(room.code);
    manager.tickCountdown(room.code);
    manager.tickCountdown(room.code);
    manager.tickCountdown(room.code);

    const internal = manager.getRoom(room.code)!;
    internal.gameStartTime = Date.now() - internal.beatmap!.notes[0]!.timeMs;
    const note = internal.beatmap!.notes[0]!;
    const result = manager.processInput(room.code, {
      playerId: player.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: note.id,
    });
    expect(result).not.toBeNull();
    expect(result!.scoreEvent).not.toBeNull();
    expect(result!.room.teamScore).toBeGreaterThan(0);
  });
});
