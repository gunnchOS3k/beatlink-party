import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';
import {
  buildPredictionChoices,
  isCallAndResponseWindow,
  nextPredictionSection,
  predictionChoiceCorrect,
  resolveMediaDescriptor,
} from '../packages/game-engine/src/index.js';
import { CommercialExternalLyricsProvider } from '../packages/game-engine/src/providers.js';
import { GAME_MODE_IDS, MAX_PERFORMERS } from '../packages/shared/src/types.js';
import type { Beatmap, GameModeId, PlayerRole } from '../packages/shared/src/types.js';

function startPlaying(
  manager: RoomManager,
  mode: GameModeId,
  role: PlayerRole = 'beat_tapper',
) {
  const created = manager.createRoom('host-1');
  const { player } = manager.joinRoom(created.code, 'p1', 'Alice')!;
  manager.setRole(created.code, player.id, role);
  manager.setReady(created.code, player.id, true);
  manager.setGameMode(created.code, mode);
  manager.selectSong(created.code, 'demo-neon-groove');
  manager.startCalibration(created.code);
  manager.submitCalibration(created.code, 0);
  manager.startCountdown(created.code);
  manager.tickCountdown(created.code);
  manager.tickCountdown(created.code);
  manager.tickCountdown(created.code);
  return { created, player };
}

describe('GAME successor — mode runtime depth', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('CallAndResponse awards response-window match, not call-phase taps', () => {
    const { created, player } = startPlaying(manager, 'CallAndResponse');
    const internal = manager.getRoom(created.code)!;
    expect(internal.gameMode).toBe('CallAndResponse');
    expect(internal.beatmap).toBeTruthy();

    const callAt = 2500;
    const responseAt = 4000;
    expect(isCallAndResponseWindow(internal.beatmap!.sections, callAt).phase).toBe('call');
    expect(isCallAndResponseWindow(internal.beatmap!.sections, responseAt).phase).toBe(
      'response',
    );

    internal.gameStartTime = Date.now() - callAt;
    const callHit = manager.processInput(created.code, {
      playerId: player.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: 'note-1',
    });
    expect(callHit?.scoreEvent?.message).not.toBe('Response locked!');

    internal.gameStartTime = Date.now() - responseAt;
    const responseHit = manager.processInput(created.code, {
      playerId: player.id,
      type: 'tap',
      clientTimeMs: Date.now(),
      noteId: 'note-4',
    });
    expect(responseHit?.scoreEvent?.message).toBe('Response locked!');
    expect(responseHit!.scoreEvent!.points).toBeGreaterThan(callHit!.scoreEvent!.points);
  });

  it('PredictionTrivia scores correct lock before section start', () => {
    const { created, player } = startPlaying(manager, 'PredictionTrivia', 'hype_captain');
    const internal = manager.getRoom(created.code)!;
    internal.gameStartTime = Date.now() - 1000;
    const target = nextPredictionSection(internal.beatmap!.sections, 1000);
    expect(target?.label).toBe('Verse');
    expect(predictionChoiceCorrect(target!, 'verse')).toBe(true);

    const result = manager.processInput(created.code, {
      playerId: player.id,
      type: 'prediction_lock',
      clientTimeMs: Date.now(),
      sectionId: target!.id,
      predictionChoice: 'Verse',
    });
    expect(result?.scoreEvent?.message).toBe('Prediction correct!');
    expect(result!.scoreEvent!.points).toBeGreaterThan(0);
  });

  it('PredictionTrivia rejects late locks and wrong choices', () => {
    const { created, player } = startPlaying(manager, 'PredictionTrivia');
    const internal = manager.getRoom(created.code)!;
    const verse = internal.beatmap!.sections.find((s) => s.id === 'verse')!;

    internal.gameStartTime = Date.now() - (verse.startMs + 50);
    const late = manager.processInput(created.code, {
      playerId: player.id,
      type: 'prediction_lock',
      clientTimeMs: Date.now(),
      sectionId: verse.id,
      predictionChoice: 'Verse',
    });
    expect(late?.scoreEvent?.grade).toBe('miss');
    expect(late?.scoreEvent?.points).toBe(0);

    const { created: c2, player: p2 } = startPlaying(manager, 'PredictionTrivia');
    const room2 = manager.getRoom(c2.code)!;
    room2.gameStartTime = Date.now() - 1000;
    const wrong = manager.processInput(c2.code, {
      playerId: p2.id,
      type: 'prediction_lock',
      clientTimeMs: Date.now(),
      sectionId: 'verse',
      predictionChoice: 'Outro',
    });
    expect(wrong?.scoreEvent?.message).toBe('Wrong prediction');
    expect(wrong?.scoreEvent?.points).toBe(0);
  });

  it('prediction choice count follows difficulty hooks and stays deterministic', () => {
    const beatmap = manager.getRoom(startPlaying(manager, 'BeatTap').created.code)!.beatmap!;
    const target = beatmap.sections[1]!;
    const casual = buildPredictionChoices(beatmap, 'casual', target);
    const nightmare = buildPredictionChoices(beatmap, 'nightmare', target);
    expect(casual.length).toBe(3);
    expect(nightmare.length).toBeGreaterThanOrEqual(casual.length);
    expect(buildPredictionChoices(beatmap, 'casual', target)).toEqual(casual);
  });

  it('karaoke mic path stays no-recording and commercial lyrics stay EXTERNAL null', async () => {
    const lyrics = new CommercialExternalLyricsProvider();
    expect(lyrics.externalCommercial).toBe(true);
    expect(await lyrics.fetchLyrics('any')).toBeNull();
  });

  it('provider media never exposes a ripped stream URL for platform links', () => {
    const descriptor = resolveMediaDescriptor({
      linkResult: {
        platform: 'youtube',
        sourceId: 'watch?v=abc',
        title: 'Some Track',
        artist: null,
        album: null,
        artworkUrl: null,
        durationMs: null,
        playbackStatus: 'METADATA_ONLY',
        analysisEligible: false,
        lyricsEligible: false,
        matchedCatalogId: null,
        message: 'Metadata only',
        fallbackOptions: ['approved catalog'],
      },
    });
    expect(descriptor.playbackStatus).toBe('METADATA_ONLY');
    expect(descriptor.kind === 'authorized_embed' || descriptor.kind === 'metadata_only').toBe(
      true,
    );
    expect(JSON.stringify(descriptor)).not.toMatch(/googlevideo|ytimg-rip|stream\.mp3/i);
  });

  it('host lobby capacity copy matches MAX_PERFORMERS', () => {
    expect(MAX_PERFORMERS).toBe(8);
    const hostSrc = readFileSync(resolve(here, '../apps/web/src/pages/HostPage.tsx'), 'utf8');
    expect(hostSrc).toContain('MAX_PERFORMERS');
    expect(hostSrc).not.toMatch(/players\.length \?\? 0\}\/6\)/);
  });

  it('machine-readable register covers required facets', () => {
    const register = JSON.parse(
      readFileSync(
        resolve(here, '../artifacts/beatlink_full/BEATLINK_FULL_PRODUCT_REGISTER.json'),
        'utf8',
      ),
    ) as {
      features: Record<string, { status: string }>;
      rights_safety: { rip_download_decrypt_forbidden: boolean };
      FULL_GAME_CONTENT_COMPLETE: boolean;
    };
    const required = [
      'beat_tap',
      'call_and_response',
      'karaoke',
      'band_roles',
      'prediction_trivia',
      'audience_impact',
      'room_lifecycle',
      'host_player_audience',
      'phone_first',
      'score',
      'latency_calibration',
      'reconnect',
      'host_migration',
      'session_pause',
      'settings_a11y',
      'telemetry',
      'moderation_privacy',
      'results_rematch',
      'provider_media_rights',
    ];
    for (const key of required) {
      expect(register.features[key]?.status, key).toMatch(/^PASS_/);
    }
    expect(register.rights_safety.rip_download_decrypt_forbidden).toBe(true);
    expect(register.FULL_GAME_CONTENT_COMPLETE).toBe(false);
    expect(GAME_MODE_IDS).toHaveLength(5);
  });
});

describe('GAME successor — modeRuntime helpers', () => {
  const sections: Beatmap['sections'] = [
    { id: 'intro', label: 'Intro', startMs: 0, endMs: 1000 },
    { id: 'verse', label: 'Verse', startMs: 1000, endMs: 2000 },
  ];

  it('maps call vs response halves', () => {
    expect(isCallAndResponseWindow(sections, 100).phase).toBe('call');
    expect(isCallAndResponseWindow(sections, 600).phase).toBe('response');
    expect(isCallAndResponseWindow(sections, 9999).phase).toBe('idle');
  });
});
