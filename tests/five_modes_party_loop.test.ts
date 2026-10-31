import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';
import { beatmapCacheSize, getBeatmapForSong } from '../apps/server/src/beatmaps/store.js';
import {
  isCallAndResponseWindow,
  resolveSourceEligibilityRouter,
} from '../packages/game-engine/src/index.js';
import { GAME_MODE_IDS, type GameModeId, type PlayerRole } from '../packages/shared/src/types.js';

const APPROVED_SONG = 'demo-neon-groove';

function partyWithPlayers(
  manager: RoomManager,
  mode: GameModeId,
  seats: Array<{ name: string; role: PlayerRole }>,
) {
  const created = manager.createRoom('host-modes');
  const players = seats.map((seat) => {
    const joined = manager.joinRoom(created.code, `tok-${seat.name}`, seat.name)!;
    manager.setRole(created.code, joined.player.id, seat.role);
    manager.setReady(created.code, joined.player.id, true);
    return joined.player;
  });
  manager.setGameMode(created.code, mode);
  const selected = manager.selectSong(created.code, APPROVED_SONG);
  expect(selected?.selectedSongId).toBe(APPROVED_SONG);
  // Published RoomState intentionally omits the full beatmap; internal room keeps it.
  expect(manager.getRoom(created.code)?.beatmap).toBeTruthy();
  manager.startCalibration(created.code);
  manager.submitCalibration(created.code, 0);
  manager.startCountdown(created.code);
  manager.tickCountdown(created.code);
  manager.tickCountdown(created.code);
  manager.tickCountdown(created.code);
  const room = manager.getRoom(created.code)!;
  expect(room.phase).toBe('playing');
  expect(room.gameMode).toBe(mode);
  return { created, players, room };
}

describe('Five registered modes — real party performances', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('reuses the versioned beatmap cache instead of regenerating charts each select', () => {
    const before = beatmapCacheSize();
    const a = getBeatmapForSong(APPROVED_SONG);
    const mid = beatmapCacheSize();
    const b = getBeatmapForSong(APPROVED_SONG);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a!.notes.length).toBe(b!.notes.length);
    expect(beatmapCacheSize()).toBe(mid);
    expect(mid).toBeGreaterThanOrEqual(before);
    // Mutating a returned chart must not poison the cache.
    a!.notes[0]!.timeMs = -999;
    const c = getBeatmapForSong(APPROVED_SONG)!;
    expect(c.notes[0]!.timeMs).not.toBe(-999);
  });

  it('source eligibility router A–F: approved catalog is A/playable; Spotify link is E/F with alternatives', () => {
    const approved = resolveSourceEligibilityRouter({
      catalogEntry: {
        id: APPROVED_SONG,
        title: 'Neon Groove',
        artist: 'BeatLink Demo Ensemble',
        durationMs: 45000,
        bpm: 120,
        beatmapId: 'demo-track-1',
        license: 'demo_generated',
      },
      catalogAlternatives: [
        {
          id: 'demo-crowd-anthem',
          title: 'Crowd Anthem',
          artist: 'BeatLink Demo Ensemble',
          durationMs: 40000,
          bpm: 128,
          beatmapId: 'demo-track-2',
          license: 'demo_generated',
        },
      ],
    });
    expect(approved.letter).toBe('A');
    expect(approved.playable).toBe(true);

    const platform = resolveSourceEligibilityRouter({
      linkResolve: {
        platform: 'spotify',
        sourceId: 'track/abc',
        title: 'Some Hit',
        artist: null,
        album: null,
        artworkUrl: null,
        durationMs: null,
        playbackStatus: 'METADATA_ONLY',
        capabilityState: 'OFFICIAL_EMBED_AVAILABLE',
        mediaClassification: 'embed_only',
        providerCredentialsPresent: false,
        analysisEligible: false,
        lyricsEligible: false,
        matchedCatalogId: null,
        message: 'Metadata only — not rip permission',
        fallbackOptions: ['approved catalog'],
      },
      catalogAlternatives: [
        {
          id: APPROVED_SONG,
          title: 'Neon Groove',
          artist: 'BeatLink Demo Ensemble',
          durationMs: 45000,
          bpm: 120,
          beatmapId: 'demo-track-1',
          license: 'demo_generated',
        },
      ],
    });
    expect(['E', 'F']).toContain(platform.letter);
    expect(platform.playable).toBe(false);
    expect(platform.alternatives.length).toBeGreaterThan(0);
    expect(platform.message).toMatch(/not gameplay/i);
  });

  it('BeatTap scores an independent performer on the approved catalog chart', () => {
    const { created, players, room } = partyWithPlayers(manager, 'BeatTap', [
      { name: 'Tapper', role: 'beat_tapper' },
    ]);
    room.gameStartTime = Date.now() - (room.beatmap!.notes[0]?.timeMs ?? 500);
    const hit = manager.processInput(created.code, {
      playerId: players[0]!.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: room.beatmap!.notes[0]!.id,
    });
    expect(hit?.scoreEvent?.points).toBeGreaterThan(0);
    expect(hit!.scoreEvent!.message).toMatch(/BeatTap|perfect|great|good/i);
    const results = manager.endGame(created.code)!;
    expect(results.players[0]!.score).toBeGreaterThan(0);
  });

  it('CallAndResponse awards response-window match for a joined player', () => {
    const { created, players, room } = partyWithPlayers(manager, 'CallAndResponse', [
      { name: 'Echo', role: 'beat_tapper' },
    ]);
    const responseAt = 4000;
    expect(isCallAndResponseWindow(room.beatmap!.sections, responseAt).phase).toBe('response');
    const responseNote =
      room.beatmap!.notes.find((n) => Math.abs(n.timeMs - responseAt) < 200) ??
      room.beatmap!.notes.find((n) => n.id === 'note-4') ??
      room.beatmap!.notes[0]!;
    room.gameStartTime = Date.now() - responseNote.timeMs;
    expect(
      isCallAndResponseWindow(room.beatmap!.sections, responseNote.timeMs).phase,
    ).toBe('response');
    const hit = manager.processInput(created.code, {
      playerId: players[0]!.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: responseNote.id,
    });
    expect(hit?.scoreEvent?.message).toBe('Response locked!');
  });

  it('KaraokePerformance scores timing-only vocal prompts (no pitch claim)', () => {
    const { created, players, room } = partyWithPlayers(manager, 'KaraokePerformance', [
      { name: 'Singer', role: 'vocalist' },
    ]);
    const prompt = room.beatmap!.vocalPrompts[0]!;
    // Vocal scoring grades against the prompt midpoint (timing-only — no pitch).
    const midMs = prompt.timeMs + prompt.durationMs / 2;
    room.gameStartTime = Date.now() - midMs;
    const hit = manager.processInput(created.code, {
      playerId: players[0]!.id,
      type: 'vocal_fallback_tap',
      clientTimeMs: Date.now(),
      promptId: prompt.id,
    });
    expect(hit?.scoreEvent?.points).toBeGreaterThan(0);
    expect(hit!.scoreEvent!.message).toMatch(/no recording|Phrase hit/i);
  });

  it('BandRoles awards coverage when all three roles are seated and score independently', () => {
    const { created, players, room } = partyWithPlayers(manager, 'BandRoles', [
      { name: 'Drums', role: 'beat_tapper' },
      { name: 'Vox', role: 'vocalist' },
      { name: 'Hype', role: 'hype_captain' },
    ]);
    const note = room.beatmap!.notes[0]!;
    room.gameStartTime = Date.now() - note.timeMs;
    const tap = manager.processInput(created.code, {
      playerId: players[0]!.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: note.id,
    });
    expect(tap?.scoreEvent?.message).toMatch(/Band locked|Band hit/i);
    expect(tap!.scoreEvent!.points).toBeGreaterThan(0);

    const prompt = room.beatmap!.vocalPrompts[0]!;
    const vocalMid = prompt.timeMs + prompt.durationMs / 2;
    room.gameStartTime = Date.now() - vocalMid;
    const vocal = manager.processInput(created.code, {
      playerId: players[1]!.id,
      type: 'vocal_fallback_tap',
      clientTimeMs: Date.now(),
      promptId: prompt.id,
    });
    expect(vocal?.scoreEvent?.points).toBeGreaterThan(0);

    const hypeEvent = room.beatmap!.hypeEvents[0];
    room.gameStartTime = Date.now() - (hypeEvent?.timeMs ?? 1000);
    const hype = manager.processInput(created.code, {
      playerId: players[2]!.id,
      type: 'hype_cheer',
      clientTimeMs: Date.now(),
    });
    expect(hype?.scoreEvent?.points).toBeGreaterThan(0);
    expect(hype!.scoreEvent!.message).toMatch(/Band locked|Band hit/i);

    const results = manager.endGame(created.code)!;
    expect(results.players.every((p) => p.score >= 0)).toBe(true);
    expect(results.players.some((p) => p.score > 0)).toBe(true);
  });

  it('PredictionTrivia locks a correct section for a joined hype captain', () => {
    const { created, players, room } = partyWithPlayers(manager, 'PredictionTrivia', [
      { name: 'Caller', role: 'hype_captain' },
    ]);
    room.gameStartTime = Date.now() - 1000;
    const verse = room.beatmap!.sections.find((s) => s.id === 'verse')!;
    const hit = manager.processInput(created.code, {
      playerId: players[0]!.id,
      type: 'prediction_lock',
      clientTimeMs: Date.now(),
      sectionId: verse.id,
      predictionChoice: 'Verse',
    });
    expect(hit?.scoreEvent?.message).toBe('Prediction correct!');
    expect(hit!.scoreEvent!.points).toBeGreaterThan(0);
  });

  it('registers exactly the five modes and preserves rematch host authority after a round', () => {
    expect(GAME_MODE_IDS).toEqual([
      'BeatTap',
      'CallAndResponse',
      'KaraokePerformance',
      'BandRoles',
      'PredictionTrivia',
    ]);
    const { created, players } = partyWithPlayers(manager, 'BeatTap', [
      { name: 'Solo', role: 'beat_tapper' },
    ]);
    manager.endGame(created.code);
    // Host rematch keeps seats and host authority; chart cache is reused on next select.
    const rematch = manager.rematch(created.code)!;
    expect(rematch.phase).toBe('lobby');
    expect(rematch.players.some((p) => p.id === players[0]!.id)).toBe(true);
    manager.selectSong(created.code, APPROVED_SONG);
    expect(manager.getRoom(created.code)?.beatmap?.notes.length).toBeGreaterThan(0);
  });
});
