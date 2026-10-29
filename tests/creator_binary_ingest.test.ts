import { describe, it, expect, beforeEach } from 'vitest';
import {
  ingestCreatorOwnedBinary,
  synthesizeCreatorTestWav,
  resetRightsStateForTests,
} from '../packages/game-engine/src/index.js';

describe('creator binary ingest', () => {
  beforeEach(() => {
    resetRightsStateForTests();
  });

  it('validates owned WAV → hash + BPM + chart draft without auto-publish', () => {
    const wav = synthesizeCreatorTestWav({ bpm: 120, durationMs: 5000, sampleRate: 22050 });
    const result = ingestCreatorOwnedBinary({
      trackId: 'creator-bin-1',
      title: 'My Groove',
      artist: 'Local Creator',
      attestorId: 'host-1',
      ownsOrLicensed: true,
      bpm: 120,
      acknowledgeNoAutoPublish: true,
      mimeType: 'audio/wav',
      audioBytes: wav,
    });
    expect(result.ok).toBe(true);
    expect(['binary_validated', 'review_required']).toContain(result.status);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.honesty.audioBinaryStored).toBe(true);
    expect(result.honesty.autoPublished).toBe(false);
    expect(result.honesty.ripPerformed).toBe(false);
    expect(result.catalogDraft?.launchEligible).toBe(false);
    expect(result.chartEditor).not.toBeNull();
    expect(result.bpmEstimate).toBeGreaterThan(0);
  });

  it('rejects platform URLs and missing no-auto-publish ack', () => {
    const wav = synthesizeCreatorTestWav({ durationMs: 3000 });
    const url = ingestCreatorOwnedBinary({
      trackId: 'bad-url',
      title: 'Nope',
      artist: 'Nope',
      attestorId: 'host-1',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      claimedSourceUrl: 'https://open.spotify.com/track/xyz',
      audioBytes: wav,
    });
    expect(url.ok).toBe(false);
    expect(url.status).toBe('rejected_rip');

    const noAck = ingestCreatorOwnedBinary({
      trackId: 'bad-ack',
      title: 'Nope',
      artist: 'Nope',
      attestorId: 'host-1',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: false,
      audioBytes: wav,
    });
    expect(noAck.ok).toBe(false);
    expect(noAck.status).toBe('rejected_auto_publish');
  });

  it('rejects non-WAV / undersized payloads', () => {
    const tiny = ingestCreatorOwnedBinary({
      trackId: 'tiny',
      title: 'Tiny',
      artist: 'A',
      attestorId: 'h',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      audioBytes: new Uint8Array(8),
    });
    expect(tiny.ok).toBe(false);
    expect(tiny.status).toBe('rejected_size');

    const garbage = ingestCreatorOwnedBinary({
      trackId: 'garbage',
      title: 'Garbage',
      artist: 'A',
      attestorId: 'h',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      audioBytes: new Uint8Array(1024).fill(7),
    });
    expect(garbage.ok).toBe(false);
    expect(garbage.status).toBe('rejected_format');
  });
});
