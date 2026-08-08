import type { DifficultyId } from '@beatlink/shared';
import type {
  GameModeDefinition,
  ModeDifficultyHooks,
  ModeScoreContext,
  ModeScoreResult,
} from './types.js';
import { defaultModeA11y } from './types.js';

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
      body: 'Submit the phrase while the prompt is active. Mic pitch is optional beta DSP.',
      roleHint: 'vocalist',
      caption: 'Submit during the prompt window.',
    },
    {
      id: 'kp-2',
      title: 'No recording mode',
      body: 'Default karaoke path never records or uploads audio — timing-only scoring works offline.',
      caption: 'No mic recording by default.',
    },
    {
      id: 'kp-3',
      title: 'Placeholder lyrics only',
      body: 'Demo prompts are original placeholders — never copyrighted lyric text.',
      caption: 'Prompts are placeholders only.',
    },
    {
      id: 'kp-4',
      title: 'Rights-cleared audio',
      body: 'Analysis/DSP only runs on synthetic, public-domain, royalty-free, or attested uploads.',
      caption: 'Only rights-cleared audio.',
    },
    {
      id: 'kp-5',
      title: 'Results & replay',
      body: 'Results show phrase accuracy. Replay stores grades — never mic PCM.',
      caption: 'Replay excludes mic audio.',
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
  a11y: defaultModeA11y({
    captionsRequired: true,
    screenReaderHints: true,
    largerHitTargets: true,
  }),
  teams: {
    supportsTeams: true,
    defaultTeamSplit: 'solo',
    teamMeterCounts: true,
  },
  replay: { supported: true, includesMicAudio: false, maxFrames: 800 },
  telemetryKeys: ['tutorial', 'score', 'results', 'replay', 'dsp_synthetic'],
  buildResults(input) {
    return {
      modeId: 'KaraokePerformance',
      difficulty: input.difficulty,
      teamScore: input.teamScore,
      crowdMeter: input.crowdMeter,
      winningTeam: input.winningTeam,
      rows: input.rows,
      headline: 'Karaoke results (no recording)',
    };
  },
};
