import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { SongCatalogEntry } from '@beatlink/shared';
import { assertOfflineLaunchCatalogComplete } from '../packages/game-engine/src/launchCatalog.js';
import { getBeatmapForSong, loadCatalog } from '../apps/server/src/beatmaps/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('launch song library — full playable original/authorized beds', () => {
  it('ships ≥90s songs with rights records, hashes, phrases, and WAV assets', () => {
    const catalog = JSON.parse(
      readFileSync(join(root, 'content/songs/offline-launch-catalog.json'), 'utf8'),
    ) as { songs: SongCatalogEntry[] };
    const gate = assertOfflineLaunchCatalogComplete(catalog.songs);
    expect(gate.failures).toEqual([]);
    expect(catalog.songs.length).toBeGreaterThanOrEqual(6);

    for (const song of catalog.songs) {
      expect(song.durationMs).toBeGreaterThanOrEqual(90_000);
      expect(song.assetSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(song.audioAssetPath).toBeTruthy();
      expect(song.karaokeMeta?.phrases?.length).toBeGreaterThanOrEqual(4);
      for (const ph of song.karaokeMeta!.phrases!) {
        expect(ph.targetPitchHz).toBeGreaterThan(80);
        expect(ph.text.length).toBeGreaterThan(0);
      }
      expect(song.rights?.rightsRecordPath).toBeTruthy();
      expect(song.rights?.ownershipEvidence).toBeTruthy();

      const wavPath = join(root, 'content', song.audioAssetPath!);
      expect(existsSync(wavPath)).toBe(true);
      const bytes = readFileSync(wavPath);
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(sha).toBe(song.assetSha256);

      const rights = JSON.parse(
        readFileSync(join(root, 'content', song.rights!.rightsRecordPath!), 'utf8'),
      ) as { assetSha256: string; ripForbidden: boolean };
      expect(rights.assetSha256).toBe(song.assetSha256);
      expect(rights.ripForbidden).toBe(true);
    }
  });

  it('generates beatmaps with phrase pitch targets for karaoke scoring', () => {
    const songs = loadCatalog().filter((s) => s.launchEligible);
    for (const song of songs) {
      const beatmap = getBeatmapForSong(song.id);
      expect(beatmap).toBeTruthy();
      expect(beatmap!.vocalPrompts.length).toBeGreaterThan(0);
      expect(beatmap!.notes.length).toBeGreaterThan(10);
      if (song.modes?.includes('KaraokePerformance')) {
        expect(beatmap!.vocalPrompts.some((p) => (p.targetPitchHz ?? 0) > 0)).toBe(true);
      }
    }
  });
});
