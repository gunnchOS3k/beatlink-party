/**
 * Karaoke vocalist seat handoff — pitch does not transfer; re-grant required.
 * Digital role swap only — not physical mic / LAN acceptance.
 */

import {
  applyMicMatrixAction,
  createMicMatrixState,
  type MicMatrixState,
} from './karaokeMicMatrix.js';

export interface KaraokeVocalistHandoffInput {
  fromSeatId: string;
  toSeatId: string;
  /** Prior seat had an active pitch claim before handoff. */
  priorPitchActive?: boolean;
}

export interface KaraokeVocalistHandoffReport {
  fromSeatId: string;
  toSeatId: string;
  pitchTransferred: false;
  reGrantRequired: true;
  toSeatPitch: false;
  toSeatA11y: true;
  /** Always false. */
  physicalMicAccepted: false;
  honestyBanner: string;
  toSeatState: MicMatrixState;
}

export const KARAOKE_VOCALIST_HANDOFF_HONESTY =
  'Vocalist seat handoff does not transfer pitch claim; destination seat needs re-grant + continuous live. Digital ≠ physical mic.';

/**
 * Handoff clears any prior pitch; destination starts at prompt with a11y only.
 */
export function assessKaraokeVocalistHandoff(
  input: KaraokeVocalistHandoffInput,
  nowMs = Date.now(),
): KaraokeVocalistHandoffReport {
  let from = createMicMatrixState();
  if (input.priorPitchActive) {
    from = applyMicMatrixAction(from, 'grant', nowMs);
    from = {
      ...from,
      microphonePitchAnalysis: true,
      a11yFallbackActive: false,
    };
  }
  // Leaving seat revokes — pitch must not stick on destination.
  applyMicMatrixAction(from, 'revoke', nowMs + 1);
  const toSeat = createMicMatrixState();
  return {
    fromSeatId: input.fromSeatId,
    toSeatId: input.toSeatId,
    pitchTransferred: false,
    reGrantRequired: true,
    toSeatPitch: false,
    toSeatA11y: true,
    physicalMicAccepted: false,
    honestyBanner: `KARAOKE_HANDOFF ${input.fromSeatId}→${input.toSeatId} pitchTransferred=false reGrant=true · physical_mic=false · ${KARAOKE_VOCALIST_HANDOFF_HONESTY}`,
    toSeatState: toSeat,
  };
}
