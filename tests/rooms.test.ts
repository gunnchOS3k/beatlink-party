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

  it('rejects join when room is full (6 players)', () => {
    const room = manager.createRoom('host-1');
    for (let i = 0; i < 6; i++) {
      manager.joinRoom(room.code, `socket-${i}`, `Player${i}`);
    }
    const seventh = manager.joinRoom(room.code, 'socket-7', 'Overflow');
    expect(seventh).toBeNull();
  });

  it('transitions through countdown to playing', () => {
    const room = manager.createRoom('host-1');
    manager.joinRoom(room.code, 'p1', 'Alice');
    manager.selectSong(room.code, 'demo-neon-groove');
    const countdown = manager.startCountdown(room.code);
    expect(countdown?.phase).toBe('countdown');
    expect(countdown?.countdown).toBe(3);
    manager.tickCountdown(room.code);
    manager.tickCountdown(room.code);
    const playing = manager.tickCountdown(room.code);
    expect(playing?.phase).toBe('playing');
    expect(playing?.gameStartTime).not.toBeNull();
  });

  it('scores beat tapper input during gameplay', () => {
    const room = manager.createRoom('host-1');
    const { player } = manager.joinRoom(room.code, 'p1', 'Alice')!;
    manager.setRole(room.code, player.id, 'beat_tapper');
    manager.selectSong(room.code, 'demo-neon-groove');
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
