import { describe, it, expect } from 'vitest';
import {
  assertModesComplete,
  getGameMode,
  getModeDifficultyHooks,
  getModeTutorial,
  listGameModes,
  scoreForMode,
} from '../packages/game-engine/src/modes/index.js';
import { GAME_MODE_IDS } from '../packages/shared/src/types.js';

describe('Wave G first-class game modes', () => {
  it('registers all five matrix modes', () => {
    const { complete, missing } = assertModesComplete();
    expect(complete).toBe(true);
    expect(missing).toEqual([]);
    expect(listGameModes()).toHaveLength(5);
    expect(GAME_MODE_IDS).toEqual([
      'BeatTap',
      'CallAndResponse',
      'KaraokePerformance',
      'BandRoles',
      'PredictionTrivia',
    ]);
  });

  it('exposes tutorial + difficulty hooks for every mode', () => {
    for (const id of GAME_MODE_IDS) {
      const mode = getGameMode(id);
      expect(mode.tutorial.length).toBeGreaterThanOrEqual(5);
      expect(getModeTutorial(id)[0]?.title).toBeTruthy();
      expect(mode.tutorial.every((s) => Boolean(s.caption))).toBe(true);
      expect(mode.a11y.captionsRequired).toBe(true);
      expect(mode.teams.supportsTeams).toBe(true);
      expect(mode.replay.supported).toBe(true);
      expect(mode.replay.includesMicAudio).toBe(false);
      for (const difficulty of ['beginner', 'casual', 'pro', 'nightmare'] as const) {
        const hooks = getModeDifficultyHooks(id, difficulty);
        expect(hooks.scoreMultiplier).toBeGreaterThan(0);
        expect(hooks.timingWindowScale).toBeGreaterThan(0);
        expect(hooks.chartDensity).toBeGreaterThan(0);
      }
    }
  });

  it('scores BeatTap with difficulty multipliers', () => {
    const casual = scoreForMode({
      modeId: 'BeatTap',
      difficulty: 'casual',
      grade: 'perfect',
      basePoints: 300,
      streak: 1,
    });
    const nightmare = scoreForMode({
      modeId: 'BeatTap',
      difficulty: 'nightmare',
      grade: 'perfect',
      basePoints: 300,
      streak: 1,
    });
    expect(casual.points).toBe(300);
    expect(nightmare.points).toBeGreaterThan(casual.points);
  });

  it('scores CallAndResponse with response match bonus', () => {
    const hit = scoreForMode({
      modeId: 'CallAndResponse',
      difficulty: 'casual',
      grade: 'great',
      basePoints: 200,
      streak: 2,
      meta: { responseMatched: true },
    });
    const miss = scoreForMode({
      modeId: 'CallAndResponse',
      difficulty: 'casual',
      grade: 'miss',
      basePoints: 0,
      streak: 0,
      meta: { responseMatched: false },
    });
    expect(hit.points).toBeGreaterThan(200);
    expect(miss.message.toLowerCase()).toContain('miss');
  });

  it('scores KaraokePerformance as no-recording by default', () => {
    const result = scoreForMode({
      modeId: 'KaraokePerformance',
      difficulty: 'casual',
      grade: 'perfect',
      basePoints: 300,
      streak: 1,
      meta: { noRecording: true },
    });
    expect(result.message).toContain('no recording');
    expect(result.points).toBeGreaterThan(300);
  });

  it('scores BandRoles with role + coverage bonuses', () => {
    const covered = scoreForMode({
      modeId: 'BandRoles',
      difficulty: 'casual',
      grade: 'perfect',
      basePoints: 300,
      streak: 1,
      meta: { role: 'vocalist', bandCoverage: true },
    });
    expect(covered.points).toBeGreaterThan(300);
    expect(covered.message).toContain('Band');
  });

  it('scores PredictionTrivia correct vs incorrect', () => {
    const correct = scoreForMode({
      modeId: 'PredictionTrivia',
      difficulty: 'pro',
      grade: 'perfect',
      basePoints: 0,
      streak: 0,
      meta: { predictionCorrect: true },
    });
    const wrong = scoreForMode({
      modeId: 'PredictionTrivia',
      difficulty: 'pro',
      grade: 'miss',
      basePoints: 0,
      streak: 0,
      meta: { predictionCorrect: false },
    });
    expect(correct.points).toBeGreaterThan(0);
    expect(wrong.points).toBe(0);
    expect(getModeDifficultyHooks('PredictionTrivia', 'nightmare').predictionChoices).toBe(5);
  });
});
