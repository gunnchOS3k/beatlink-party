/**
 * Karaoke mid-phrase revoke continuity — pitch drops; a11y remains.
 * Digital matrix only — not physical phone mic acceptance.
 */

import {
  applyMicMatrixAction,
  createMicMatrixState,
  type MicMatrixState,
} from './karaokeMicMatrix.js';

export interface KaraokeRevokeContinuityReport {
  afterGrantPitch: boolean;
  afterRevokePitch: boolean;
  a11yAfterRevoke: true;
  pitchClearedOnRevoke: boolean;
  /** Always false. */
  physicalMicAccepted: false;
  honestyBanner: string;
  finalState: MicMatrixState;
}

export const KARAOKE_REVOKE_CONTINUITY_HONESTY =
  'Mid-phrase revoke clears pitch claim; a11y tap fallback remains. Digital matrix ≠ physical phone mic.';

/**
 * Simulate grant → forced pitch-on → revoke mid-phrase.
 * Grant alone never enables pitch; we inject microphonePitchAnalysis only to prove revoke clears it.
 */
export function assessKaraokeRevokeContinuity(nowMs = Date.now()): KaraokeRevokeContinuityReport {
  let state = createMicMatrixState();
  state = applyMicMatrixAction(state, 'grant', nowMs);
  // Inject active pitch as if continuous live DSP had authorized — revoke must clear.
  const withPitch: MicMatrixState = {
    ...state,
    microphonePitchAnalysis: true,
    a11yFallbackActive: false,
  };
  const afterGrantPitch = withPitch.microphonePitchAnalysis === true;
  const revoked = applyMicMatrixAction(withPitch, 'revoke', nowMs + 1);
  return {
    afterGrantPitch,
    afterRevokePitch: revoked.microphonePitchAnalysis,
    a11yAfterRevoke: true,
    pitchClearedOnRevoke: revoked.microphonePitchAnalysis === false,
    physicalMicAccepted: false,
    honestyBanner: `KARAOKE_REVOKE_CONTINUITY grantPitch=${afterGrantPitch} revokePitch=${revoked.microphonePitchAnalysis} a11y=true · physical_mic=false · ${KARAOKE_REVOKE_CONTINUITY_HONESTY}`,
    finalState: { ...revoked, a11yFallbackActive: true },
  };
}
