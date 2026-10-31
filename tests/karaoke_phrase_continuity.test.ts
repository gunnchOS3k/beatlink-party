import { describe, it, expect } from 'vitest';
import {
  KARAOKE_PHRASE_CONTINUITY_HONESTY,
  assessKaraokePhraseContinuity,
} from '../packages/game-engine/src/karaokePhraseContinuity.js';

describe('karaoke phrase continuity — timing ≠ physical mic', () => {
  it('hits phrase windows with a11y fallback and no physical claim', () => {
    const prompts = [
      { id: 'p1', timeMs: 1000, text: 'One', durationMs: 800 },
      { id: 'p2', timeMs: 3000, text: 'Two', durationMs: 800 },
    ];
    const report = assessKaraokePhraseContinuity({
      prompts,
      sampleTimesMs: [900, 1100, 3100, 5000],
      pitchAnalysisActive: false,
    });
    expect(report.phraseCount).toBe(2);
    expect(report.windowsHit).toBeGreaterThanOrEqual(1);
    expect(report.submittableSamples).toBeGreaterThan(0);
    expect(report.a11yFallbackAvailable).toBe(true);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.continuityOk).toBe(true);
    expect(report.honestyBanner).toContain('physical_mic=false');
    expect(report.honestyBanner).toContain(KARAOKE_PHRASE_CONTINUITY_HONESTY.slice(0, 20));
  });
});
