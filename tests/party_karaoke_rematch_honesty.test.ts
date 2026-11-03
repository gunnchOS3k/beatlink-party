import { describe, it, expect } from 'vitest';
import {
  PARTY_KARAOKE_REMATCH_HONESTY,
  assessPartyKaraokeRematchHonesty,
} from '../packages/game-engine/src/partyKaraokeRematchHonesty.js';

describe('party karaoke rematch honesty', () => {
  it('clears prior pitch on rematch without physical/human claims', () => {
    const report = assessPartyKaraokeRematchHonesty({
      rematchRound: 1,
      phase: 'results',
      hasResults: true,
      modeId: 'KaraokePerformance',
      karaokeModeActive: true,
      priorPitchActive: true,
      nowMs: 4_000,
    });
    expect(report.karaokeModeActive).toBe(true);
    expect(report.rematch.rematchReady).toBe(true);
    expect(report.priorPitchClearedOnRematch).toBe(true);
    expect(report.audiencePitchAuthorized).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.independentHumansClaimed).toBe(false);
    expect(report.honestyBanner).toContain('priorPitchCleared=true');
    expect(report.honestyBanner).toContain(PARTY_KARAOKE_REMATCH_HONESTY.slice(0, 20));
  });

  it('keeps flags false when karaoke inactive', () => {
    const report = assessPartyKaraokeRematchHonesty({
      rematchRound: 0,
      phase: 'lobby',
      hasResults: false,
      karaokeModeActive: false,
      priorPitchActive: false,
      nowMs: 1_000,
    });
    expect(report.karaokeModeActive).toBe(false);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.audiencePitchAuthorized).toBe(false);
  });
});
