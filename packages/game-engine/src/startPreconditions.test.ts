import { describe, expect, it } from 'vitest';
import {
  assertCanStartRoom,
  evaluateCountdownPreconditions,
  evaluateStartPreconditions,
} from '../src/startPreconditions.js';

const jordan = {
  name: 'Jordan',
  ready: true,
  role: 'beat_tapper' as const,
  connected: true,
};

const ghost = {
  name: 'Ghost',
  ready: false,
  role: null,
  connected: false,
};

describe('startPreconditions', () => {
  it('blocks when no song or no connected ready players', () => {
    const noSong = evaluateStartPreconditions({
      phase: 'lobby',
      selectedSongId: null,
      players: [jordan],
    });
    expect(noSong.ok).toBe(false);
    expect(noSong.reason).toMatch(/playable song/i);

    const waiting = evaluateStartPreconditions({
      phase: 'song_select',
      selectedSongId: 'demo-neon-groove',
      players: [{ ...jordan, ready: false }],
    });
    expect(waiting.ok).toBe(false);
    expect(waiting.reason).toMatch(/Jordan.*Ready/i);
  });

  it('ignores disconnected seats so ghosts cannot soft-lock Start', () => {
    const gate = evaluateStartPreconditions({
      phase: 'song_select',
      selectedSongId: 'demo-neon-groove',
      players: [jordan, ghost],
    });
    expect(gate.ok).toBe(true);
    expect(gate.disconnectedCount).toBe(1);
    expect(assertCanStartRoom({ players: [jordan, ghost] })).toBe(true);
  });

  it('requires calibrating phase for countdown', () => {
    const blocked = evaluateCountdownPreconditions({
      phase: 'song_select',
      selectedSongId: 'demo-neon-groove',
      beatmap: { id: 'x' },
      players: [jordan],
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/calibration/i);

    const ok = evaluateCountdownPreconditions({
      phase: 'calibrating',
      selectedSongId: 'demo-neon-groove',
      beatmap: { id: 'x' },
      players: [jordan],
    });
    expect(ok.ok).toBe(true);
  });
});
