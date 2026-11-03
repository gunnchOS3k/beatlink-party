import { describe, it, expect } from 'vitest';
import {
  PARTY_KARAOKE_NETWORKING_HONESTY,
  assessPartyKaraokeNetworkingHonesty,
} from '../packages/game-engine/src/partyKaraokeNetworkingHonesty.js';

describe('party karaoke networking honesty', () => {
  it('keeps lan/pitch/human flags false when karaoke membership is ok', () => {
    const report = assessPartyKaraokeNetworkingHonesty({
      seats: [
        { role: 'host', connected: true },
        { role: 'performer', connected: true, ready: true },
        { role: 'audience', connected: true },
      ],
      transportClass: 'loopback_dual_socket',
      karaokeModeActive: true,
    });
    expect(report.karaokeModeActive).toBe(true);
    expect(report.networking.membershipOk).toBe(true);
    expect(report.audiencePitchAuthorized).toBe(false);
    expect(report.physicalLanAccepted).toBe(false);
    expect(report.physicalMicAccepted).toBe(false);
    expect(report.independentHumansClaimed).toBe(false);
    expect(report.honestyBanner).toContain('physical_lan=false');
    expect(report.honestyBanner).toContain(PARTY_KARAOKE_NETWORKING_HONESTY.slice(0, 20));
  });

  it('does not claim physical lan when karaoke inactive', () => {
    const report = assessPartyKaraokeNetworkingHonesty({
      seats: [{ role: 'host', connected: true }],
      karaokeModeActive: false,
    });
    expect(report.karaokeModeActive).toBe(false);
    expect(report.physicalLanAccepted).toBe(false);
    expect(report.audiencePitchAuthorized).toBe(false);
  });
});
