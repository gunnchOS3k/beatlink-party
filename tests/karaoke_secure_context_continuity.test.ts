import { describe, it, expect } from 'vitest';
import {
  KARAOKE_SECURE_CONTEXT_CONTINUITY_HONESTY,
  assessKaraokeSecureContextContinuity,
} from '../packages/game-engine/src/karaokeSecureContextContinuity.js';

describe('karaoke secure-context continuity', () => {
  it('clears pitch when secure context is lost', () => {
    const report = assessKaraokeSecureContextContinuity({
      wasPitchActive: true,
      isSecureContext: false,
      protocol: 'http:',
    });
    expect(report.pitchClearedOnInsecure).toBe(true);
    expect(report.pitchMayContinue).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.honestyBanner).toContain(KARAOKE_SECURE_CONTEXT_CONTINUITY_HONESTY.slice(0, 20));
  });

  it('allows continue only while secure context holds', () => {
    const report = assessKaraokeSecureContextContinuity({
      wasPitchActive: true,
      isSecureContext: true,
      protocol: 'https:',
    });
    expect(report.pitchMayContinue).toBe(true);
    expect(report.pitchClearedOnInsecure).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
  });
});
