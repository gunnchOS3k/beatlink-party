import { describe, expect, it } from 'vitest';
import {
  NON_KARAOKE_DIGITAL_MODE_IDS,
  PARTY_NON_KARAOKE_MODE_CATALOG_HONESTY,
  assessPartyNonKaraokeModeCatalogHonesty,
} from '../packages/game-engine/src/partyNonKaraokeModeCatalogHonesty.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('party non-karaoke mode catalog honesty', () => {
  it('keeps four digital modes and refuses rights elevation', () => {
    const report = assessPartyNonKaraokeModeCatalogHonesty({
      karaokeModeActive: true,
      linkEqualsRipPermission: true,
      gameplaySyncAuthorized: true,
    });
    expect(report.modeCount).toBe(4);
    expect(report.modes).toEqual([...NON_KARAOKE_DIGITAL_MODE_IDS]);
    expect(report.karaokeModeActive).toBe(false);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.humanFirstFunClaimed).toBe(false);
    expect(report.LINK_EQUALS_RIP_PERMISSION).toBe(false);
    expect(report.GAMEPLAY_SYNC_AUTHORIZED).toBe(false);
    expect(report.honestyBanner).toContain('karaoke=false');
    expect(report.honestyBanner).toContain(PARTY_NON_KARAOKE_MODE_CATALOG_HONESTY.slice(0, 20));
  });

  it('preserves IV packet PREPARED honesty', () => {
    const iv = readFileSync(
      join(process.cwd(), 'artifacts/physical_lan_review/PHYSICAL_LAN_REVIEW_PACKET.md'),
      'utf8',
    );
    expect(iv).toContain('PREPARED — not executed');
  });
});
