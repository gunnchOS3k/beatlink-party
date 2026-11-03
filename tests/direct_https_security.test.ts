/**
 * BL-LINK acquisition security negatives for direct HTTPS:
 * SSRF/private net, redirects/DNS rebind, MIME spoof, oversized, invalid rights,
 * expired media, draft isolation. Controlled fixtures only — no third-party probes.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  DIRECT_HTTPS_MAX_BYTES,
  defaultCreatorDraftStore,
  evaluateDirectHttpsMedia,
  firstPartyOriginalRightsLayers,
  ingestCreatorOwnedBinary,
  pinDirectHttpsDestinations,
  probeDirectHttpsMedia,
  synthesizeCreatorTestWav,
  validateDirectHttpsMediaBytes,
  validateDirectHttpsUrlPolicy,
} from '../packages/game-engine/src/index.js';
import { RoomManager } from '../apps/server/src/rooms/RoomManager.js';

const hash = 'b'.repeat(64);
const publicUrl = 'https://cdn.example.com/owned/track.wav';

describe('direct HTTPS acquisition security', () => {
  beforeEach(() => {
    defaultCreatorDraftStore.resetForTests();
  });

  it('NEGATIVE: SSRF / private-net destinations refused', () => {
    for (const raw of [
      'https://127.0.0.1/a.wav',
      'https://10.1.2.3/a.wav',
      'https://172.16.9.9/a.wav',
      'https://192.168.100.1/a.wav',
      'https://169.254.169.254/latest.wav',
      'https://100.64.0.1/cgnat.wav',
      'https://metadata.google.internal/a.wav',
      'https://[fd00::1]/a.wav',
    ]) {
      const policy = validateDirectHttpsUrlPolicy(raw);
      expect(policy.ok, raw).toBe(false);
    }
  });

  it('NEGATIVE: DNS rebind to private A/AAAA refused before fetch', async () => {
    let fetched = false;
    const pin = await pinDirectHttpsDestinations('cdn.example.com', async () => [
      '8.8.8.8',
      '192.168.1.20',
    ]);
    expect(pin.ok).toBe(false);

    const probe = await probeDirectHttpsMedia(publicUrl, {
      dnsLookup: async () => ['127.0.0.1'],
      fetchImpl: (async () => {
        fetched = true;
        return new Response(null, { status: 200, headers: { 'content-type': 'audio/wav' } });
      }) as unknown as typeof fetch,
    });
    expect(fetched).toBe(false);
    expect(probe.ok).toBe(false);
    expect(probe.blockers.join(' ')).toMatch(/127\.0\.0\.1|blocked|private/i);
  });

  it('NEGATIVE: redirect hop + private Location refused', async () => {
    const probe = await probeDirectHttpsMedia(publicUrl, {
      maxRedirects: 1,
      fetchImpl: (async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://169.254.169.254/meta.wav' },
        })) as unknown as typeof fetch,
    });
    expect(probe.ok).toBe(false);
    expect(probe.redirected).toBe(true);
    expect(probe.blockers.join(' ').toLowerCase()).toMatch(/redirect|blocked|169/);
  });

  it('NEGATIVE: MIME spoof (audio path + text/html Content-Type) refused by probe', async () => {
    const probe = await probeDirectHttpsMedia(publicUrl, {
      fetchImpl: (async () =>
        new Response(null, {
          status: 200,
          headers: {
            'content-type': 'text/html',
            'content-length': '2048',
          },
        })) as unknown as typeof fetch,
    });
    expect(probe.ok).toBe(false);
    expect(probe.blockers.join(' ').toLowerCase()).toMatch(/mime spoof|not wav|html/);
  });

  it('NEGATIVE: MIME spoof on bytes (declared audio/mpeg + RIFF body)', () => {
    const wav = synthesizeCreatorTestWav({ bpm: 120, durationMs: 500, sampleRate: 22050 });
    const gate = validateDirectHttpsMediaBytes(wav, 'audio/mpeg');
    expect(gate.ok).toBe(false);
    expect(gate.mimeSpoof).toBe(true);
    expect(gate.magic).toBe('wav');
  });

  it('NEGATIVE: oversized Content-Length refused', async () => {
    const probe = await probeDirectHttpsMedia(publicUrl, {
      fetchImpl: (async () =>
        new Response(null, {
          status: 200,
          headers: {
            'content-type': 'audio/wav',
            'content-length': String(DIRECT_HTTPS_MAX_BYTES + 1),
          },
        })) as unknown as typeof fetch,
    });
    expect(probe.ok).toBe(false);
    expect(probe.contentLength).toBe(DIRECT_HTTPS_MAX_BYTES + 1);
    expect(probe.blockers.join(' ')).toMatch(/oversized|MAX_BYTES/i);

    const layers = firstPartyOriginalRightsLayers();
    const decision = evaluateDirectHttpsMedia({
      url: publicUrl,
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      contentLength: DIRECT_HTTPS_MAX_BYTES + 99,
    });
    expect(decision.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');
    expect(decision.blockers.join(' ')).toMatch(/oversized|MAX_BYTES/i);
  });

  it('NEGATIVE: invalid rights (no reproduction / no sync) deny gameplay', () => {
    const decision = evaluateDirectHttpsMedia({
      url: publicUrl,
      contentSha256: hash,
      composition: {
        basis: 'none',
        syncAuthorized: false,
        adaptationAuthorized: false,
        attributionText: '',
      },
      soundRecording: {
        basis: 'none',
        reproductionAuthorized: false,
        attributionText: '',
      },
      beatGridReady: true,
      chartsReady: true,
    });
    expect(decision.rightsOk).toBe(false);
    expect(decision.syncEligible).toBe(false);
    expect(decision.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');
  });

  it('NEGATIVE: expired media attestation refuses evaluate', () => {
    const layers = firstPartyOriginalRightsLayers();
    const decision = evaluateDirectHttpsMedia({
      url: publicUrl,
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
      rightsExpiresAtMs: 1_700_000_000_000,
      nowMs: 1_800_000_000_000,
    });
    expect(decision.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');
    expect(decision.blockers.join(' ').toLowerCase()).toMatch(/expired/);
  });

  it('NEGATIVE: draft isolation — foreign withdraw, withdrawn hash, attestor list', () => {
    const wav = synthesizeCreatorTestWav({ bpm: 100, durationMs: 1200 });
    const sha = createHash('sha256').update(wav).digest('hex');
    const ingest = ingestCreatorOwnedBinary({
      trackId: `iso-${sha.slice(0, 8)}`,
      title: 'Isolation Fixture',
      artist: 'Owner A',
      attestorId: 'owner-a',
      ownsOrLicensed: true,
      acknowledgeNoAutoPublish: true,
      audioBytes: wav,
      mimeType: 'audio/wav',
      declaredLicense: 'creator_owned',
    });
    const draft = defaultCreatorDraftStore.saveFromIngest(ingest, 'owner-a', Date.now(), wav)!;
    expect(defaultCreatorDraftStore.list('owner-b')).toHaveLength(0);
    expect(defaultCreatorDraftStore.list('owner-a').map((d) => d.draftId)).toContain(draft.draftId);

    const foreign = defaultCreatorDraftStore.withdraw(draft.draftId, 'owner-b');
    expect(foreign).toBeNull();
    expect(['draft', 'review_pending']).toContain(defaultCreatorDraftStore.get(draft.draftId)?.status);
    expect(defaultCreatorDraftStore.get(draft.draftId)?.audioBytes?.byteLength).toBe(wav.byteLength);

    const withdrawn = defaultCreatorDraftStore.withdraw(draft.draftId, 'owner-a');
    expect(withdrawn?.status).toBe('withdrawn');
    expect(withdrawn?.audioBytes).toBeNull();
    expect(defaultCreatorDraftStore.findBySha256(sha)).toBeNull();

    const layers = firstPartyOriginalRightsLayers();
    const manager = new RoomManager();
    const room = manager.createRoom('host-iso');
    const attached = manager.attachDirectHttps(room.code, {
      url: 'https://cdn.example.com/owned/iso.wav',
      contentSha256: sha,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
    });
    expect(attached!.attach.scoredPlayAllowed).toBe(false);
    expect(attached!.room.privateMedia).toBeNull();
    expect(attached!.room.selectedSongId).toBeNull();
  });
});
