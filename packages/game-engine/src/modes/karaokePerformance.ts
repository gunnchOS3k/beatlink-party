import type { DifficultyId } from '@beatlink/shared';
import type { GameModeDefinition, ModeDifficultyHooks, ModeScoreContext, ModeScoreResult } from './types.js';

const HOOKS: Record<DifficultyId, ModeDifficultyHooks> = {
  beginner: { scoreMultiplier: 0.9, timingWindowScale: 1.35, chartDensity: 0.6 },
  casual: { scoreMultiplier: 1.05, timingWindowScale: 1, chartDensity: 0.9 },
  pro: { scoreMultiplier: 1.35, timingWindowScale: 0.7, chartDensity: 1.25 },
  nightmare: { scoreMultiplier: 1.6, timingWindowScale: 0.5, chartDensity: 1.6 },
};

export const karaokePerformanceMode: GameModeDefinition = {
  id: 'KaraokePerformance',
  label: 'Karaoke Performance',
  tagline: 'Phrase prompts on cue — mic optional; no-recording by default.',
  primaryRoles: ['vocalist'],
  micPolicy: 'prompt_only',
  tutorial: [
    {
      id: 'kp-1',
      title: 'Prompt timing',
      body: 'Submit the phrase while the prompt is active. Mic pitch is optional alpha.',
      roleHint: 'vocalist',
    },
    {
      id: 'kp-2',
      title: 'No recording mode',
      body: 'Default karaoke path never records or uploads audio — timing-only scoring works offline.',
    },
    {
      id: 'kp-3',
      title: 'Placeholder lyrics only',
      body: 'Demo prompts are original placeholders — never copyrighted lyric text.',
    },
  ],
  difficultyHooks: HOOKS,
  score(ctx: ModeScoreContext): ModeScoreResult {
    const hooks = HOOKS[ctx.difficulty];
    const noRecording = ctx.meta?.noRecording !== false;
    const points = Math.round((ctx.basePoints + 50) * hooks.scoreMultiplier);
    return {
      points,
      message: noRecording
        ? ctx.grade === 'miss'
          ? 'Missed phrase'
          : 'Phrase hit (no recording)'
        : 'Phrase hit',
      crowdBoost: ctx.grade === 'miss' ? -1 : 5,
    };
  },
};
