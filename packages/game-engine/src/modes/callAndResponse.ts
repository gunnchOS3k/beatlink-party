import type { DifficultyId } from '@beatlink/shared';
import type { GameModeDefinition, ModeDifficultyHooks, ModeScoreContext, ModeScoreResult } from './types.js';

const HOOKS: Record<DifficultyId, ModeDifficultyHooks> = {
  beginner: { scoreMultiplier: 0.9, timingWindowScale: 1.5, chartDensity: 0.5 },
  casual: { scoreMultiplier: 1, timingWindowScale: 1.1, chartDensity: 0.85 },
  pro: { scoreMultiplier: 1.3, timingWindowScale: 0.8, chartDensity: 1.2 },
  nightmare: { scoreMultiplier: 1.55, timingWindowScale: 0.6, chartDensity: 1.5 },
};

export const callAndResponseMode: GameModeDefinition = {
  id: 'CallAndResponse',
  label: 'Call & Response',
  tagline: 'Host call → players echo on cue with matching timing.',
  primaryRoles: ['vocalist', 'beat_tapper'],
  micPolicy: 'optional',
  tutorial: [
    {
      id: 'cr-1',
      title: 'Listen for the call',
      body: 'A call phrase appears first. Wait for the response window before acting.',
      roleHint: 'vocalist',
    },
    {
      id: 'cr-2',
      title: 'Echo on the response',
      body: 'Tap or phrase-submit during the response marker — not during the call.',
    },
    {
      id: 'cr-3',
      title: 'Match the pattern',
      body: 'Harder difficulties shrink the response window and add more call pairs.',
    },
  ],
  difficultyHooks: HOOKS,
  score(ctx: ModeScoreContext): ModeScoreResult {
    const hooks = HOOKS[ctx.difficulty];
    const matched = ctx.meta?.responseMatched === true;
    const bonus = matched ? 75 : 0;
    const points = Math.round(ctx.basePoints * hooks.scoreMultiplier) + bonus;
    return {
      points,
      message: matched ? 'Response locked!' : ctx.grade === 'miss' ? 'Missed response' : 'Partial echo',
      crowdBoost: matched ? 6 : ctx.grade === 'miss' ? -2 : 2,
    };
  },
};
