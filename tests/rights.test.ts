import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRightsAttestation,
  gateMusicSource,
  getAttestation,
  markTakedown,
  playbackStatusForAttestation,
  refreshAttestationStatus,
  resetRightsStateForTests,
  RightsExpiredError,
  RightsTakedownError,
  UnsupportedSourceError,
} from '../packages/game-engine/src/rights.js';
import type { SongCatalogEntry } from '../packages/shared/src/types.js';

const catalogSong: SongCatalogEntry = {
  id: 'synth-click-train-120',
  title: 'Click Train 120',
  artist: 'BeatLink Synthetic Lab',
  durationMs: 30000,
  bpm: 120,
  beatmapId: 'synth-click-120',
  license: 'synthetic_original',
  description: 'Synthetic',
};

describe('rights-gated music pipeline', () => {
  beforeEach(() => {
    resetRightsStateForTests();
  });

  it('attests user-owned uploads and maps to PLAYABLE_APPROVED', () => {
    const att = createRightsAttestation({
      trackId: 'upload-1',
      attestorId: 'host-a',
      ownsOrLicensed: true,
      sourceKind: 'user_upload',
      ttlMs: 60_000,
      nowMs: 1_000,
    });
    expect(att.status).toBe('attested');
    expect(playbackStatusForAttestation(att.status)).toBe('PLAYABLE_APPROVED');
    expect(getAttestation('upload-1')?.ownsOrLicensed).toBe(true);
  });

  it('rejects unattested uploads', () => {
    const att = createRightsAttestation({
      trackId: 'upload-bad',
      attestorId: 'host-a',
      ownsOrLicensed: false,
      sourceKind: 'user_upload',
    });
    expect(att.status).toBe('rejected');
    expect(playbackStatusForAttestation(att.status)).toBe('NEEDS_LICENSE');
  });

  it('returns UnsupportedSourceError for claimed rip URLs (never rip)', () => {
    const gated = gateMusicSource({
      catalogEntry: catalogSong,
      claimedRipUrl: 'https://youtube.com/watch?v=abc',
    });
    expect(gated.ok).toBe(false);
    if (!gated.ok) {
      expect(gated.error).toBeInstanceOf(UnsupportedSourceError);
      expect(gated.playbackStatus).toBe('UNSUPPORTED');
    }
  });

  it('allows approved catalog without attestation', () => {
    const gated = gateMusicSource({ catalogEntry: catalogSong });
    expect(gated.ok).toBe(true);
    if (gated.ok) expect(gated.playbackStatus).toBe('PLAYABLE_APPROVED');
  });

  it('expires attestation and surfaces RIGHTS_EXPIRED', () => {
    createRightsAttestation({
      trackId: 'expiring',
      attestorId: 'host',
      ownsOrLicensed: true,
      sourceKind: 'user_upload',
      ttlMs: 1000,
      nowMs: 0,
    });
    expect(refreshAttestationStatus('expiring', 500)).toBe('attested');
    expect(refreshAttestationStatus('expiring', 2000)).toBe('expired');
    const gated = gateMusicSource({
      attestation: getAttestation('expiring'),
      nowMs: 2000,
    });
    expect(gated.ok).toBe(false);
    if (!gated.ok) {
      expect(gated.error).toBeInstanceOf(RightsExpiredError);
      expect(gated.playbackStatus).toBe('RIGHTS_EXPIRED');
    }
  });

  it('blocks takedown tracks', () => {
    createRightsAttestation({
      trackId: 'td-1',
      attestorId: 'host',
      ownsOrLicensed: true,
      sourceKind: 'user_upload',
    });
    const td = markTakedown('td-1', 50);
    expect(td.status).toBe('taken_down');
    const gated = gateMusicSource({ attestation: td, nowMs: 100 });
    expect(gated.ok).toBe(false);
    if (!gated.ok) {
      expect(gated.error).toBeInstanceOf(RightsTakedownError);
      expect(gated.playbackStatus).toBe('TAKEN_DOWN');
    }
  });
});
