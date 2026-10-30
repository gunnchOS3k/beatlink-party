import { describe, it, expect } from 'vitest';
import {
  KARAOKE_VOCALIST_HANDOFF_HONESTY,
  assessKaraokeVocalistHandoff,
} from '../packages/game-engine/src/karaokeVocalistHandoff.js';

describe('karaoke vocalist handoff — no pitch transfer', () => {
  it('clears pitch and requires re-grant without physical claim', () => {
    const report = assessKaraokeVocalistHandoff(
      { fromSeatId: 'seat-a', toSeatId: 'seat-b', priorPitchActive: true },
      2_000,
    );
    expect(report.pitchTransferred).toBe(false);
    expect(report.reGrantRequired).toBe(true);
    expect(report.toSeatPitch).toBe(false);
    expect(report.toSeatA11y).toBe(true);
    expect(report.toSeatState.microphonePitchAnalysis).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.honestyBanner).toContain('pitchTransferred=false');
    expect(report.honestyBanner).toContain(KARAOKE_VOCALIST_HANDOFF_HONESTY.slice(0, 20));
  });
});
