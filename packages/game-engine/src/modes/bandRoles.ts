import type { DifficultyId, PlayerRole } from '@beatlink/shared';
import type { GameModeDefinition, ModeDifficultyHooks, ModeScoreContext, ModeScoreResult } from './types.js';

const HOOKS: Record<DifficultyId, ModeDifficultyHooks> = {
  beginner: { scoreMultiplier: 0.85, timingWindowScale: 1.3, chartDensity: 0.7 },
  casual: { scoreMultiplier: 1, timingWindowScale: 1, chartDensity: 1 },
  pro: { scoreMultiplier: 1.2, timingWindowScale: 0.8, chartDensity: 1.3 },
  nightmare: { scoreMultiplier: 1.45, timingWindowScale: 0.6, chartDensity: 1.65 },
};

const ROLE_BONUS: Record<PlayerRole, number> = {
  beat_tapper: 10,
  vocalist: 25,
  hype_captain: 15,
};

export const bandRolesMode: GameModeDefinition = {
  id: 'BandRoles',
  label: 'Band Roles',
  tagline: 'Full band — tapper, vocalist, and hype captain score together.',
  primaryRoles: ['beat_tapper', 'vocalist', 'hype_captain'],
  micPolicy: 'optional',
  tutorial: [
    {
      id: 'br-1',
      title: 'Pick your seat',
      body: 'Each player chooses Beat Tapper, Vocalist, or Hype Captain before ready-up.',
    },
    {
      id: 'br-2',
      title: 'Stay in your lane',
      body: 'Only role-matched inputs score. Cross-role spam is ignored.',
      roleHint: 'beat_tapper',
    },
    {
      id: 'br-3',
      title: 'Team meter',
      body: 'Role bonuses stack into the team score — cover all three roles for max energy.',
    },
  ],
  difficultyHooks: HOOKS,
  score(ctx: ModeScoreContext): ModeScoreResult {
    const hooks = HOOKS[ctx.difficulty];
    const role = (ctx.meta?.role as PlayerRole | undefined) ?? 'beat_tapper';
    const roleBonus = ROLE_BONUS[role] ?? 0;
    const covered = ctx.meta?.bandCoverage === true ? 40 : 0;
    const points = Math.round(ctx.basePoints * hooks.scoreMultiplier) + roleBonus + covered;
    return {
      points,
      message: covered ? `Band locked · ${role}` : `Band hit · ${role}`,
      crowdBoost: covered ? 7 : ctx.grade === 'miss' ? -1 : 3,
    };
  },
};
