import { describe, it, expect } from 'vitest';
import {
  PARTY_KARAOKE_AUDIENCE_PITCH_GATE_HONESTY,
  assessPartyKaraokeAudiencePitchGate,
} from '../packages/game-engine/src/partyKaraokeAudiencePitchGate.js';

const strongClaim = {
  inputType: 'vocal_phrase',
  pitchAnalysisActive: true,
  pitchMatch: 0.9,
  voicedCoverage: 0.8,
  phraseFrames: 8,
};

describe('party karaoke audience pitch gate', () => {
  it('rejects audience seats even with strong synthetic claims', () => {
    const report = assessPartyKaraokeAudiencePitchGate({
      seatKind: 'audience',
      claim: strongClaim,
    });
    expect(report.pitchAnalysisActive).toBe(false);
    expect(report.rejectedReason).toBe('audience_seat_forbidden');
    expect(report.audiencePitchAuthorized).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.independentHumansClaimed).toBe(false);
    expect(report.bound).toBeNull();
    expect(report.honestyBanner).toContain('audience_seat_forbidden');
    expect(report.honestyBanner).toContain(PARTY_KARAOKE_AUDIENCE_PITCH_GATE_HONESTY.slice(0, 24));
  });

  it('rejects host seats without physical claims', () => {
    const report = assessPartyKaraokeAudiencePitchGate({
      seatKind: 'host',
      claim: strongClaim,
    });
    expect(report.pitchAnalysisActive).toBe(false);
    expect(report.rejectedReason).toBe('host_seat_forbidden');
    expect(report.physicalMicAccepted).toBe(false);
  });

  it('allows bounded performer claims while audience_pitch stays false', () => {
    const report = assessPartyKaraokeAudiencePitchGate({
      seatKind: 'performer',
      claim: strongClaim,
    });
    expect(report.pitchAnalysisActive).toBe(true);
    expect(report.rejectedReason).toBeNull();
    expect(report.audiencePitchAuthorized).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.independentHumansClaimed).toBe(false);
    expect(report.bound?.pitchAnalysisActive).toBe(true);
  });
});
