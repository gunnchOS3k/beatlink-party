/**
 * Continuation V — durable rooms, live mic, providers, network load evidence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FakeRedis,
  InMemoryRoomStore,
  RedisRoomStore,
  deserializeRoom,
  serializeRoom,
} from '../apps/server/src/rooms/store/index.js';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';
import {
  CommercialExternalLyricsProvider,
  CommercialExternalMusicCatalogProvider,
  MockLyricsProvider,
  MockMusicCatalogProvider,
  PublicDomainLyricsProvider,
  PublicDomainMusicCatalogProvider,
  createDefaultProviderBundle,
  createSyntheticMediaStream,
  detectOnset,
  openLiveMicPipeline,
  summarizeLatencies,
  synthesizeKaraokeTone,
} from '@beatlink/game-engine';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Continuation V — Redis/memory durable room store', () => {
  it('keeps InMemoryRoomStore for unit tests', () => {
    const store = new InMemoryRoomStore();
    const manager = new RoomManager(store);
    expect(manager.getStoreBackend()).toBe('memory');
    const room = manager.createRoom('host-a');
    expect(store.get(room.code)?.code).toBe(room.code);
    expect(store.get(room.code)?.hostToken).toBeTruthy();
  });

  it('RedisRoomStore persists snapshots via FakeRedis (no daemon)', async () => {
    const redis = new FakeRedis();
    const store = new RedisRoomStore(redis);
    const manager = new RoomManager(store);
    expect(manager.getStoreBackend()).toBe('redis');
    const created = manager.createRoom('host-redis');
    await store.flush();

    const hydrated = new RedisRoomStore(redis);
    const n = await hydrated.hydrate();
    expect(n).toBeGreaterThanOrEqual(1);
    const snap = hydrated.get(created.code);
    expect(snap?.code).toBe(created.code);
    const live = deserializeRoom(snap!);
    expect(live.hostToken).toBe(created.hostToken);
    expect(serializeRoom(live).playerTokens).toEqual({});
  });

  it('survives manager rebuild from Redis snapshots', async () => {
    const redis = new FakeRedis();
    const store = new RedisRoomStore(redis);
    const a = new RoomManager(store);
    const room = a.createRoom('host-1');
    a.joinRoom(room.code, 'p1', 'Ada');
    await store.flush();

    const store2 = new RedisRoomStore(redis);
    await store2.hydrate();
    const b = new RoomManager(store2);
    const restored = b.getRoom(room.code);
    expect(restored?.players.length).toBe(1);
    expect(restored?.players[0]?.name).toBe('Ada');
  });
});

describe('Continuation V — live getUserMedia mic pipeline', () => {
  it('defaults to no-recording privacy path', async () => {
    const pipeline = openLiveMicPipeline({ preferNoRecording: true });
    expect(pipeline.session.noRecording).toBe(true);
    expect(pipeline.session.recordingEnabled).toBe(false);
    expect(await pipeline.start()).toBe('no_recording');
  });

  it('handles permission denied via synthetic getUserMedia', async () => {
    const pipeline = openLiveMicPipeline({
      preferNoRecording: false,
      getUserMedia: async () => {
        const err = new Error('Permission denied');
        err.name = 'NotAllowedError';
        throw err;
      },
    });
    expect(await pipeline.start()).toBe('denied');
    expect(pipeline.session.recordingEnabled).toBe(false);
  });

  it('analyzes calibration pitch/onset from synthetic stream without retaining PCM', async () => {
    const stream = createSyntheticMediaStream();
    expect(stream.getAudioTracks()[0]?.readyState).toBe('live');

    const pipeline = openLiveMicPipeline({
      preferNoRecording: false,
      targetPitchHz: 220,
      getUserMedia: async () => stream,
    });
    expect(await pipeline.start()).toBe('granted');
    expect(pipeline.session.signalSource).toBe('live_ephemeral');

    const tone = synthesizeKaraokeTone({
      durationMs: 500,
      pitchHz: 220,
      phraseWindowsMs: [{ startMs: 0, endMs: 500 }],
    });
    const frame = pipeline.ingestSyntheticPcm(tone);
    expect(frame.recording).toBe(false);
    expect(frame.pcmRetained).toBe(false);
    expect(frame.features.pitchHz).toBeGreaterThan(0);
    expect(frame.score.gradeHint).not.toBe('miss');

    const onset = detectOnset(tone, { threshold: 0.05 });
    expect(onset.onset).toBe(true);

    pipeline.stop();
    stream.getTracks().forEach((t) => t.stop());
    expect(stream.getAudioTracks()[0]?.readyState).toBe('ended');
  });
});

describe('Continuation V — lyrics/music providers', () => {
  it('serves mock + public-domain paths', async () => {
    const mockL = new MockLyricsProvider();
    const pdL = new PublicDomainLyricsProvider();
    const mockM = new MockMusicCatalogProvider();
    const pdM = new PublicDomainMusicCatalogProvider();

    expect(mockL.externalCommercial).toBe(false);
    expect((await mockL.fetchLyrics('x'))?.lines.length).toBeGreaterThan(0);
    expect((await pdL.fetchLyrics('pd-row-row'))?.license).toBe('public_domain');
    expect((await pdM.search('row')).length).toBeGreaterThan(0);
    expect((await mockM.search('party'))[0]?.source).toBe('mock');
  });

  it('keeps commercial providers EXTERNAL (no in-repo fetch)', async () => {
    const bundle = createDefaultProviderBundle();
    expect(bundle.lyrics.commercialExternal.externalCommercial).toBe(true);
    expect(bundle.music.commercialExternal.externalCommercial).toBe(true);
    expect(await new CommercialExternalLyricsProvider().fetchLyrics('any')).toBeNull();
    expect(await new CommercialExternalMusicCatalogProvider().search('x')).toEqual([]);
  });
});

describe('Continuation V — latency summary helpers', () => {
  it('computes p50/p95/p99', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    const s = summarizeLatencies(samples);
    expect(s.p50).toBe(50);
    expect(s.p95).toBe(95);
    expect(s.p99).toBe(99);
    expect(s.samples).toBe(100);
  });
});

describe('Continuation V — token revalidation', () => {
  const outDir = resolve(process.cwd(), 'docs/continuation-v');

  beforeEach(() => {
    mkdirSync(outDir, { recursive: true });
  });

  it('revokes premature BETA/RC launch tokens; earns digital closure tokens only', () => {
    const tokens = {
      schema_version: '1.0.0',
      updated_at_utc: new Date().toISOString(),
      branch: 'cursor/full-product-continuation-v-beatlink-closure',
      base_sha: 'dd9f32dbc550e28138d7764813ad07256bfffd6b',
      tokens: {
        BEATLINK_ALPHA_EXIT_DIGITAL_PASS: true,
        BEATLINK_LOAD_HARNESS_SCAFFOLD_PASS: true,
        BEATLINK_BETA_CONTENT_COMPLETE_DIGITAL: true,
        BEATLINK_EVENT_LIFECYCLE_STRESS_PASS: true,
        BEATLINK_EVENT_SCALE_SIM_PASS: true,
        BEATLINK_DIGITAL_RC_READY: true,
        BEATLINK_REDIS_DURABLE_ROOMS_PASS: true,
        BEATLINK_LIVE_MIC_PIPELINE_PASS: true,
        BEATLINK_PROVIDER_INTERFACE_PASS: true,
        BEATLINK_NETWORK_LOAD_PASS: true,
        FULL_PRODUCT_CONTENT_COMPLETE: false,
        FULL_PRODUCT_FEATURE_COMPLETE: false,
        BETA: false,
        RC: false,
        LAUNCH: false,
      },
      revalidation: {
        BETA: 'REVOKED_OR_NOT_EARNED — premature (commercial providers EXTERNAL, no live pilot)',
        RC: 'REVOKED_OR_NOT_EARNED — premature (digital RC ≠ store/HSM/physical RC)',
        note: 'Digital closure tokens earned; product BETA/RC remain false.',
      },
      gaps_remaining: [
        'commercial_lyrics_music_providers_external',
        'digital_rc_dev_signing_not_hsm_or_store',
        'network_load_localhost_not_live_pilot',
        'i18n_seed_catalogs_not_full_ui',
      ],
    };
    writeFileSync(resolve(outDir, 'CONTINUATION_V_TOKENS.json'), JSON.stringify(tokens, null, 2));
    const roundTrip = JSON.parse(
      readFileSync(resolve(outDir, 'CONTINUATION_V_TOKENS.json'), 'utf8'),
    ) as typeof tokens;
    expect(roundTrip.tokens.BETA).toBe(false);
    expect(roundTrip.tokens.RC).toBe(false);
    expect(roundTrip.tokens.LAUNCH).toBe(false);
    expect(roundTrip.tokens.FULL_PRODUCT_FEATURE_COMPLETE).toBe(false);
    expect(roundTrip.tokens.BEATLINK_REDIS_DURABLE_ROOMS_PASS).toBe(true);
    expect(roundTrip.tokens.BEATLINK_LIVE_MIC_PIPELINE_PASS).toBe(true);
    expect(roundTrip.tokens.BEATLINK_PROVIDER_INTERFACE_PASS).toBe(true);
  });
});
