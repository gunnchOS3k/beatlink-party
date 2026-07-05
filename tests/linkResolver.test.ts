import { describe, it, expect } from 'vitest';
import { resolveLink } from '../apps/server/src/music/linkResolver.js';

describe('linkResolver', () => {
  it('detects YouTube URLs and returns METADATA_ONLY', () => {
    const result = resolveLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.platform).toBe('youtube');
    expect(result.sourceId).toBe('dQw4w9WgXcQ');
    expect(result.playbackStatus).toBe('METADATA_ONLY');
    expect(result.analysisEligible).toBe(false);
    expect(result.message).toContain('Metadata only');
  });

  it('detects Spotify track URLs', () => {
    const result = resolveLink('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWoT');
    expect(result.platform).toBe('spotify');
    expect(result.sourceId).toBe('track:4cOdK2wGLETKBW3PvgPWoT');
    expect(result.playbackStatus).toBe('METADATA_ONLY');
  });

  it('detects Apple Music URLs', () => {
    const result = resolveLink('https://music.apple.com/us/album/example/1234567890');
    expect(result.platform).toBe('apple_music');
    expect(result.playbackStatus).toBe('METADATA_ONLY');
  });

  it('returns UNSUPPORTED for unknown URLs', () => {
    const result = resolveLink('https://example.com/not-music');
    expect(result.platform).toBe('unknown');
    expect(result.playbackStatus).toBe('UNSUPPORTED');
  });

  it('does not indicate audio download capability', () => {
    const result = resolveLink('https://youtu.be/abc12345678');
    expect(result.fallbackOptions.length).toBeGreaterThan(0);
    expect(result.playbackStatus).not.toBe('PLAYABLE_AUTHORIZED_PLATFORM');
  });
});
