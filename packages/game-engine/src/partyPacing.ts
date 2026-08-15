/**
 * Party session pacing — round transitions, results dwell, rematch cadence.
 */

export type PartyPaceEvent =
  | 'lobby_ready'
  | 'calibration_start'
  | 'countdown'
  | 'round_playing'
  | 'audience_pulse'
  | 'pause'
  | 'resume'
  | 'results'
  | 'rematch'
  | 'host_migrated'
  | 'disconnect_reconnect';

export interface PacePulse {
  event: PartyPaceEvent;
  detail: string;
  at: number;
}

const pulses: PacePulse[] = [];
const MAX = 80;

export function pulsePartyPace(event: PartyPaceEvent, detail: string): PacePulse {
  const row: PacePulse = { event, detail, at: Date.now() };
  pulses.push(row);
  if (pulses.length > MAX) pulses.shift();
  return row;
}

export function getPartyPaceHistory(): readonly PacePulse[] {
  return pulses;
}

export function clearPartyPaceHistory(): void {
  pulses.length = 0;
}

export const SUGGESTED_RESULTS_DWELL_MS = 4000;
export const SUGGESTED_COUNTDOWN_SECONDS = 3;
