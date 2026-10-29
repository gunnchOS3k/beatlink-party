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
});
