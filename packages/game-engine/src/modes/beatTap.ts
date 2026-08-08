import type { DifficultyId } from '@beatlink/shared';
import type { GameModeDefinition, ModeDifficultyHooks, ModeScoreContext, ModeScoreResult } from './types.js';

const BASE_HOOKS: Record<DifficultyId, ModeDifficultyHooks> = {
  beginner: { scoreMultiplier: 0.85, timingWindowScale: 1.4, chartDensity: 0.55 },
  casual: { scoreMultiplier: 1, timingWindowScale: 1, chartDensity: 1 },
  pro: { scoreMultiplier: 1.25, timingWindowScale: 0.75, chartDensity: 1.35 },
  nightmare: { scoreMultiplier: 1.5, timingWindowScale: 0.55, chartDensity: 1.75 },
};

function applyDifficulty(ctx: ModeScoreContext, bonus = 0): ModeScoreResult {
  const hooks = BASE_HOOKS[ctx.difficulty];
  const points = Math.round(ctx.basePoints * hooks.scoreMultiplier) + bonus;
  const crowdBoost =
    ctx.grade === 'perfect' ? 4 : ctx.grade === 'great' ? 2 : ctx.grade === 'good' ? 1 : -1;
  return {
    points,
    message: ctx.grade === 'miss' ? 'Miss!' : `${ctx.grade} · BeatTap`,
    crowdBoost,
  };
}

export const beatTapMode: GameModeDefinition = {
  id: 'BeatTap',
  label: 'Beat Tap',
  tagline: 'Tap on the beat grid — pure rhythm accuracy.',
  primaryRoles: ['beat_tapper'],
  micPolicy: 'disabled',
  tutorial: [
    {
      id: 'bt-1',
      title: 'Watch the pulse',
      body: 'Notes approach on the beat lane. Tap when they hit the judgment line.',
      roleHint: 'beat_tapper',
    },
    {
      id: 'bt-2',
      title: 'Hold notes',
      body: 'Some notes require a hold — release after the sustain ends.',
    },
    {
      id: 'bt-3',
      title: 'Streaks multiply',
      body: 'Keep a streak to raise your combo multiplier and crowd energy.',
    },
  ],
  difficultyHooks: {
    beginner: { ...BASE_HOOKS.beginner },
    casual: { ...BASE_HOOKS.casual },
    pro: { ...BASE_HOOKS.pro },
    nightmare: { ...BASE_HOOKS.nightmare },
  },
  score: (ctx) => applyDifficulty(ctx),
};
