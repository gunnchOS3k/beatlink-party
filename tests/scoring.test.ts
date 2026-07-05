import { describe, it, expect } from 'vitest';
import { gradeTiming } from '../packages/game-engine/src/timing.js';
import { scoreBeatTap, scoreVocalPhrase } from '../packages/game-engine/src/scoring.js';
import { computeAwards } from '../packages/game-engine/src/awards.js';
import { canTransition, assertTransition } from '../packages/game-engine/src/stateMachine.js';
import type { Player } from '../packages/shared/src/types.js';

describe('timing engine', () => {
  it('grades perfect timing within 40ms', () => {
    expect(gradeTiming(20)).toBe('perfect');
    expect(gradeTiming(-30)).toBe('perfect');
  });

  it('grades miss beyond good window', () => {
    expect(gradeTiming(200)).toBe('miss');
  });
});

describe('scoring engine', () => {
  it('awards points for on-beat tap', () => {
    const result = scoreBeatTap(
      { playerId: 'p1', type: 'tap', clientTimeMs: 2000 },
      2000,
      2010,
      0,
    );
    expect(result.grade).toBe('perfect');
    expect(result.points).toBeGreaterThan(0);
  });

  it('scores vocal phrase participation', () => {
    const result = scoreVocalPhrase(
      { playerId: 'p1', type: 'vocal_phrase', clientTimeMs: 5000 },
      4800,
      3000,
      5000,
      0,
    );
    expect(result.points).toBeGreaterThan(0);
  });
});

describe('awards', () => {
  it('computes MVP and role awards', () => {
    const players: Player[] = [
      {
        id: '1',
        name: 'Alice',
        role: 'beat_tapper',
        ready: true,
        connected: true,
        score: 500,
        accuracy: 90,
        streak: 2,
        maxStreak: 5,
        color: '#ff6b6b',
      },
      {
        id: '2',
        name: 'Bob',
        role: 'vocalist',
        ready: true,
        connected: true,
        score: 300,
        accuracy: 80,
        streak: 1,
        maxStreak: 3,
        color: '#4ecdc4',
      },
    ];
    const awards = computeAwards(players);
    expect(awards.find((a) => a.id === 'mvp')?.playerName).toBe('Alice');
    expect(awards.find((a) => a.id === 'best_beat')?.playerName).toBe('Alice');
  });
});

describe('state machine', () => {
  it('allows lobby to song_select', () => {
    expect(canTransition('lobby', 'song_select')).toBe(true);
  });

  it('throws on invalid transition', () => {
    expect(() => assertTransition('lobby', 'playing')).toThrow();
  });
});
