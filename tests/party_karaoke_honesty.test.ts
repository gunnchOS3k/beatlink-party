import { describe, it, expect } from 'vitest';
import {
  PARTY_KARAOKE_HONESTY,
  assessPartyKaraokeHonesty,
} from '../packages/game-engine/src/partyKaraokeHonesty.js';

describe('party karaoke honesty — audience never inherits pitch', () => {
  it('composes audience + revoke without physical/human claims', () => {
    const report = assessPartyKaraokeHonesty({
      performerCount: 2,
      audienceCount: 3,
      maxPerformers: 8,
      scriptedAudience: true,
      karaokeModeActive: true,
      nowMs: 2_000,
    });
    expect(report.karaokeModeActive).toBe(true);
    expect(report.audience.capacityOk).toBe(true);
    expect(report.audience.audienceDistinctFromPerformers).toBe(true);
    expect(report.karaokeRevoke.pitchClearedOnRevoke).toBe(true);
    expect(report.audiencePitchAuthorized).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.independentHumansClaimed).toBe(false);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.honestyBanner).toContain('audience_pitch=false');
    expect(report.honestyBanner).toContain('physical_party=false');
    expect(report.honestyBanner).toContain(PARTY_KARAOKE_HONESTY.slice(0, 24));
  });

  it('keeps honesty when karaoke mode inactive', () => {
    const report = assessPartyKaraokeHonesty({
      performerCount: 1,
      audienceCount: 0,
      maxPerformers: 8,
      karaokeModeActive: false,
      nowMs: 3_000,
    });
    expect(report.karaokeModeActive).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.independentHumansClaimed).toBe(false);
  });
});
