import type { DifficultyId, GameModeId } from '@beatlink/shared';
import { GAME_MODE_IDS } from '@beatlink/shared';
import { beatTapMode } from './beatTap.js';
import { callAndResponseMode } from './callAndResponse.js';
import { karaokePerformanceMode } from './karaokePerformance.js';
import { bandRolesMode } from './bandRoles.js';
import { predictionTriviaMode } from './predictionTrivia.js';
import type { GameModeDefinition, ModeScoreContext, ModeScoreResult } from './types.js';
import { hooksFor } from './types.js';

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

export function getModeTutorial(id: GameModeId) {
  return getGameMode(id).tutorial;
}

export function getModeDifficultyHooks(id: GameModeId, difficulty: DifficultyId) {
  return hooksFor(getGameMode(id), difficulty);
}

export function assertModesComplete(): { complete: boolean; missing: GameModeId[] } {
  const missing = GAME_MODE_IDS.filter((id) => !REGISTRY[id]);
  return { complete: missing.length === 0, missing };
}

export type { GameModeDefinition, ModeTutorialStep, ModeDifficultyHooks, ModeScoreContext, ModeScoreResult } from './types.js';
export { hooksFor } from './types.js';
