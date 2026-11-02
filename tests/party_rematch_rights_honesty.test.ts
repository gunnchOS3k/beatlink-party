import { describe, expect, it } from 'vitest';
import {
  PARTY_REMATCH_RIGHTS_HONESTY,
  assessPartyRematchRightsHonesty,
} from '../packages/game-engine/src/partyRematchRightsHonesty.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('party rematch rights honesty', () => {
  it('keeps rematch from elevating rights or GAMEPLAY_SYNC', () => {
    const report = assessPartyRematchRightsHonesty({
      rematchReady: true,
      rematchRound: 3,
      linkEqualsRipPermission: true,
      gameplaySyncAuthorized: true,
    });
    expect(report.schema).toBe('beat.party_rematch_rights_honesty/v1');
    expect(report.rematchElevatesRights).toBe(false);
    expect(report.scoredRematchAuthorized).toBe(false);
    expect(report.karaokeModeActive).toBe(false);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.humanFirstFunClaimed).toBe(false);
    expect(report.LINK_EQUALS_RIP_PERMISSION).toBe(false);
    expect(report.GAMEPLAY_SYNC_AUTHORIZED).toBe(false);
    expect(report.ivPacketUntouched).toBe(true);
    expect(report.honestyBanner).toContain('elevatesRights=false');
    expect(report.honestyBanner).toContain(PARTY_REMATCH_RIGHTS_HONESTY.slice(0, 20));
  });

  it('preserves IV floor ab7a8d9 PREPARED honesty', () => {
    const iv = readFileSync(
      join(process.cwd(), 'artifacts/physical_lan_review/PHYSICAL_LAN_REVIEW_PACKET.md'),
      'utf8',
    );
    expect(iv).toContain('PREPARED — not executed');
  });
});
