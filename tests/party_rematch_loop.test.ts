import { describe, it, expect } from 'vitest';
import {
  PARTY_REMATCH_HONESTY,
  assessPartyRematchLoop,
} from '../packages/game-engine/src/partyRematchLoop.js';
import { SUGGESTED_RESULTS_DWELL_MS } from '../packages/game-engine/src/partyPacing.js';

describe('party rematch loop — digital dwell ≠ physical party', () => {
  it('marks rematch ready on results without physical/human claims', () => {
    const early = assessPartyRematchLoop({
      rematchRound: 0,
      phase: 'results',
      hasResults: true,
      resultsDwellMs: 500,
      modeId: 'BeatTap',
    });
    expect(early.rematchReady).toBe(true);
    expect(early.dwellMet).toBe(false);
    expect(early.physicalPartyClaimed).toBe(false);
    expect(early.humanFirstFunClaimed).toBe(false);

    const ready = assessPartyRematchLoop({
      rematchRound: 2,
      phase: 'results',
      hasResults: true,
      resultsDwellMs: SUGGESTED_RESULTS_DWELL_MS,
      modeId: 'KaraokePerformance',
    });
    expect(ready.dwellMet).toBe(true);
    expect(ready.honestyBanner).toContain('physical_party=false');
    expect(ready.honestyBanner).toContain(PARTY_REMATCH_HONESTY.slice(0, 20));
  });
});
