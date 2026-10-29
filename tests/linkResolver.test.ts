import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveLink, getProviderAuthStatus } from '../apps/server/src/music/linkResolver.js';
import {
  evaluateDirectHttpsMedia,
  firstPartyOriginalRightsLayers,
  providerMatrixSummary,
  resolveLinkCapability,
} from '../packages/game-engine/src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_CLIENT_ID;
  delete process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
});

function stubOEmbed(payload: Record<string, unknown> | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: Boolean(payload),
      json: async () => payload,
    })),
  );
}

describe('linkResolver', () => {
  it('detects YouTube URLs and returns METADATA/EMBED without credentials', async () => {
    stubOEmbed({
      title: 'Never Gonna Give You Up',
      author_name: 'Rick Astley',
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });
    const result = await resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.platform).toBe('youtube');
    expect(result.sourceId).toBe('dQw4w9WgXcQ');
    expect(result.playbackStatus).toBe('METADATA_ONLY');
    expect(result.capabilityState).toBe('OFFICIAL_EMBED_AVAILABLE');
    expect(result.mediaClassification).toBe('embed_only');
    expect(result.providerCredentialsPresent).toBe(false);
    expect(result.title).toBe('Never Gonna Give You Up');
    expect(result.artist).toBe('Rick Astley');
    expect(result.artworkUrl).toContain('ytimg');
    expect(result.analysisEligible).toBe(false);
    expect(result.message.toLowerCase()).toMatch(/embed|metadata|api/);
  });

  it('detects YouTube Music URLs', async () => {
    stubOEmbed({ title: 'Example Track', author_name: 'Artist' });
    const result = await resolveLink('https://music.youtube.com/watch?v=abcdefghijk');
    expect(result.platform).toBe('youtube');
    expect(result.sourceId).toBe('abcdefghijk');
  });

  it('detects Spotify track URLs and uses oEmbed metadata', async () => {
    stubOEmbed({
      title: 'Song Title',
      author_name: 'Some Artist',
      thumbnail_url: 'https://i.scdn.co/image/abc',
    });
    const result = await resolveLink('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWoT');
    expect(result.platform).toBe('spotify');
    expect(result.sourceId).toBe('track:4cOdK2wGLETKBW3PvgPWoT');
    expect(result.playbackStatus).toBe('METADATA_ONLY');
    expect(result.capabilityState).toBe('OFFICIAL_EMBED_AVAILABLE');
    expect(result.title).toBe('Song Title');
    expect(result.artist).toBe('Some Artist');
  });

  it('detects Apple Music URLs with best-effort path title', async () => {
    stubOEmbed(null);
    const result = await resolveLink(
      'https://music.apple.com/us/album/neon-nights/1234567890?i=987',
    );
    expect(result.platform).toBe('apple_music');
    expect(result.playbackStatus).toBe('METADATA_ONLY');
    expect(result.capabilityState).toBe('OFFICIAL_EMBED_AVAILABLE');
    expect(result.mediaClassification).toBe('deep_link_only');
    expect(result.sourceId).toBe('song:987');
    expect(result.message.toLowerCase()).toContain('apple');
  });

  it('scaffolds SoundCloud / Bandcamp / Vimeo / Audius as embed-only', async () => {
    stubOEmbed(null);
    const sc = await resolveLink('https://soundcloud.com/artist/track-name');
    expect(sc.platform).toBe('soundcloud');
    expect(sc.capabilityState).toBe('OFFICIAL_EMBED_AVAILABLE');
    expect(sc.mediaClassification).toBe('embed_only');
    expect(sc.playbackStatus).not.toBe('PLAYABLE_AUTHORIZED_PLATFORM');

    const bc = await resolveLink('https://artist.bandcamp.com/track/song-title');
    expect(bc.platform).toBe('bandcamp');
    expect(bc.capabilityState).toBe('OFFICIAL_EMBED_AVAILABLE');

    const vim = await resolveLink('https://vimeo.com/123456789');
    expect(vim.platform).toBe('vimeo');
    expect(vim.capabilityState).toBe('OFFICIAL_EMBED_AVAILABLE');

    const au = await resolveLink('https://audius.co/artist/track-slug');
    expect(au.platform).toBe('audius');
    expect(au.capabilityState).toBe('OFFICIAL_EMBED_AVAILABLE');
  });

  it('returns UNSUPPORTED / BLOCKED for unknown URLs', async () => {
    const result = await resolveLink('https://example.com/not-music');
    expect(result.platform).toBe('unknown');
    expect(result.playbackStatus).toBe('UNSUPPORTED');
    expect(result.capabilityState).toBe('BLOCKED_OR_UNSUPPORTED');
  });

  it('does not indicate audio download capability without credentials', async () => {
    stubOEmbed({ title: 'Clip' });
    const result = await resolveLink('https://youtu.be/abc12345678');
    expect(result.fallbackOptions.length).toBeGreaterThan(0);
    expect(result.playbackStatus).not.toBe('PLAYABLE_AUTHORIZED_PLATFORM');
    expect(result.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');
  });

  it('CRITICAL: YOUTUBE_API_KEY does NOT grant PLAYABLE_AUTHORIZED_PLATFORM or GAMEPLAY_SYNC', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key';
    stubOEmbed({ title: 'Licensed-ish', author_name: 'Channel' });
    const result = await resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(getProviderAuthStatus().youtube).toBe(true);
    expect(result.providerCredentialsPresent).toBe(true);
    expect(result.playbackStatus).toBe('METADATA_ONLY');
    expect(result.playbackStatus).not.toBe('PLAYABLE_AUTHORIZED_PLATFORM');
    expect(result.capabilityState).toBe('OFFICIAL_EMBED_AVAILABLE');
    expect(result.capabilityState).not.toBe('GAMEPLAY_SYNC_AUTHORIZED');
    expect(result.message.toLowerCase()).toMatch(/not music rights|credentials|api/);
  });

  it('matches catalog titles to GAMEPLAY_SYNC_AUTHORIZED / PLAYABLE_APPROVED', async () => {
    stubOEmbed({
      title: 'Neon Groove (Official)',
      author_name: 'BeatLink Demo Ensemble',
    });
    const result = await resolveLink('https://www.youtube.com/watch?v=abcdefghijk');
    expect(result.playbackStatus).toBe('PLAYABLE_APPROVED');
    expect(result.capabilityState).toBe('GAMEPLAY_SYNC_AUTHORIZED');
    expect(result.matchedCatalogId).toBe('demo-neon-groove');
    expect(result.durationMs).toBe(45000);
    expect(result.analysisEligible).toBe(true);
  });

  it('direct HTTPS without attestation stays blocked / not gameplay', async () => {
    const result = await resolveLink('https://cdn.example.com/owned/track.wav');
    expect(result.platform).toBe('direct_https');
    expect(result.capabilityState).toBe('BLOCKED_OR_UNSUPPORTED');
    expect(result.analysisEligible).toBe(false);
  });
});

describe('link capability state machine', () => {
  it('never elevates credentials to GAMEPLAY_SYNC_AUTHORIZED', () => {
    const state = resolveLinkCapability({
      platform: 'youtube',
      hasMetadata: true,
      officialEmbedPossible: true,
      catalogMatched: false,
      directAudioRightsVerified: false,
      beatGridAndChartsReady: false,
      providerCredentialsPresent: true,
    });
    expect(state).toBe('OFFICIAL_EMBED_AVAILABLE');
  });

  it('authorizes gameplay for rights-verified direct audio + grid + charts', () => {
    const layers = firstPartyOriginalRightsLayers();
    const decision = evaluateDirectHttpsMedia({
      url: 'https://cdn.example.com/a.wav',
      contentSha256: 'a'.repeat(64),
      composition: layers.composition,
      soundRecording: layers.soundRecording,
      beatGridReady: true,
      chartsReady: true,
    });
    expect(decision.capabilityState).toBe('GAMEPLAY_SYNC_AUTHORIZED');
    expect(decision.ok).toBe(true);
  });

  it('provider matrix marks all adapters gameplaySyncViaApiKey=false', () => {
    const matrix = providerMatrixSummary();
    expect(matrix.length).toBeGreaterThanOrEqual(8);
    for (const row of matrix) {
      expect(row.gameplaySyncViaApiKey).toBe(false);
    }
  });
});
