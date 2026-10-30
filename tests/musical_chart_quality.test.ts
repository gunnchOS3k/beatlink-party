import { describe, it, expect } from 'vitest';
import { getBeatmapForSong, loadCatalog } from '../apps/server/src/beatmaps/store.js';
import {
  assessChartMusicalQuality,
  chartSectionDensities,
} from '../apps/server/src/beatmaps/generator.js';

describe('five-mode musical chart quality — section-aware, not duration pad', () => {
  it('launch charts are denser in chorus than intro with type variety', () => {
    const songs = loadCatalog().filter((s) => s.launchEligible);
    expect(songs.length).toBeGreaterThanOrEqual(6);

    for (const song of songs) {
      const beatmap = getBeatmapForSong(song.id);
      expect(beatmap).toBeTruthy();
      const notes = beatmap!.notes;
      expect(notes.length).toBeGreaterThan(10);

      const dens = chartSectionDensities(notes, beatmap!.sections);
      expect(dens.chorus ?? 0).toBeGreaterThan((dens.intro ?? 0) * 1.15);

      const quality = assessChartMusicalQuality(notes, beatmap!.sections);
      expect(quality.metronomePaddingOnly).toBe(false);
      expect(quality.sectionAware).toBe(true);
      expect(quality.chorusDenserThanIntro).toBe(true);
      expect(quality.typeVariety).toBeGreaterThanOrEqual(2);
      expect(quality.ok).toBe(true);

      // Band / multi-role songs should rotate roles when catalog declares them.
      if ((song.chart?.noteRoles?.length ?? 0) > 1 || song.modes?.includes('BandRoles')) {
        const roles = new Set(notes.map((n) => n.role));
        expect(roles.size).toBeGreaterThan(1);
      }
    }
  });

  it('mode-aware charts differ BeatTap vs CallAndResponse / Karaoke density shape', () => {
    const catalog = loadCatalog();
    const tap = catalog.find((s) => s.id === 'launch-pd-tap-grid');
    const call = catalog.find((s) => s.id === 'launch-orig-call-mirror');
    const karaoke = catalog.find((s) => s.id === 'launch-cc-karaoke-warm');
    expect(tap && call && karaoke).toBeTruthy();
    const tapBm = getBeatmapForSong(tap!.id)!;
    const callBm = getBeatmapForSong(call!.id)!;
    const karaokeBm = getBeatmapForSong(karaoke!.id)!;
    // Mode scaling must change note counts vs naive uniform BeatTap — not identical pads.
    expect(tapBm.notes.length).not.toBe(callBm.notes.length);
    expect(tapBm.notes.length).not.toBe(karaokeBm.notes.length);
    expect(tapBm.version).toBe('1.3.0');
  });
});

