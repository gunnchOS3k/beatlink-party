/**
 * Karaoke phrase continuity — timing windows + a11y fallback.
 * Phrase coverage ≠ physical mic; synthetic/timing path ≠ commercial clearance.
 */

import type { VocalPrompt } from '@beatlink/shared';
import { buildKaraokePromptState, canSubmitVocalPhrase } from './karaoke.js';

export interface KaraokePhraseContinuityInput {
  prompts: VocalPrompt[];
  /** Sample game times across the round (ms). */
  sampleTimesMs: number[];
  pitchAnalysisActive?: boolean;
}

export interface KaraokePhraseContinuityReport {
  phraseCount: number;
  windowsHit: number;
  submittableSamples: number;
  a11yFallbackAvailable: true;
  pitchAnalysisActive: boolean;
  /** Always false — phrase timing ≠ physical mic acceptance. */
  physicalMicAccepted: false;
  continuityOk: boolean;
  honestyBanner: string;
}

export const KARAOKE_PHRASE_CONTINUITY_HONESTY =
  'Karaoke phrase timing + a11y fallback ≠ physical mic acceptance; pitchAnalysisActive never implies commercial clearance.';

export function assessKaraokePhraseContinuity(
  input: KaraokePhraseContinuityInput,
): KaraokePhraseContinuityReport {
  const phraseCount = input.prompts.length;
  const hit = new Set<string>();
  let submittableSamples = 0;
  for (const t of input.sampleTimesMs) {
    const state = buildKaraokePromptState(input.prompts, t);
    if (state.prompt && (state.phase === 'active' || state.phase === 'closing' || state.phase === 'upcoming')) {
      hit.add(state.prompt.id);
    }
    if (canSubmitVocalPhrase(state)) submittableSamples += 1;
  }
  const pitchAnalysisActive = input.pitchAnalysisActive === true;
  const continuityOk = phraseCount > 0 && hit.size > 0;
  return {
    phraseCount,
    windowsHit: hit.size,
    submittableSamples,
    a11yFallbackAvailable: true,
    pitchAnalysisActive,
    physicalMicAccepted: false,
    continuityOk,
    honestyBanner: `KARAOKE_PHRASE_CONTINUITY ok=${continuityOk} phrases=${phraseCount} windowsHit=${hit.size} submittable=${submittableSamples} pitch=${pitchAnalysisActive} · physical_mic=false · a11y_fallback=true · ${KARAOKE_PHRASE_CONTINUITY_HONESTY}`,
  };
}
