import { describe, expect, it } from 'vitest';
import {
  PARTY_AUDIENCE_RIGHTS_HONESTY,
  assessPartyAudienceRightsHonesty,
} from '../packages/game-engine/src/partyAudienceRightsHonesty.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('party audience rights honesty', () => {
  it('keeps audience digital-only and refuses rights elevation', () => {
    const report = assessPartyAudienceRightsHonesty({
      performerCount: 4,
      audienceCount: 12,
      maxPerformers: 8,
      scriptedAudience: true,
      linkEqualsRipPermission: true,
      gameplaySyncAuthorized: true,
    });
    expect(report.schema).toBe('beat.party_audience_rights_honesty/v1');
    expect(report.capacityOk).toBe(true);
    expect(report.audienceDistinctFromPerformers).toBe(true);
    expect(report.independentHumansClaimed).toBe(false);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.humanFirstFunClaimed).toBe(false);
    expect(report.LINK_EQUALS_RIP_PERMISSION).toBe(false);
    expect(report.GAMEPLAY_SYNC_AUTHORIZED).toBe(false);
    expect(report.honestyBanner).toContain('link_equals_rip=false');
    expect(report.honestyBanner).toContain(PARTY_AUDIENCE_RIGHTS_HONESTY.slice(0, 20));
  });

  it('preserves IV packet PREPARED honesty', () => {
    const iv = readFileSync(
      join(process.cwd(), 'artifacts/physical_lan_review/PHYSICAL_LAN_REVIEW_PACKET.md'),
      'utf8',
    );
    expect(iv).toContain('PREPARED — not executed');
  });
});
