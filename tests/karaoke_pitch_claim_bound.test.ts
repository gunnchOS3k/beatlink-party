import { describe, it, expect } from 'vitest';
import { boundKaraokePitchClaim } from '../packages/game-engine/src/karaokePitchClaimBound.js';

describe('karaoke server pitch claim bound — flag alone insufficient', () => {
  it('rejects client pitchAnalysisActive without voiced coverage / valid match', () => {
    const flagOnly = boundKaraokePitchClaim({
      inputType: 'vocal_phrase',
      pitchAnalysisActive: true,
      pitchMatch: 0.9,
    });
    expect(flagOnly.pitchAnalysisActive).toBe(false);
    expect(flagOnly.clientFlagInsufficient).toBe(true);
    expect(flagOnly.rejectedReason).toBe('voiced_coverage_insufficient');

    const silence = boundKaraokePitchClaim({
      inputType: 'vocal_phrase',
      pitchAnalysisActive: true,
      pitchMatch: 0.95,
      voicedCoverage: 0.05,
      phraseFrames: 10,
    });
    expect(silence.pitchAnalysisActive).toBe(false);

    const ok = boundKaraokePitchClaim({
      inputType: 'vocal_phrase',
      pitchAnalysisActive: true,
      pitchMatch: 0.8,
      voicedCoverage: 0.4,
      phraseFrames: 8,
    });
    expect(ok.pitchAnalysisActive).toBe(true);
    expect(ok.pitchMatch).toBe(0.8);
    expect(ok.rejectedReason).toBeNull();
  });

  it('fallback tap never authorizes pitch path', () => {
    const tap = boundKaraokePitchClaim({
      inputType: 'vocal_fallback_tap',
      pitchAnalysisActive: true,
      pitchMatch: 1,
      voicedCoverage: 1,
      phraseFrames: 20,
    });
    expect(tap.pitchAnalysisActive).toBe(false);
  });
});
