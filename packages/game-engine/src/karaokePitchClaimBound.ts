/**
 * Server-side karaoke pitch claim bounding.
 * Client may report pitchAnalysisActive; server never trusts it without
 * finite pitchMatch ∈ [0,1] and non-trivial voicedCoverage.
 * This is NOT physical-mic attestation. Synthetic probes must fail.
 */

export const KARAOKE_MIN_VOICED_COVERAGE = 0.15;
export const KARAOKE_MIN_PHRASE_FRAMES = 2;

export interface KaraokePitchClaimInput {
  inputType: string;
  pitchAnalysisActive?: boolean;
  pitchMatch?: number;
  voicedCoverage?: number;
  phraseFrames?: number;
}

export interface KaraokePitchClaimBound {
  /** True only after server bounds pass — never from flag alone. */
  pitchAnalysisActive: boolean;
  pitchMatch: number | undefined;
  voicedCoverage: number | undefined;
  rejectedReason: string | null;
  /** Honesty: client flag alone never grants gameplay pitch path. */
  clientFlagInsufficient: boolean;
}

export function boundKaraokePitchClaim(input: KaraokePitchClaimInput): KaraokePitchClaimBound {
  const clientFlag = input.inputType === 'vocal_phrase' && input.pitchAnalysisActive === true;
  if (!clientFlag) {
    return {
      pitchAnalysisActive: false,
      pitchMatch: undefined,
      voicedCoverage: undefined,
      rejectedReason: clientFlag === false && input.pitchAnalysisActive === true
        ? 'wrong_input_type'
        : 'client_flag_false',
      clientFlagInsufficient: false,
    };
  }

  const voicedCoverage =
    typeof input.voicedCoverage === 'number' && Number.isFinite(input.voicedCoverage)
      ? Math.min(1, Math.max(0, input.voicedCoverage))
      : undefined;

  const pitchMatchRaw = input.pitchMatch;
  const pitchMatchOk =
    typeof pitchMatchRaw === 'number' &&
    Number.isFinite(pitchMatchRaw) &&
    pitchMatchRaw >= 0 &&
    pitchMatchRaw <= 1;

  const frames = input.phraseFrames;
  const framesOk =
    frames == null || (typeof frames === 'number' && Number.isFinite(frames) && frames >= KARAOKE_MIN_PHRASE_FRAMES);

  if (!pitchMatchOk) {
    return {
      pitchAnalysisActive: false,
      pitchMatch: undefined,
      voicedCoverage,
      rejectedReason: 'pitch_match_invalid',
      clientFlagInsufficient: true,
    };
  }
  if (voicedCoverage == null || voicedCoverage < KARAOKE_MIN_VOICED_COVERAGE) {
    return {
      pitchAnalysisActive: false,
      pitchMatch: undefined,
      voicedCoverage,
      rejectedReason: 'voiced_coverage_insufficient',
      clientFlagInsufficient: true,
    };
  }
  if (!framesOk) {
    return {
      pitchAnalysisActive: false,
      pitchMatch: undefined,
      voicedCoverage,
      rejectedReason: 'phrase_frames_insufficient',
      clientFlagInsufficient: true,
    };
  }

  return {
    pitchAnalysisActive: true,
    pitchMatch: Math.min(1, Math.max(0, pitchMatchRaw as number)),
    voicedCoverage,
    rejectedReason: null,
    clientFlagInsufficient: false,
  };
}
