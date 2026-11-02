/**
 * Non-karaoke party UX honesty — Band Roles rematch path.
 * Does not weaken rights: link ≠ rip; GAMEPLAY_SYNC never granted by onboarding alone.
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

export const BAND_ROLES_MODE_ID = 'BandRoles' as const;

export interface PartyBandRolesLoopHonestyInput extends PartyRematchLoopInput {
  karaokeModeActive?: boolean;
  onboardingDoneIds?: Iterable<PartyOnboardingStepId>;
  linkEqualsRipPermission?: boolean;
  gameplaySyncAuthorized?: boolean;
}

export interface PartyBandRolesLoopHonestyReport {
  modeId: typeof BAND_ROLES_MODE_ID;
  rematch: PartyRematchLoopAssessment;
  onboardingPercent: number;
  firstModeIsBeatTap: true;
  bandRolesActive: true;
  karaokeModeActive: false;
  physicalPartyClaimed: false;
  humanFirstFunClaimed: false;
  LINK_EQUALS_RIP_PERMISSION: false;
  GAMEPLAY_SYNC_AUTHORIZED: false;
  criticRisk: 'S2_OPEN';
  honestyBanner: string;
}

export const PARTY_BAND_ROLES_LOOP_HONESTY =
  'Band Roles rematch/onboarding is digital-only; karaoke inactive; link≠rip; GAMEPLAY_SYNC not granted by UX alone; physical LAN IV packet untouched/PREPARED; HUMAN first-fun false.';

export function assessPartyBandRolesLoopHonesty(
  input: PartyBandRolesLoopHonestyInput,
): PartyBandRolesLoopHonestyReport {
  const rematch = assessPartyRematchLoop({
    ...input,
    modeId: input.modeId ?? BAND_ROLES_MODE_ID,
  });
  const steps = buildPartyOnboarding(
    input.onboardingDoneIds ?? [
      'landing',
      'create_or_join',
      'device_role',
      'media_local_catalog',
      'first_mode_beat_tap',
      'score_and_results',
    ],
  );
  const critic = firstFunCriticNotes();
  if (input.linkEqualsRipPermission === true || input.gameplaySyncAuthorized === true) {
    // Refuse elevation attempts.
  }
  if (input.karaokeModeActive === true) {
    // Karaoke stays on karaoke honesty modules.
  }
  return {
    modeId: BAND_ROLES_MODE_ID,
    rematch,
    onboardingPercent: onboardingCompletionPercent(steps),
    firstModeIsBeatTap: true,
    bandRolesActive: true,
    karaokeModeActive: false,
    physicalPartyClaimed: false,
    humanFirstFunClaimed: false,
    LINK_EQUALS_RIP_PERMISSION: false,
    GAMEPLAY_SYNC_AUTHORIZED: false,
    criticRisk: critic.risk,
    honestyBanner: `PARTY_BAND_ROLES_LOOP mode=${BAND_ROLES_MODE_ID} rematchReady=${rematch.rematchReady} onboarding=${onboardingCompletionPercent(steps)}% · karaoke=false · link_equals_rip=false · gameplay_sync=false · physical_party=false · human_first_fun=false · ${PARTY_BAND_ROLES_LOOP_HONESTY}`,
  };
}
