import type {
  AccessibilitySettings,
  DifficultyId,
  GameModeId,
  PlayerRole,
  TeamId,
  TimingGrade,
} from '@beatlink/shared';

export interface ModeTutorialStep {
  id: string;
  title: string;
  body: string;
  /** Optional role focus for band / karaoke tutorials. */
  roleHint?: PlayerRole;
  /** Captions / SR-friendly short line for a11y. */
  caption?: string;
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

/** Accessibility profile per mode — Beta digital depth. */
export interface ModeA11yProfile {
  /** Prefer captions over audio-only cues. */
  captionsRequired: boolean;
  /** Color-blind safe grade mapping recommended. */
  colorBlindSafeGrades: boolean;
  /** Larger hit targets recommended for this mode. */
  largerHitTargets: boolean;
  /** Screen-reader phase / prompt announcements. */
  screenReaderHints: boolean;
  /** Reduce motion for note approach animations. */
  reduceMotionFriendly: boolean;
  /** High-contrast judgment line recommended. */
  highContrastJudgment: boolean;
}

/** Team scoring posture for the mode. */
export interface ModeTeamsProfile {
  supportsTeams: boolean;
  defaultTeamSplit: 'auto_ab' | 'solo' | 'role_lanes';
  /** Whether team meter contributes to winningTeam. */
  teamMeterCounts: boolean;
}

export interface ModeResultsRow {
  playerId: string;
  displayName: string;
  teamId: TeamId;
  score: number;
  accuracy: number;
  maxStreak: number;
  role: PlayerRole | null;
}

export interface ModeResultsBoard {
  modeId: GameModeId;
  difficulty: DifficultyId;
  teamScore: number;
  crowdMeter: number;
  winningTeam: TeamId | 'tie' | null;
  rows: ModeResultsRow[];
  headline: string;
}

/** Deterministic replay frame — timing inputs only (no mic blobs). */
export interface ModeReplayFrame {
  atMs: number;
  playerId: string;
  grade: TimingGrade;
  points: number;
  noteId?: string;
}

export interface ModeReplaySnapshot {
  modeId: GameModeId;
  difficulty: DifficultyId;
  durationMs: number;
  frames: ModeReplayFrame[];
  checksum: string;
}

export interface ModeReplayProfile {
  supported: boolean;
  /** Replay never includes mic PCM / recordings. */
  includesMicAudio: false;
  maxFrames: number;
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
  /** Beta depth — a11y / teams / results / replay / telemetry. */
  a11y: ModeA11yProfile;
  teams: ModeTeamsProfile;
  replay: ModeReplayProfile;
  /** Telemetry event name suffixes emitted for this mode. */
  telemetryKeys: string[];
  /** Build results board from scored rows. */
  buildResults(input: {
    difficulty: DifficultyId;
    teamScore: number;
    crowdMeter: number;
    winningTeam: TeamId | 'tie' | null;
    rows: ModeResultsRow[];
  }): ModeResultsBoard;
}

export function hooksFor(
  def: GameModeDefinition,
  difficulty: DifficultyId,
): ModeDifficultyHooks {
  return def.difficultyHooks[difficulty];
}

export function defaultModeA11y(partial: Partial<ModeA11yProfile> = {}): ModeA11yProfile {
  return {
    captionsRequired: true,
    colorBlindSafeGrades: true,
    largerHitTargets: false,
    screenReaderHints: true,
    reduceMotionFriendly: true,
    highContrastJudgment: false,
    ...partial,
  };
}

export function a11ySettingsForMode(
  profile: ModeA11yProfile,
  base: AccessibilitySettings,
): AccessibilitySettings {
  return {
    reduceMotion: base.reduceMotion || profile.reduceMotionFriendly,
    highContrast: base.highContrast || profile.highContrastJudgment,
    largerHitTargets: base.largerHitTargets || profile.largerHitTargets,
    captions: base.captions || profile.captionsRequired,
    colorBlindSafe: base.colorBlindSafe || profile.colorBlindSafeGrades,
    screenReaderHints: base.screenReaderHints || profile.screenReaderHints,
  };
}

/** Non-crypto checksum for replay integrity (browser-safe). */
export function replayChecksum(frames: ModeReplayFrame[]): string {
  let h = 2166136261;
  for (const f of frames) {
    const s = `${f.atMs}|${f.playerId}|${f.grade}|${f.points}|${f.noteId ?? ''}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function buildReplaySnapshot(input: {
  modeId: GameModeId;
  difficulty: DifficultyId;
  durationMs: number;
  frames: ModeReplayFrame[];
  maxFrames: number;
}): ModeReplaySnapshot {
  const frames = input.frames.slice(0, input.maxFrames);
  return {
    modeId: input.modeId,
    difficulty: input.difficulty,
    durationMs: input.durationMs,
    frames,
    checksum: replayChecksum(frames),
  };
}
