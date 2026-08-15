/**
 * A/V feedback hooks for party moments — fail-soft; no DRM media rip.
 */

export type AvFeedbackKind =
  | 'join_chime'
  | 'calibration_tick'
  | 'hit_flash'
  | 'miss_soft'
  | 'audience_hype'
  | 'results_sting'
  | 'achievement_toast'
  | 'disconnect_warn'
  | 'host_migrated'
  | 'rematch_ready';

export interface AvFeedbackEvent {
  kind: AvFeedbackKind;
  message: string;
  played: boolean;
  at: number;
}

const history: AvFeedbackEvent[] = [];
const MAX = 80;
let enabled = true;

export function setAvFeedbackEnabled(value: boolean): void {
  enabled = value;
}

export function presentAvFeedback(kind: AvFeedbackKind, message: string): AvFeedbackEvent {
  const event: AvFeedbackEvent = {
    kind,
    message,
    played: enabled,
    at: Date.now(),
  };
  history.push(event);
  if (history.length > MAX) history.shift();
  return event;
}

export function getAvFeedbackHistory(): readonly AvFeedbackEvent[] {
  return history;
}

export function clearAvFeedbackHistory(): void {
  history.length = 0;
}
