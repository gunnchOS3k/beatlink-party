/**
 * Karaoke secure-context continuity — losing secure context clears pitch.
 * Digital browser gate only — not physical mic / LAN acceptance.
 */

import {
  assessKaraokeSecureContext,
  type KaraokeSecureContextAssessment,
} from './karaokeSecureContext.js';

export interface KaraokeSecureContextContinuityInput {
  wasPitchActive: boolean;
  isSecureContext: boolean;
  protocol?: string;
}

export interface KaraokeSecureContextContinuityReport {
  secure: KaraokeSecureContextAssessment;
  wasPitchActive: boolean;
  pitchClearedOnInsecure: boolean;
  pitchMayContinue: boolean;
  /** Always false. */
  physicalMicAccepted: false;
  honestyBanner: string;
}

export const KARAOKE_SECURE_CONTEXT_CONTINUITY_HONESTY =
  'Pitch clears when secure context is lost; insecure/non-HTTPS never continues pitch. Digital ≠ physical mic.';

export function assessKaraokeSecureContextContinuity(
  input: KaraokeSecureContextContinuityInput,
): KaraokeSecureContextContinuityReport {
  const secure = assessKaraokeSecureContext({
    isSecureContext: input.isSecureContext,
    protocol: input.protocol,
  });
  const pitchClearedOnInsecure =
    input.wasPitchActive === true && secure.micPathEligible !== true;
  const pitchMayContinue =
    input.wasPitchActive === true && secure.micPathEligible === true;
  return {
    secure,
    wasPitchActive: input.wasPitchActive === true,
    pitchClearedOnInsecure,
    pitchMayContinue,
    physicalMicAccepted: false,
    honestyBanner: `KARAOKE_SECURE_CONTINUITY pitchWas=${input.wasPitchActive === true} mayContinue=${pitchMayContinue} clearedOnInsecure=${pitchClearedOnInsecure} · physical_mic=false · ${KARAOKE_SECURE_CONTEXT_CONTINUITY_HONESTY}`,
  };
}
