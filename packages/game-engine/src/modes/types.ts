import type { DifficultyId, GameModeId, PlayerRole, TimingGrade } from '@beatlink/shared';

export interface ModeTutorialStep {
  id: string;
  title: string;
  body: string;
  /** Optional role focus for band / karaoke tutorials. */
  roleHint?: PlayerRole;
}

export interface ModeDifficultyHooks {
  /** Multiplier applied to base score points (1 = casual baseline). */
  scoreMultiplier: number;
  /** Timing window scale (>1 = more forgiving). */
  timingWindowScale: number;
  /** Relative note / prompt density for chart generation. */
  chartDensity: number;
  /** Max prediction options for trivia modes. */
  predictionChoices?: number;
}

export interface ModeScoreContext {
  modeId: GameModeId;
  difficulty: DifficultyId;
  grade: TimingGrade;
  basePoints: number;
  streak: number;
  /** Mode-specific payload (e.g. prediction correct, call matched). */
  meta?: Record<string, string | number | boolean | null>;
}

export interface ModeScoreResult {
  points: number;
  message: string;
  crowdBoost: number;
}

export interface GameModeDefinition {
  id: GameModeId;
  label: string;
  tagline: string;
  /** Primary roles engaged by this mode. */
  primaryRoles: PlayerRole[];
  tutorial: ModeTutorialStep[];
  difficultyHooks: Record<DifficultyId, ModeDifficultyHooks>;
  /** Apply mode-specific scoring on top of shared timing grades. */
  score(ctx: ModeScoreContext): ModeScoreResult;
  /** Whether mic capture is optional / required / disabled for this mode. */
  micPolicy: 'disabled' | 'optional' | 'prompt_only';
}

export function hooksFor(
  def: GameModeDefinition,
  difficulty: DifficultyId,
): ModeDifficultyHooks {
  return def.difficultyHooks[difficulty];
}
