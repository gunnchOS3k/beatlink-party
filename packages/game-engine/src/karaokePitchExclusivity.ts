/**
 * Karaoke pitch exclusivity — at most one seat may hold pitch claim.
 * Digital matrix only — not physical multi-mic LAN acceptance.
 */

export interface KaraokePitchSeatClaim {
  seatId: string;
  pitchActive: boolean;
}

export interface KaraokePitchExclusivityReport {
  activeSeatIds: string[];
  exclusiveOk: boolean;
  /** Always false when more than one seat claims pitch. */
  multiPitchAllowed: false;
  /** Always false. */
  physicalMultiMicAccepted: false;
  honestyBanner: string;
}

export const KARAOKE_PITCH_EXCLUSIVITY_HONESTY =
  'At most one digital pitch claim seat; concurrent multi-pitch rejected. Digital ≠ physical multi-mic.';

export function assessKaraokePitchExclusivity(
  seats: KaraokePitchSeatClaim[],
): KaraokePitchExclusivityReport {
  const activeSeatIds = seats
    .filter((s) => s.pitchActive === true)
    .map((s) => s.seatId);
  const exclusiveOk = activeSeatIds.length <= 1;
  return {
    activeSeatIds,
    exclusiveOk,
    multiPitchAllowed: false,
    physicalMultiMicAccepted: false,
    honestyBanner: `KARAOKE_PITCH_EXCLUSIVITY active=${activeSeatIds.length} ok=${exclusiveOk} seats=[${activeSeatIds.join(',') || '—'}] · multi_pitch=false · physical_multi_mic=false · ${KARAOKE_PITCH_EXCLUSIVITY_HONESTY}`,
  };
}
