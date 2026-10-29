import { describe, it, expect } from 'vitest';
import {
  evaluateDirectHttpsMedia,
  firstPartyOriginalRightsLayers,
  probeDirectHttpsMedia,
  validateDirectHttpsUrlPolicy,
} from '../packages/game-engine/src/index.js';

describe('evaluateDirectHttpsMedia syncEligible gate', () => {
  const hash = 'a'.repeat(64);
  const url = 'https://cdn.example.com/owned/track.wav';

  it('authorizes GAMEPLAY_SYNC when syncEligible + hash + grid + charts', () => {
    const layers = firstPartyOriginalRightsLayers();
    const decision = evaluateDirectHttpsMedia({
      url,
      contentSha256: hash,
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
    });
    expect(decision.rightsOk).toBe(true);
    expect(decision.syncEligible).toBe(true);
    expect(decision.capabilityState).toBe('GAMEPLAY_SYNC_AUTHORIZED');
  });

  it('NEGATIVE: playback allowed + syncEligible false + valid hash/grid/charts → gameplay denied', () => {
    // Reproduction authorized (rights.ok) but composition sync/adaptation off.
    const decision = evaluateDirectHttpsMedia({
      url,
      contentSha256: hash,
      composition: {
        basis: 'creative_commons',
        ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
        licenseVersion: 'CC-BY-4.0',
        syncAuthorized: false,
        adaptationAuthorized: false,
        attributionText: 'CC BY demo — sync not attested',
      },
      soundRecording: {
        basis: 'creative_commons',
        ccDeedUrl: 'https://creativecommons.org/licenses/by/4.0/',
        licenseVersion: 'CC-BY-4.0',
        reproductionAuthorized: true,
        attributionText: 'CC BY recording',
      },
      beatGridReady: true,
      chartsReady: true,
    });

    expect(decision.rightsOk).toBe(true);
    expect(decision.syncEligible).toBe(false);
    expect(decision.hashPresent).toBe(true);
    expect(decision.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');
    expect(decision.capabilityState).toBe('DIRECT_AUDIO_RIGHTS_VERIFIED');
    expect(decision.message.toLowerCase()).toMatch(/synceligible=false|gameplay sync denied/);
  });

  it('rejects non-https and credentialed URLs via policy', () => {
    const http = validateDirectHttpsUrlPolicy('http://cdn.example.com/a.wav');
    expect(http.ok).toBe(false);
    const creds = validateDirectHttpsUrlPolicy('https://user:pass@cdn.example.com/a.wav');
    expect(creds.ok).toBe(false);
    expect(creds.blockers.join(' ')).toMatch(/credential/i);
  });

  it('rejects loopback, link-local, and private destination hosts', () => {
    for (const raw of [
      'https://127.0.0.1/owned.wav',
      'https://localhost/owned.wav',
      'https://192.168.1.10/owned.wav',
      'https://10.0.0.5/owned.wav',
      'https://169.254.169.254/latest/meta-data.wav',
      'https://nas.local/owned.wav',
    ]) {
      const policy = validateDirectHttpsUrlPolicy(raw);
      expect(policy.ok).toBe(false);
      expect(policy.blockers.join(' ').toLowerCase()).toMatch(/blocked|loopback|private|link-local|internal/);
    }
    const publicOk = validateDirectHttpsUrlPolicy('https://cdn.example.com/owned/track.wav');
    expect(publicOk.urlOk).toBe(true);
  });

  it('NEGATIVE: bracketed IPv6 unique-local / link-local hosts are blocked', () => {
    for (const raw of [
      'https://[fc00::1]/owned.wav',
      'https://[fd12:3456:789a::1]/owned.wav',
      'https://[fe80::1]/owned.wav',
      'https://[::1]/owned.wav',
    ]) {
      const policy = validateDirectHttpsUrlPolicy(raw);
      expect(policy.ok).toBe(false);
      expect(policy.blockers.join(' ').toLowerCase()).toMatch(/blocked|private|loopback|link-local|internal/);
    }
  });

  it('NEGATIVE: DNS that resolves to private addresses is refused before fetch', async () => {
    const { pinDirectHttpsDestinations } = await import(
      '../packages/game-engine/src/directHttpsMedia.js'
    );
    const pin = await pinDirectHttpsDestinations('cdn.example.com', async () => ['10.0.0.8']);
    expect(pin.ok).toBe(false);
    expect(pin.blockers.join(' ')).toMatch(/10\.0\.0\.8/);

    let fetched = false;
    const probe = await probeDirectHttpsMedia(url, {
      maxRedirects: 0,
      dnsLookup: async () => ['192.168.0.50'],
      fetchImpl: (async () => {
        fetched = true;
        return new Response(null, { status: 200, headers: { 'content-type': 'audio/wav' } });
      }) as unknown as typeof fetch,
    });
    expect(fetched).toBe(false);
    expect(probe.ok).toBe(false);
    expect(probe.blockers.join(' ')).toMatch(/192\.168\.0\.50|blocked|private/i);
  });

  it('probe refuses redirects when maxRedirects=0', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch: redirect');
    };
    const probe = await probeDirectHttpsMedia(url, {
      maxRedirects: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(probe.ok).toBe(false);
    expect(probe.redirected || probe.blockers.join(' ')).toBeTruthy();
    expect(probe.blockers.join(' ').toLowerCase()).toMatch(/redirect|failed/);
  });

  it('NEGATIVE: manual redirect Location to private host is refused', async () => {
    const probe = await probeDirectHttpsMedia(url, {
      maxRedirects: 1,
      fetchImpl: (async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://127.0.0.1/steal.wav' },
        })) as unknown as typeof fetch,
    });
    expect(probe.ok).toBe(false);
    expect(probe.redirected).toBe(true);
    expect(probe.blockers.join(' ').toLowerCase()).toMatch(/redirect|blocked|127/);
  });
});
