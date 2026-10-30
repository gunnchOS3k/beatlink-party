import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Beatmap, SongCatalogEntry } from '@beatlink/shared';
import { validateBeatmap } from '@beatlink/shared';
import { createDemoBeatmap } from './generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentRoot = join(__dirname, '../../../../content');

let catalog: SongCatalogEntry[] = [];
/** Versioned beatmap cache — charts are loaded once per beatmap id, not regenerated each play. */
const BEATMAP_CACHE_VERSION = 3;
const beatmapCache = new Map<string, Beatmap>();

function cacheKey(beatmapId: string): string {
  return `v${BEATMAP_CACHE_VERSION}:${beatmapId}`;
}

export function loadCatalog(): SongCatalogEntry[] {
  if (catalog.length === 0) {
    const demoRaw = readFileSync(join(contentRoot, 'songs/approved-demo-catalog.json'), 'utf-8');
    const demo = JSON.parse(demoRaw) as { songs: SongCatalogEntry[] };
    let launch: SongCatalogEntry[] = [];
    try {
      const launchRaw = readFileSync(
        join(contentRoot, 'songs/offline-launch-catalog.json'),
        'utf-8',
      );
      launch = (JSON.parse(launchRaw) as { songs: SongCatalogEntry[] }).songs ?? [];
    } catch {
      launch = [];
    }
    const byId = new Map<string, SongCatalogEntry>();
    for (const song of [...demo.songs, ...launch]) {
      byId.set(song.id, song);
    }
    catalog = [...byId.values()];
  }
  return catalog;
}

export function getSongById(id: string): SongCatalogEntry | undefined {
  return loadCatalog().find((s) => s.id === id);
}

export function getBeatmap(beatmapId: string): Beatmap | null {
  const key = cacheKey(beatmapId);
  if (beatmapCache.has(key)) {
    return structuredClone(beatmapCache.get(key)!);
  }

  const song = loadCatalog().find((s) => s.beatmapId === beatmapId);
  if (!song) return null;

  try {
    const raw = readFileSync(join(contentRoot, `beatmaps/${beatmapId}.json`), 'utf-8');
    const parsed = JSON.parse(raw);
    const validation = validateBeatmap(parsed);
    if (validation.success && validation.data) {
      beatmapCache.set(key, validation.data as Beatmap);
      return structuredClone(validation.data as Beatmap);
    }
  } catch {
    // fall through to generated once, then cache
  }

  const generated = createDemoBeatmap(
    beatmapId,
    song.id,
    song.bpm,
    song.durationMs,
    'casual',
    song,
  );
  beatmapCache.set(key, generated as Beatmap);
  return structuredClone(generated as Beatmap);
}

/** Cache size for tests — proves charts are reused across selectSong calls. */
export function beatmapCacheSize(): number {
  return beatmapCache.size;
}

export function getBeatmapForSong(songId: string): Beatmap | null {
  const song = getSongById(songId);
  if (!song) return null;
  return getBeatmap(song.beatmapId);
}

/** Match authorized project-owned launch/catalog audio by immutable content hash. */
export function findSongIdByAssetSha256(sha256: string | null | undefined): string | null {
  if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) return null;
  const needle = sha256.toLowerCase();
  const hit = loadCatalog().find(
    (s) => typeof s.assetSha256 === 'string' && s.assetSha256.toLowerCase() === needle,
  );
  return hit?.id ?? null;
}
