import { describe, expect, it } from 'vitest';
import {
  PARTY_START_GATE_RIGHTS_HONESTY,
  assessPartyStartGateRightsHonesty,
} from '../packages/game-engine/src/partyStartGateRightsHonesty.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('party start-gate rights honesty', () => {
  it('keeps scored start denied and refuses rights elevation', () => {
    const report = assessPartyStartGateRightsHonesty({
      previewOnlyLink: true,
      hasMatchedCatalogId: false,
      linkEqualsRipPermission: true,
      gameplaySyncAuthorized: true,
    });
    expect(report.schema).toBe('beat.party_start_gate_rights_honesty/v1');
    expect(report.scoredStartAllowed).toBe(false);
    expect(report.previewOnlyInsufficient).toBe(true);
    expect(report.karaokeModeActive).toBe(false);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.humanFirstFunClaimed).toBe(false);
    expect(report.LINK_EQUALS_RIP_PERMISSION).toBe(false);
    expect(report.GAMEPLAY_SYNC_AUTHORIZED).toBe(false);
    expect(report.honestyBanner).toContain('scoredStart=false');
    expect(report.honestyBanner).toContain(PARTY_START_GATE_RIGHTS_HONESTY.slice(0, 20));
  });

  it('preserves IV packet PREPARED honesty', () => {
    const iv = readFileSync(
      join(process.cwd(), 'artifacts/physical_lan_review/PHYSICAL_LAN_REVIEW_PACKET.md'),
      'utf8',
    );
    expect(iv).toContain('PREPARED — not executed');
  });
});
