import { describe, it, expect } from 'vitest';
import {
  KARAOKE_REVOKE_CONTINUITY_HONESTY,
  assessKaraokeRevokeContinuity,
} from '../packages/game-engine/src/karaokeRevokeContinuity.js';

describe('karaoke revoke continuity — mid-phrase pitch clear', () => {
  it('clears pitch on revoke and keeps a11y without physical claim', () => {
    const report = assessKaraokeRevokeContinuity(1_000);
    expect(report.afterGrantPitch).toBe(true);
    expect(report.afterRevokePitch).toBe(false);
    expect(report.pitchClearedOnRevoke).toBe(true);
    expect(report.a11yAfterRevoke).toBe(true);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.finalState.a11yFallbackActive).toBe(true);
    expect(report.honestyBanner).toContain('physical_mic=false');
    expect(report.honestyBanner).toContain(KARAOKE_REVOKE_CONTINUITY_HONESTY.slice(0, 20));
  });
});
