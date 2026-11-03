import { describe, it, expect } from 'vitest';
import {
  PARTY_AUDIENCE_HONESTY,
  assessPartyAudienceHonesty,
} from '../packages/game-engine/src/partyAudienceHonesty.js';

describe('party audience honesty — seats ≠ humans', () => {
  it('keeps audience distinct and never claims independent humans', () => {
    const report = assessPartyAudienceHonesty({
      performerCount: 2,
      audienceCount: 3,
      maxPerformers: 6,
      scriptedAudience: true,
    });
    expect(report.capacityOk).toBe(true);
    expect(report.audienceDistinctFromPerformers).toBe(true);
    expect(report.independentHumansClaimed).toBe(false);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.honestyBanner).toContain('independent_humans=false');
    expect(report.honestyBanner).toContain(PARTY_AUDIENCE_HONESTY.slice(0, 20));
  });
});
