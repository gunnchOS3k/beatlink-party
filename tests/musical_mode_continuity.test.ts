import { describe, it, expect, beforeEach } from 'vitest';
import type { Beatmap } from '@beatlink/shared';
import { GAME_MODE_IDS } from '@beatlink/shared';
import {
  assessMusicalModeContinuity,
  openModePlayableSession,
  pickModeSong,
  resetRightsStateForTests,
} from '../packages/game-engine/src/index.js';
import { getBeatmapForSong, loadCatalog } from '../apps/server/src/beatmaps/store.js';

describe('musical mode continuity — authorized five-mode path', () => {
  beforeEach(() => {
    resetRightsStateForTests();
  });

  it('covers all five modes without commercial clearance claim', () => {
    const catalog = loadCatalog();
    const sessions = GAME_MODE_IDS.map((modeId) => {
      const song = pickModeSong(modeId, catalog)!;
      const beatmap = getBeatmapForSong(song.id) as Beatmap;
      return openModePlayableSession({
        modeId,
        catalogEntry: song,
        beatmap,
        difficulty: 'casual',
        pitchAnalysisEnabled: false,
      });
    });
    const report = assessMusicalModeContinuity(sessions);
    expect(report.complete).toBe(true);
    expect(report.missingModes).toEqual([]);
    expect(report.commercialClearanceClaimed).toBe(false);
    expect(report.honestyBanner).toContain('commercial_clearance=false');
    for (const row of report.rows) {
      expect(row.ok).toBe(true);
      expect(row.commercialClaim).toBe(false);
      expect(row.noteCueCount).toBeGreaterThan(0);
    }
  });
});
