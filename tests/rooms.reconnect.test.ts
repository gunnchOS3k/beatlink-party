import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

function playRound(manager: RoomManager, code: string, playerIds: string[]) {
  for (const id of playerIds) {
    manager.setRole(code, id, 'beat_tapper');
    manager.setReady(code, id, true);
  }
  expect(manager.selectSong(code, 'demo-neon-groove')).not.toBeNull();
  expect(manager.startCalibration(code)?.phase).toBe('calibrating');
  expect(manager.submitCalibration(code, 0)).not.toBeNull();
  expect(manager.startCountdown(code)?.phase).toBe('countdown');
  manager.tickCountdown(code);
  manager.tickCountdown(code);
  const playing = manager.tickCountdown(code);
  expect(playing?.phase).toBe('playing');
  return playing!;
}

describe('RoomManager host/player lifecycle (supervisor-ready)', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('creates a room code, joins two players, roles, ready, song, countdown, play, results, replay', () => {
    const created = manager.createRoom('host-a');
    expect(created.code).toMatch(/^[A-Z0-9]{5}$/);
    expect(created.phase).toBe('lobby');

    const a = manager.joinRoom(created.code, 'sock-a', 'Ada')!;
    const b = manager.joinRoom(created.code, 'sock-b', 'Bea')!;
    expect(a.player.name).toBe('Ada');
    expect(b.player.name).toBe('Bea');
    expect(manager.getRoom(created.code)?.players).toHaveLength(2);

    playRound(manager, created.code, [a.player.id, b.player.id]);
    const ended = manager.endGame(created.code);
    expect(ended).not.toBeNull();
    expect(manager.getRoom(created.code)?.phase).toBe('results');

    const replayed = manager.replay(created.code);
    expect(replayed?.phase).toBe('lobby');
    expect(replayed?.players).toHaveLength(2);
  });

  it('marks disconnect and restores the same player via token', () => {
    const created = manager.createRoom('host-b');
    const joined = manager.joinRoom(created.code, 'sock-1', 'Cam')!;
    const left = manager.leaveRoom('sock-1');
    expect(left?.players[0]?.connected).toBe(false);

    const again = manager.reconnectPlayer(
      created.code,
      joined.player.id,
      joined.playerToken,
      'sock-2',
    );
    expect(again?.id).toBe(joined.player.id);
    expect(again?.connected).toBe(true);
  });

  it('rejects a forged reconnect token', () => {
    const created = manager.createRoom('host-c');
    const joined = manager.joinRoom(created.code, 'sock-1', 'Dee')!;
    expect(
      manager.reconnectPlayer(created.code, joined.player.id, 'not-the-token', 'sock-x'),
    ).toBeNull();
  });
});
