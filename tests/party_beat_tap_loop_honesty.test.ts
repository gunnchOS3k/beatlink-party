import { describe, expect, it } from 'vitest';
import {
  BEAT_TAP_MODE_ID,
  PARTY_BEAT_TAP_LOOP_HONESTY,
  assessPartyBeatTapLoopHonesty,
} from '../packages/game-engine/src/partyBeatTapLoopHonesty.js';
import { SUGGESTED_RESULTS_DWELL_MS } from '../packages/game-engine/src/partyPacing.js';
import { buildBeatLinkVisualPackHarness } from '../packages/game-engine/src/visualPackHarness.js';

describe('party Beat Tap loop honesty — non-karaoke UX beyond karaoke', () => {
  it('keeps Beat Tap rematch digital-only and refuses rights elevation', () => {
    const report = assessPartyBeatTapLoopHonesty({
      rematchRound: 1,
      phase: 'results',
      hasResults: true,
      resultsDwellMs: SUGGESTED_RESULTS_DWELL_MS,
      modeId: BEAT_TAP_MODE_ID,
      karaokeModeActive: true, // attempt — must stay false on this surface
      linkEqualsRipPermission: true, // attempt — must stay false
      gameplaySyncAuthorized: true, // attempt — must stay false
      onboardingDoneIds: ['landing', 'create_or_join', 'media_local_catalog', 'first_mode_beat_tap'],
    });

    expect(report.modeId).toBe('BeatTap');
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
    expect(report.honestyBanner).toContain(PARTY_BEAT_TAP_LOOP_HONESTY.slice(0, 24));
  });

  it('keeps visual pack stage/art unfinished honesty (no invented finished art)', () => {
    const harness = buildBeatLinkVisualPackHarness();
    expect(harness.status).toBe('HARNESS_READY');
    expect(harness.VISUAL_MODEL_REVIEW).toBe('HISTORICAL_CAPTURES_ONLY');
    expect(harness.surfaces.some((s) => s.id === 'five_mode_transitions' && s.capture === 'DEFERRED')).toBe(
      true,
    );
    expect(harness.deferred_heavy_work.length).toBeGreaterThan(0);
  });
});
