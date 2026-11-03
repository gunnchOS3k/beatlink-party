import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Beatmap, SongCatalogEntry } from '@beatlink/shared';
import { GAME_MODE_IDS } from '@beatlink/shared';
import {
  assertFiveModePlayableCoverage,
  buildModeSessionResults,
  buildModeStageVisual,
  ingestCreatorOwnedStub,
  openModePlayableSession,
  pickModeSong,
  resolveSongSource,
  resetRightsStateForTests,
  takedownCreatorStub,
  upcomingSyncedNotes,
} from '../packages/game-engine/src/index.js';
import { getBeatmapForSong, loadCatalog } from '../apps/server/src/beatmaps/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadLaunchCatalog(): SongCatalogEntry[] {
  const raw = readFileSync(join(root, 'content/songs/offline-launch-catalog.json'), 'utf-8');
  return (JSON.parse(raw) as { songs: SongCatalogEntry[] }).songs;
}

describe('Musical product — five modes beyond metronome-only', () => {
  beforeEach(() => {
    resetRightsStateForTests();
  });

  it('covers every registered mode with a launch-safe song', () => {
    const catalog = loadCatalog();
    const coverage = assertFiveModePlayableCoverage(catalog);
    expect(coverage.complete).toBe(true);
    expect(coverage.missing).toEqual([]);
    for (const mode of GAME_MODE_IDS) {
      expect(coverage.byMode[mode]).toBeTruthy();
    }
  });

  it('opens a note-synced song-bed session per mode with stage cues and results', () => {
    const catalog = loadCatalog();
    for (const modeId of GAME_MODE_IDS) {
      const song = pickModeSong(modeId, catalog)!;
      const beatmap = getBeatmapForSong(song.id) as Beatmap;
      expect(beatmap.notes.length).toBeGreaterThan(0);

      const source = resolveSongSource({ catalogEntry: song });
      expect(source.canGameplayStream).toBe(true);
      expect(['procedural_song_bed', 'approved_catalog', 'procedural_fixture']).toContain(
        source.kind,
      );
      expect(source.media.kind).toBe('procedural_song_bed');

      const session = openModePlayableSession({
        modeId,
        catalogEntry: song,
        beatmap,
        difficulty: 'casual',
        pitchAnalysisEnabled: modeId === 'KaraokePerformance' ? false : undefined,
      });
      expect(session.audioKind).not.toBe('blocked');
      expect(session.noteCues.length).toBeGreaterThan(0);
      expect(session.rightsHonest.ripForbidden).toBe(true);
      expect(session.rightsHonest.commercialClaim).toBe(false);
      expect(session.rightsHonest.pitchAnalysisClaim).toBe(false);

      const visual = buildModeStageVisual(session, beatmap, 1000, 60);
      expect(visual.modeId).toBe(modeId);
      expect(visual.headline).toContain(song.title);

      const cues = upcomingSyncedNotes(session.noteCues, 0, 5000);
      expect(cues.length).toBeGreaterThan(0);

      const results = buildModeSessionResults(session, {
        teamScore: 1200,
        crowdMeter: 70,
        winningTeam: null,
        rows: [
          {
            playerId: 'p1',
            displayName: 'A',
            score: 500,
            accuracy: 90,
            maxStreak: 4,
            teamId: 'A',
            role: 'beat_tapper',
          },
        ],
      });
      expect(results.songId).toBe(song.id);
      expect(results.commercialClaim).toBe(false);
      expect(results.headline).toContain(song.title);
    }
  });

  it('karaoke pitch claim is false until explicitly enabled', () => {
    const song = pickModeSong('KaraokePerformance', loadLaunchCatalog())!;
    const beatmap = getBeatmapForSong(song.id)!;
    const off = openModePlayableSession({
      modeId: 'KaraokePerformance',
      catalogEntry: song,
      beatmap,
      pitchAnalysisEnabled: false,
    });
    const on = openModePlayableSession({
      modeId: 'KaraokePerformance',
      catalogEntry: song,
      beatmap,
      pitchAnalysisEnabled: true,
    });
    expect(off.rightsHonest.pitchAnalysisClaim).toBe(false);
    expect(on.rightsHonest.pitchAnalysisClaim).toBe(true);
  });
});

describe('Creator ingest stubs + rights honesty', () => {
  beforeEach(() => {
    resetRightsStateForTests();
  });

  it('accepts attested creator-owned metadata without storing audio binaries', () => {
    const ok = ingestCreatorOwnedStub({
      trackId: 'creator-demo-1',
      title: 'My Attested Groove',
      artist: 'Studio Friend',
      attestorId: 'host-1',
      ownsOrLicensed: true,
      bpm: 124,
      durationMs: 32000,
    });
    expect(ok.ok).toBe(true);
    expect(ok.status).toBe('attested_stub');
    expect(ok.catalogStub?.license).toBe('creator_owned');
    expect(ok.honesty.ripPerformed).toBe(false);
    expect(ok.honesty.lyricsScraped).toBe(false);
    expect(ok.honesty.drmCircumvented).toBe(false);
    expect(ok.honesty.audioBinaryStored).toBe(false);
    expect(ok.honesty.commercialLicenseClaimed).toBe(false);
  });

  it('rejects Spotify/YouTube rip URLs and DRM bypass signals', () => {
    const rip = ingestCreatorOwnedStub({
      trackId: 'bad-1',
      title: 'Hit Song',
      artist: 'Label',
      attestorId: 'host-1',
      ownsOrLicensed: true,
      claimedSourceUrl: 'https://open.spotify.com/track/abc',
    });
    expect(rip.ok).toBe(false);
    expect(rip.status).toBe('rejected_rip');

    const drm = ingestCreatorOwnedStub({
      trackId: 'bad-2',
      title: 'Widevine Dump',
      artist: 'Nope',
      attestorId: 'host-1',
      ownsOrLicensed: true,
      ripIntentSignals: ['bypass drm widevine'],
    });
    expect(drm.ok).toBe(false);
    expect(['rejected_drm', 'rejected_rip']).toContain(drm.status);
  });

  it('rejects ownership-not-attested uploads', () => {
    const denied = ingestCreatorOwnedStub({
      trackId: 'bad-3',
      title: 'Maybe Mine',
      artist: 'Maybe',
      attestorId: 'host-1',
      ownsOrLicensed: false,
    });
    expect(denied.ok).toBe(false);
    expect(denied.status).toBe('rejected_ownership');
  });

  it('honors takedown after attestation', () => {
    const ok = ingestCreatorOwnedStub({
      trackId: 'takedown-1',
      title: 'Short Lived',
      artist: 'Creator',
      attestorId: 'host-1',
      ownsOrLicensed: true,
    });
    expect(ok.ok).toBe(true);
    const td = takedownCreatorStub('takedown-1');
    expect(td.status).toBe('taken_down');
  });
});
