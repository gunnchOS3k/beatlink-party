import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveLink, getProviderAuthStatus } from '../apps/server/src/music/linkResolver.js';

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
  it('detects YouTube URLs and returns METADATA_ONLY without credentials', async () => {
    stubOEmbed({
      title: 'Never Gonna Give You Up',
      author_name: 'Rick Astley',
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });
    const result = await resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.platform).toBe('youtube');
    expect(result.sourceId).toBe('dQw4w9WgXcQ');
    expect(result.playbackStatus).toBe('METADATA_ONLY');
    expect(result.title).toBe('Never Gonna Give You Up');
    expect(result.artist).toBe('Rick Astley');
    expect(result.artworkUrl).toContain('ytimg');
    expect(result.analysisEligible).toBe(false);
    expect(result.message).toContain('Metadata only');
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
    expect(result.sourceId).toBe('song:987');
    expect(result.message.toLowerCase()).toContain('apple');
  });

  it('returns UNSUPPORTED for unknown URLs', async () => {
    const result = await resolveLink('https://example.com/not-music');
    expect(result.platform).toBe('unknown');
    expect(result.playbackStatus).toBe('UNSUPPORTED');
  });

  it('does not indicate audio download capability without credentials', async () => {
    stubOEmbed({ title: 'Clip' });
    const result = await resolveLink('https://youtu.be/abc12345678');
    expect(result.fallbackOptions.length).toBeGreaterThan(0);
    expect(result.playbackStatus).not.toBe('PLAYABLE_AUTHORIZED_PLATFORM');
  });

  it('returns PLAYABLE_AUTHORIZED_PLATFORM when provider credentials exist', async () => {
    process.env.YOUTUBE_API_KEY = 'test-key';
    stubOEmbed({ title: 'Licensed-ish', author_name: 'Channel' });
    const result = await resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.playbackStatus).toBe('PLAYABLE_AUTHORIZED_PLATFORM');
    expect(getProviderAuthStatus().youtube).toBe(true);
  });

  it('matches catalog titles to PLAYABLE_APPROVED', async () => {
    stubOEmbed({
      title: 'Neon Groove (Official)',
      author_name: 'BeatLink Demo Ensemble',
    });
    const result = await resolveLink('https://www.youtube.com/watch?v=abcdefghijk');
    expect(result.playbackStatus).toBe('PLAYABLE_APPROVED');
    expect(result.matchedCatalogId).toBe('demo-neon-groove');
    expect(result.durationMs).toBe(45000);
    expect(result.analysisEligible).toBe(true);
  });
});
