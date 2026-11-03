import { describe, it, expect } from 'vitest';
import {
  KARAOKE_PITCH_EXCLUSIVITY_HONESTY,
  assessKaraokePitchExclusivity,
} from '../packages/game-engine/src/karaokePitchExclusivity.js';

describe('karaoke pitch exclusivity', () => {
  it('allows a single active pitch seat without physical multi-mic claim', () => {
    const report = assessKaraokePitchExclusivity([
      { seatId: 'a', pitchActive: true },
      { seatId: 'b', pitchActive: false },
    ]);
    expect(report.exclusiveOk).toBe(true);
    expect(report.activeSeatIds).toEqual(['a']);
    expect(report.multiPitchAllowed).toBe(false);
    expect(report.physicalMultiMicAccepted).toBe(false);
    expect(report.honestyBanner).toContain(KARAOKE_PITCH_EXCLUSIVITY_HONESTY.slice(0, 20));
  });

  it('rejects concurrent multi-pitch and keeps physical false', () => {
    const report = assessKaraokePitchExclusivity([
      { seatId: 'a', pitchActive: true },
      { seatId: 'b', pitchActive: true },
    ]);
    expect(report.exclusiveOk).toBe(false);
    expect(report.activeSeatIds).toEqual(['a', 'b']);
    expect(report.physicalMultiMicAccepted).toBe(false);
  });
});
