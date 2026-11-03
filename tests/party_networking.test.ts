import { describe, it, expect } from 'vitest';
import {
  PARTY_NETWORKING_HONESTY,
  assessPartyNetworking,
} from '../packages/game-engine/src/partyNetworking.js';

describe('party networking membership — dual-socket ≠ physical LAN', () => {
  it('requires host + ≥1 performer; physicalLanAccepted stays false', () => {
    const fail = assessPartyNetworking({
      seats: [{ role: 'host', connected: true }],
    });
    expect(fail.membershipOk).toBe(false);
    expect(fail.physicalLanAccepted).toBe(false);

    const ok = assessPartyNetworking({
      seats: [
        { role: 'host', connected: true },
        { role: 'performer', connected: true, ready: true },
        { role: 'audience', connected: true },
      ],
      transportClass: 'loopback_dual_socket',
    });
    expect(ok.membershipOk).toBe(true);
    expect(ok.performerConnected).toBe(1);
    expect(ok.performerReady).toBe(1);
    expect(ok.audienceConnected).toBe(1);
    expect(ok.physicalLanAccepted).toBe(false);
    expect(ok.honestyBanner).toContain('physical_lan=false');
    expect(ok.notes).toContain('loopback_dual_socket_not_physical_lan');
    expect(ok.honestyBanner).toContain(PARTY_NETWORKING_HONESTY.slice(0, 20));
  });
});
