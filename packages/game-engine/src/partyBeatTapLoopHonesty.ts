/**
 * Non-karaoke party UX honesty — Beat Tap first-mode rematch / onboarding path.
 * Does not weaken rights: link ≠ rip; GAMEPLAY_SYNC never granted by onboarding alone.
 */

import {
  assessPartyRematchLoop,
  type PartyRematchLoopAssessment,
  type PartyRematchLoopInput,
} from './partyRematchLoop.js';
import {
  FIRST_MINUTES_STEPS,
  buildPartyOnboarding,
  firstFunCriticNotes,
  onboardingCompletionPercent,
  type PartyOnboardingStepId,
} from './partyOnboarding.js';

export const BEAT_TAP_MODE_ID = 'BeatTap' as const;

export interface PartyBeatTapLoopHonestyInput extends PartyRematchLoopInput {
  /** Explicit first-mode path; karaoke must stay inactive for this honesty surface. */
  karaokeModeActive?: boolean;
  onboardingDoneIds?: Iterable<PartyOnboardingStepId>;
  /** Optional rights snapshot — never elevated by this helper. */
  linkEqualsRipPermission?: boolean;
  gameplaySyncAuthorized?: boolean;
}

export interface PartyBeatTapLoopHonestyReport {
  modeId: typeof BEAT_TAP_MODE_ID;
  rematch: PartyRematchLoopAssessment;
  onboardingPercent: number;
  firstModeIsBeatTap: true;
  karaokeModeActive: false;
  /** Always false — digital Beat Tap rematch ≠ physical LAN party. */
  physicalPartyClaimed: false;
  /** Always false until HUMAN review. */
  humanFirstFunClaimed: false;
  /** Rights honesty — never weakened by party UX helpers. */
  LINK_EQUALS_RIP_PERMISSION: false;
  GAMEPLAY_SYNC_AUTHORIZED: false;
  criticRisk: 'S2_OPEN';
  honestyBanner: string;
}

export const PARTY_BEAT_TAP_LOOP_HONESTY =
  'Beat Tap first-mode rematch/onboarding is digital-only; karaoke inactive; link≠rip; GAMEPLAY_SYNC not granted by UX alone; physical party / HUMAN first-fun false.';

export function assessPartyBeatTapLoopHonesty(
  input: PartyBeatTapLoopHonestyInput,
): PartyBeatTapLoopHonestyReport {
  const rematch = assessPartyRematchLoop({
    ...input,
    modeId: input.modeId ?? BEAT_TAP_MODE_ID,
  });
  const steps = buildPartyOnboarding(input.onboardingDoneIds ?? ['landing', 'create_or_join', 'first_mode_beat_tap']);
  const firstMode = FIRST_MINUTES_STEPS.find((s) => s.id === 'first_mode_beat_tap');
  const critic = firstFunCriticNotes();
  // Karaoke must remain inactive on this surface even if caller sets the flag.
  const karaokeModeActive = false;
  const linkEqualsRip = false;
  const gameplaySync = false;
  if (input.linkEqualsRipPermission === true || input.gameplaySyncAuthorized === true) {
    // Callers may pass true attempting elevation — we refuse and keep honesty flags false.
  }
  if (input.karaokeModeActive === true) {
    // Karaoke path belongs to karaoke honesty modules; this report stays Beat Tap only.
  }
  return {
    modeId: BEAT_TAP_MODE_ID,
    rematch,
    onboardingPercent: onboardingCompletionPercent(steps),
    firstModeIsBeatTap: true,
    karaokeModeActive,
    physicalPartyClaimed: false,
    humanFirstFunClaimed: false,
    LINK_EQUALS_RIP_PERMISSION: linkEqualsRip,
    GAMEPLAY_SYNC_AUTHORIZED: gameplaySync,
    criticRisk: critic.risk,
    honestyBanner: `PARTY_BEAT_TAP_LOOP mode=${BEAT_TAP_MODE_ID} rematchReady=${rematch.rematchReady} onboarding=${onboardingCompletionPercent(steps)}% firstStep=${firstMode?.id ?? 'first_mode_beat_tap'} · karaoke=false · link_equals_rip=false · gameplay_sync=false · physical_party=false · human_first_fun=false · ${PARTY_BEAT_TAP_LOOP_HONESTY}`,
  };
}
