import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import type { SongCatalogEntry } from '@beatlink/shared';
import {
  applyMicMatrixAction,
  auditCatalogRights,
  createCreatorDraftStore,
  createMicMatrixState,
  evaluateMicMatrix,
  ingestCreatorOwnedBinary,
  micMatrixBanner,
  resetRightsStateForTests,
  synthesizeCreatorTestWav,
  synthesizeKaraokeTone,
  KARAOKE_SUPPORTED_SAMPLE_RATES,
} from '../packages/game-engine/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadLaunch(): SongCatalogEntry[] {
  const raw = JSON.parse(
    readFileSync(join(root, 'content/songs/offline-launch-catalog.json'), 'utf-8'),
  ) as { songs: SongCatalogEntry[] };
  return raw.songs;
}

describe('launch rights audit — ownership vs license', () => {
  it('has six stereo launch songs with commercialEligible false and no fake PD', () => {
    const songs = loadLaunch();
    expect(songs).toHaveLength(6);
    for (const s of songs) {
      expect(s.rights?.commercialEligible).toBe(false);
      expect(s.rights?.ownershipClass).toBeTruthy();
      expect(s.license).not.toBe('public_domain');
      expect(s.assetSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(s.karaokeMeta?.phrases?.length).toBeGreaterThan(0);
    }
    const audit = auditCatalogRights(songs);
    expect(audit.ok).toBe(true);
    expect(audit.commercialEligibleAny).toBe(false);
    expect(audit.findings.filter((f) => f.severity === 'block')).toEqual([]);
  });

  it('separates CC deed releases from ownership class', () => {
    const cc = loadLaunch().filter((s) => s.license === 'creative_commons');
    expect(cc.length).toBeGreaterThanOrEqual(2);
    for (const s of cc) {
      expect(s.rights?.ownershipClass).toBe('first_party_original');
      expect(s.rights?.ccDeedUrl || s.rights?.thirdPartyLicense?.deedUrl).toBeTruthy();
      expect(s.rights?.licenseLabel).toMatch(/CC/);
    }
  });
});

describe('creator draft store — durable drafts, withdraw, no auto-publish', () => {
  beforeEach(() => {
    resetRightsStateForTests();
  });

  it('stores draft from binary ingest and blocks publish; withdraw clears', () => {
    const store = createCreatorDraftStore();
    const wav = synthesizeCreatorTestWav({ bpm: 120, durationMs: 4000 });
    const ingest = ingestCreatorOwnedBinary({
      trackId: 'draft-track-1',
      title: 'Draft Groove',
      artist: 'Creator',
      attestorId: 'host-a',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      audioBytes: wav,
      mimeType: 'audio/wav',
    });
    expect(ingest.ok).toBe(true);
    const draft = store.saveFromIngest(ingest, 'host-a');
    expect(draft).not.toBeNull();
    expect(draft!.catalogDraft.launchEligible).toBe(false);
    expect(draft!.rightsGate.autoPublish).toBe(false);
    expect(draft!.rightsGate.commercialEligible).toBe(false);

    const pub = store.attemptPublish(draft!.draftId);
    expect(pub.ok).toBe(false);
    expect(pub.reason).toBe('no_auto_publish');

    const withdrawn = store.withdraw(draft!.draftId, 'host-a');
    expect(withdrawn?.status).toBe('withdrawn');
    expect(store.list('host-a')).toHaveLength(0);
  });
});

describe('karaoke mic matrix — deny/grant/revoke + rates + silence', () => {
  it('defaults pitch false; grant alone insufficient; revoke drops claim', () => {
    let state = createMicMatrixState();
    expect(state.microphonePitchAnalysis).toBe(false);
    expect(state.a11yFallbackActive).toBe(true);

    state = applyMicMatrixAction(state, 'grant');
    expect(state.permission).toBe('granted');
    expect(state.microphonePitchAnalysis).toBe(false);

    const tone = synthesizeKaraokeTone({
      durationMs: 100,
      sampleRate: 48000,
      pitchHz: 220,
      phraseWindowsMs: [{ startMs: 0, endMs: 100 }],
    });
    const live = evaluateMicMatrix(state, {
      permission: 'granted',
      continuousLive: true,
      realVocalStream: true,
      pcm: tone,
      sampleRate: 48000,
      targetPitchHz: 220,
      latencyMs: 40,
    });
    expect(live.state.signalKind).toBe('real_vocal_ephemeral');
    expect(live.state.microphonePitchAnalysis).toBe(true);
    expect(micMatrixBanner(live.state)).toContain('MICROPHONE_PITCH_ANALYSIS=true');

    state = applyMicMatrixAction(live.state, 'revoke');
    expect(state.microphonePitchAnalysis).toBe(false);
    expect(state.a11yFallbackActive).toBe(true);

    state = applyMicMatrixAction(state, 'deny');
    expect(state.permission).toBe('denied');
    expect(state.microphonePitchAnalysis).toBe(false);
  });

  it('rejects synthetic and silence as pitch authorization', () => {
    const state = applyMicMatrixAction(createMicMatrixState(), 'grant');
    const silence = new Float32Array(48000 * 0.08);
    const syn = evaluateMicMatrix(state, {
      permission: 'granted',
      continuousLive: true,
      realVocalStream: false,
      pcm: synthesizeKaraokeTone({
        durationMs: 100,
        sampleRate: 44100,
        pitchHz: 220,
        phraseWindowsMs: [{ startMs: 0, endMs: 100 }],
      }),
      sampleRate: 44100,
    });
    expect(syn.state.microphonePitchAnalysis).toBe(false);
    expect(syn.state.signalKind).toBe('synthetic');

    const sil = evaluateMicMatrix(state, {
      permission: 'granted',
      continuousLive: true,
      realVocalStream: true,
      pcm: silence,
      sampleRate: 48000,
    });
    expect(sil.state.microphonePitchAnalysis).toBe(false);
    expect(sil.state.signalKind).toBe('silence');
  });

  it('supports 16/22.05/44.1/48 kHz sample rates', () => {
    expect(KARAOKE_SUPPORTED_SAMPLE_RATES).toEqual([16000, 22050, 44100, 48000]);
  });
});
