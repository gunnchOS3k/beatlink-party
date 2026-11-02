/**
 * Non-karaoke party UX honesty — Prediction Trivia rematch path.
 * Does not weaken rights: link ≠ rip; GAMEPLAY_SYNC never granted by UX alone.
 */

import {
  assessPartyRematchLoop,
  type PartyRematchLoopAssessment,
  type PartyRematchLoopInput,
} from './partyRematchLoop.js';
import {
  buildPartyOnboarding,
  firstFunCriticNotes,
  onboardingCompletionPercent,
  type PartyOnboardingStepId,
} from './partyOnboarding.js';

export const PREDICTION_TRIVIA_MODE_ID = 'PredictionTrivia' as const;

export interface PartyPredictionTriviaLoopHonestyInput extends PartyRematchLoopInput {
  karaokeModeActive?: boolean;
  onboardingDoneIds?: Iterable<PartyOnboardingStepId>;
  linkEqualsRipPermission?: boolean;
  gameplaySyncAuthorized?: boolean;
}

export interface PartyPredictionTriviaLoopHonestyReport {
  modeId: typeof PREDICTION_TRIVIA_MODE_ID;
  rematch: PartyRematchLoopAssessment;
  onboardingPercent: number;
  firstModeIsBeatTap: true;
  predictionTriviaActive: true;
  karaokeModeActive: false;
  physicalPartyClaimed: false;
  humanFirstFunClaimed: false;
  LINK_EQUALS_RIP_PERMISSION: false;
  GAMEPLAY_SYNC_AUTHORIZED: false;
  criticRisk: 'S2_OPEN';
  honestyBanner: string;
}

export const PARTY_PREDICTION_TRIVIA_LOOP_HONESTY =
  'Prediction Trivia rematch/onboarding is digital-only; karaoke inactive; link≠rip; GAMEPLAY_SYNC not granted by UX alone; physical LAN IV packet untouched/PREPARED; HUMAN first-fun false.';

export function assessPartyPredictionTriviaLoopHonesty(
  input: PartyPredictionTriviaLoopHonestyInput,
): PartyPredictionTriviaLoopHonestyReport {
  const rematch = assessPartyRematchLoop({
    ...input,
    modeId: input.modeId ?? PREDICTION_TRIVIA_MODE_ID,
  });
  const steps = buildPartyOnboarding(
    input.onboardingDoneIds ?? [
      'landing',
      'create_or_join',
      'media_local_catalog',
      'first_mode_beat_tap',
      'score_and_results',
    ],
  );
  const critic = firstFunCriticNotes();
  if (input.linkEqualsRipPermission === true || input.gameplaySyncAuthorized === true) {
    // Refuse elevation.
  }
  if (input.karaokeModeActive === true) {
    // Karaoke stays on karaoke modules.
  }
  return {
    modeId: PREDICTION_TRIVIA_MODE_ID,
    rematch,
    onboardingPercent: onboardingCompletionPercent(steps),
    firstModeIsBeatTap: true,
    predictionTriviaActive: true,
    karaokeModeActive: false,
    physicalPartyClaimed: false,
    humanFirstFunClaimed: false,
    LINK_EQUALS_RIP_PERMISSION: false,
    GAMEPLAY_SYNC_AUTHORIZED: false,
    criticRisk: critic.risk,
    honestyBanner: `PARTY_PREDICTION_TRIVIA_LOOP mode=${PREDICTION_TRIVIA_MODE_ID} rematchReady=${rematch.rematchReady} onboarding=${onboardingCompletionPercent(steps)}% · karaoke=false · link_equals_rip=false · gameplay_sync=false · physical_party=false · human_first_fun=false · ${PARTY_PREDICTION_TRIVIA_LOOP_HONESTY}`,
  };
}
