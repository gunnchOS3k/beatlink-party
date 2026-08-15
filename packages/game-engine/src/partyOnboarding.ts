/**
 * First-minutes party onboarding — guided path without developer babysitting.
 * Human first-fun-in-minutes remains S2 / HUMAN_PENDING.
 */

export type PartyOnboardingStepId =
  | 'landing'
  | 'create_or_join'
  | 'audience_optional'
  | 'device_role'
  | 'media_local_catalog'
  | 'latency_calibration'
  | 'first_mode_beat_tap'
  | 'score_and_results';

export interface PartyOnboardingStep {
  id: PartyOnboardingStepId;
  label: string;
  suggestedSeconds: number;
  done: boolean;
}

export const FIRST_MINUTES_STEPS: readonly Omit<PartyOnboardingStep, 'done'>[] = [
  { id: 'landing', label: 'Open BeatLink and pick Host / Join / Audience', suggestedSeconds: 30 },
  { id: 'create_or_join', label: 'Create a room or join with a code', suggestedSeconds: 45 },
  { id: 'audience_optional', label: 'Optional: seat an audience member', suggestedSeconds: 30 },
  { id: 'device_role', label: 'Pick Beat Tapper / Vocalist / Hype Captain', suggestedSeconds: 30 },
  { id: 'media_local_catalog', label: 'Select a local/open catalog song (no DRM rip)', suggestedSeconds: 40 },
  { id: 'latency_calibration', label: 'Run latency calibration once', suggestedSeconds: 45 },
  { id: 'first_mode_beat_tap', label: 'Play Beat Tap as the first fun loop', suggestedSeconds: 90 },
  { id: 'score_and_results', label: 'See scores/awards and rematch or leave', suggestedSeconds: 40 },
];

export function buildPartyOnboarding(doneIds: Iterable<PartyOnboardingStepId>): PartyOnboardingStep[] {
  const done = new Set(doneIds);
  return FIRST_MINUTES_STEPS.map((s) => ({ ...s, done: done.has(s.id) }));
}

export function firstMinutesEstimate(): number {
  return Math.ceil(FIRST_MINUTES_STEPS.reduce((sum, s) => sum + s.suggestedSeconds, 0) / 60);
}

export function onboardingCompletionPercent(steps: PartyOnboardingStep[]): number {
  if (!steps.length) return 0;
  return Math.round((100 * steps.filter((s) => s.done).length) / steps.length);
}

export function firstFunCriticNotes(): {
  engineered_toward: 'first_minutes_without_developer';
  not_claimed: 'HUMAN_FIRST_FUN';
  risk: 'S2_OPEN';
} {
  return {
    engineered_toward: 'first_minutes_without_developer',
    not_claimed: 'HUMAN_FIRST_FUN',
    risk: 'S2_OPEN',
  };
}
