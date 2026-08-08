import type { DifficultyId, GameModeId } from '@beatlink/shared';
import { GAME_MODE_IDS, emitTelemetry } from '@beatlink/shared';
import { beatTapMode } from './beatTap.js';
import { callAndResponseMode } from './callAndResponse.js';
import { karaokePerformanceMode } from './karaokePerformance.js';
import { bandRolesMode } from './bandRoles.js';
import { predictionTriviaMode } from './predictionTrivia.js';
import type {
  GameModeDefinition,
  ModeA11yProfile,
  ModeReplaySnapshot,
  ModeResultsBoard,
  ModeResultsRow,
  ModeScoreContext,
  ModeScoreResult,
  ModeTutorialStep,
} from './types.js';
import {
  a11ySettingsForMode,
  buildReplaySnapshot,
  hooksFor,
} from './types.js';
import type { AccessibilitySettings, TeamId, TimingGrade } from '@beatlink/shared';

const REGISTRY: Record<GameModeId, GameModeDefinition> = {
  BeatTap: beatTapMode,
  CallAndResponse: callAndResponseMode,
  KaraokePerformance: karaokePerformanceMode,
  BandRoles: bandRolesMode,
  PredictionTrivia: predictionTriviaMode,
};

export function listGameModes(): GameModeDefinition[] {
  return GAME_MODE_IDS.map((id) => REGISTRY[id]);
}

export function getGameMode(id: GameModeId): GameModeDefinition {
  return REGISTRY[id];
}

export function isGameModeId(value: string): value is GameModeId {
  return (GAME_MODE_IDS as string[]).includes(value);
}

export function scoreForMode(ctx: ModeScoreContext): ModeScoreResult {
  return getGameMode(ctx.modeId).score(ctx);
}

export function getModeTutorial(id: GameModeId): ModeTutorialStep[] {
  return getGameMode(id).tutorial;
}

export function getModeDifficultyHooks(id: GameModeId, difficulty: DifficultyId) {
  return hooksFor(getGameMode(id), difficulty);
}

export function getModeA11y(id: GameModeId): ModeA11yProfile {
  return getGameMode(id).a11y;
}

export function resolveModeA11ySettings(
  id: GameModeId,
  base: AccessibilitySettings,
): AccessibilitySettings {
  return a11ySettingsForMode(getGameMode(id).a11y, base);
}

export function assertModesComplete(): { complete: boolean; missing: GameModeId[] } {
  const missing = GAME_MODE_IDS.filter((id) => !REGISTRY[id]);
  return { complete: missing.length === 0, missing };
}

/** Beta depth gate — tutorials, a11y, teams, results, replay, telemetry on all modes. */
export function assertModesBetaDepth(): {
  complete: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  for (const id of GAME_MODE_IDS) {
    const mode = REGISTRY[id];
    if (!mode) {
      failures.push(`${id}:missing`);
      continue;
    }
    if (mode.tutorial.length < 5) failures.push(`${id}:tutorial_lt_5`);
    if (!mode.tutorial.every((s) => s.caption)) failures.push(`${id}:tutorial_captions`);
    if (!mode.a11y) failures.push(`${id}:a11y`);
    if (!mode.teams?.supportsTeams) failures.push(`${id}:teams`);
    if (!mode.replay?.supported || mode.replay.includesMicAudio !== false) {
      failures.push(`${id}:replay`);
    }
    if (!mode.telemetryKeys.includes('results') || !mode.telemetryKeys.includes('replay')) {
      failures.push(`${id}:telemetry`);
    }
    for (const d of ['beginner', 'casual', 'pro', 'nightmare'] as const) {
      const h = mode.difficultyHooks[d];
      if (!h || h.scoreMultiplier <= 0) failures.push(`${id}:difficulty_${d}`);
    }
    const board = mode.buildResults({
      difficulty: 'casual',
      teamScore: 0,
      crowdMeter: 50,
      winningTeam: null,
      rows: [],
    });
    if (board.modeId !== id) failures.push(`${id}:results`);
  }
  return { complete: failures.length === 0, failures };
}

export function emitModeTutorialTelemetry(modeId: GameModeId, roomCode = 'MODE'): void {
  const mode = getGameMode(modeId);
  emitTelemetry('mode_tutorial', roomCode, {
    modeId,
    steps: mode.tutorial.length,
  });
}

export function buildModeResultsBoard(
  modeId: GameModeId,
  input: {
    difficulty: DifficultyId;
    teamScore: number;
    crowdMeter: number;
    winningTeam: TeamId | 'tie' | null;
    rows: ModeResultsRow[];
  },
  roomCode = 'MODE',
): ModeResultsBoard {
  const board = getGameMode(modeId).buildResults(input);
  emitTelemetry('mode_results', roomCode, {
    modeId,
    rowCount: board.rows.length,
    winningTeam: board.winningTeam,
  });
  return board;
}

export function buildModeReplay(
  modeId: GameModeId,
  input: {
    difficulty: DifficultyId;
    durationMs: number;
    frames: Array<{
      atMs: number;
      playerId: string;
      grade: TimingGrade;
      points: number;
      noteId?: string;
    }>;
  },
  roomCode = 'MODE',
): ModeReplaySnapshot {
  const mode = getGameMode(modeId);
  const snap = buildReplaySnapshot({
    modeId,
    difficulty: input.difficulty,
    durationMs: input.durationMs,
    frames: input.frames,
    maxFrames: mode.replay.maxFrames,
  });
  emitTelemetry('mode_replay', roomCode, {
    modeId,
    frames: snap.frames.length,
    checksum: snap.checksum,
    includesMicAudio: false,
  });
  return snap;
}

export type {
  GameModeDefinition,
  ModeTutorialStep,
  ModeDifficultyHooks,
  ModeScoreContext,
  ModeScoreResult,
  ModeA11yProfile,
  ModeTeamsProfile,
  ModeResultsBoard,
  ModeResultsRow,
  ModeReplaySnapshot,
  ModeReplayFrame,
  ModeReplayProfile,
} from './types.js';
export {
  hooksFor,
  defaultModeA11y,
  a11ySettingsForMode,
  buildReplaySnapshot,
  replayChecksum,
} from './types.js';
