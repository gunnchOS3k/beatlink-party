import { describe, expect, it } from 'vitest';
import {
  CALL_AND_RESPONSE_MODE_ID,
  PARTY_CALL_AND_RESPONSE_LOOP_HONESTY,
  assessPartyCallAndResponseLoopHonesty,
} from '../packages/game-engine/src/partyCallAndResponseLoopHonesty.js';
import { SUGGESTED_RESULTS_DWELL_MS } from '../packages/game-engine/src/partyPacing.js';
import { buildBeatLinkVisualPackHarness } from '../packages/game-engine/src/visualPackHarness.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('party Call and Response loop honesty — non-karaoke digital continue', () => {
  it('keeps Call and Response rematch digital-only and refuses rights elevation', () => {
    const report = assessPartyCallAndResponseLoopHonesty({
      rematchRound: 2,
      phase: 'results',
      hasResults: true,
      resultsDwellMs: SUGGESTED_RESULTS_DWELL_MS,
      modeId: CALL_AND_RESPONSE_MODE_ID,
      karaokeModeActive: true, // attempt — must stay false on this surface
      linkEqualsRipPermission: true, // attempt — must stay false
      gameplaySyncAuthorized: true, // attempt — must stay false
      onboardingDoneIds: [
        'landing',
        'create_or_join',
        'media_local_catalog',
        'first_mode_beat_tap',
        'score_and_results',
      ],
    });

    expect(report.modeId).toBe('CallAndResponse');
    expect(report.callAndResponseActive).toBe(true);
    expect(report.firstModeIsBeatTap).toBe(true);
    expect(report.karaokeModeActive).toBe(false);
    expect(report.rematch.rematchReady).toBe(true);
    expect(report.rematch.dwellMet).toBe(true);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.humanFirstFunClaimed).toBe(false);
    expect(report.LINK_EQUALS_RIP_PERMISSION).toBe(false);
    expect(report.GAMEPLAY_SYNC_AUTHORIZED).toBe(false);
    expect(report.criticRisk).toBe('S2_OPEN');
    expect(report.onboardingPercent).toBeGreaterThan(0);
    expect(report.honestyBanner).toContain('karaoke=false');
    expect(report.honestyBanner).toContain('link_equals_rip=false');
    expect(report.honestyBanner).toContain(PARTY_CALL_AND_RESPONSE_LOOP_HONESTY.slice(0, 24));
  });

  it('keeps Beat Tap stage art unfinished and does not claim physical IV pass', () => {
    const harness = buildBeatLinkVisualPackHarness();
    expect(harness.surfaces.some((s) => s.id === 'beat_tap_stage' && s.capture === 'DEFERRED')).toBe(
      true,
    );
    expect(
      harness.deferred_heavy_work.some(
        (d) => d.includes('procedural≠finished') || d.includes('Beat Tap stage art'),
      ),
    ).toBe(true);

    const iv = readFileSync(
      join(process.cwd(), 'artifacts/physical_lan_review/PHYSICAL_LAN_REVIEW_PACKET.md'),
      'utf8',
    );
    expect(iv).toContain('PREPARED — not executed');
    expect(iv).toMatch(/Physical phone pass:\s*\*\*false/i);
  });
});
