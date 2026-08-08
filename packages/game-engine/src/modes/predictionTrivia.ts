import type { DifficultyId } from '@beatlink/shared';
import type {
  GameModeDefinition,
  ModeDifficultyHooks,
  ModeScoreContext,
  ModeScoreResult,
} from './types.js';
import { defaultModeA11y } from './types.js';

const HOOKS: Record<DifficultyId, ModeDifficultyHooks> = {
  beginner: {
    scoreMultiplier: 1,
    timingWindowScale: 1.2,
    chartDensity: 0.4,
    predictionChoices: 2,
  },
  casual: {
    scoreMultiplier: 1.1,
    timingWindowScale: 1,
    chartDensity: 0.55,
    predictionChoices: 3,
  },
  pro: {
    scoreMultiplier: 1.35,
    timingWindowScale: 0.85,
    chartDensity: 0.7,
    predictionChoices: 4,
  },
  nightmare: {
    scoreMultiplier: 1.6,
    timingWindowScale: 0.7,
    chartDensity: 0.85,
    predictionChoices: 5,
  },
};

export const predictionTriviaMode: GameModeDefinition = {
  id: 'PredictionTrivia',
  label: 'Prediction Trivia',
  tagline: 'Predict the next section, drop, or crowd call before it hits.',
  primaryRoles: ['hype_captain', 'beat_tapper'],
  micPolicy: 'disabled',
  tutorial: [
    {
      id: 'pt-1',
      title: 'Read the section',
      body: 'Before each section change, choose what comes next from the options.',
      roleHint: 'hype_captain',
      caption: 'Choose the next section before it hits.',
    },
    {
      id: 'pt-2',
      title: 'Lock before the beat',
      body: 'Predictions must lock before the section start — late locks miss.',
      caption: 'Lock your prediction early.',
    },
    {
      id: 'pt-3',
      title: 'Harder = more choices',
      body: 'Nightmare adds more decoy options. Correct predictions boost the crowd meter.',
      caption: 'More decoys on harder difficulties.',
    },
    {
      id: 'pt-4',
      title: 'Team predictions',
      body: 'Team A/B can compete on prediction accuracy; solo seats keep individual score.',
      caption: 'Teams can compete on predictions.',
    },
    {
      id: 'pt-5',
      title: 'Replay & telemetry',
      body: 'Replay stores lock times and correctness. Telemetry never includes display names.',
      caption: 'Replay stores locks, not names.',
    },
  ],
  difficultyHooks: HOOKS,
  score(ctx: ModeScoreContext): ModeScoreResult {
    const hooks = HOOKS[ctx.difficulty];
    const correct = ctx.meta?.predictionCorrect === true;
    const base = correct ? 250 : 0;
    const points = Math.round(base * hooks.scoreMultiplier);
    return {
      points,
      message: correct ? 'Prediction correct!' : 'Wrong prediction',
      crowdBoost: correct ? 8 : -2,
    };
  },
  a11y: defaultModeA11y({
    largerHitTargets: true,
    captionsRequired: true,
    reduceMotionFriendly: true,
  }),
  teams: {
    supportsTeams: true,
    defaultTeamSplit: 'auto_ab',
    teamMeterCounts: true,
  },
  replay: { supported: true, includesMicAudio: false, maxFrames: 400 },
  telemetryKeys: ['tutorial', 'score', 'results', 'replay', 'prediction'],
  buildResults(input) {
    return {
      modeId: 'PredictionTrivia',
      difficulty: input.difficulty,
      teamScore: input.teamScore,
      crowdMeter: input.crowdMeter,
      winningTeam: input.winningTeam,
      rows: input.rows,
      headline: 'Prediction Trivia results',
    };
  },
};
