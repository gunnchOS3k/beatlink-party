import type { LinkResolveResult, MusicPlatform, PlaybackStatus } from '@beatlink/shared';
import { loadCatalog } from '../beatmaps/store.js';

const YOUTUBE_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const SPOTIFY_REGEX = /open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;
const APPLE_MUSIC_REGEX = /music\.apple\.com\/([a-z]{2}\/)?(album|song|playlist)\/[^/]+\/(\d+)/;

function detectPlatform(url: string): MusicPlatform {
  if (YOUTUBE_REGEX.test(url)) return 'youtube';
  if (SPOTIFY_REGEX.test(url)) return 'spotify';
  if (APPLE_MUSIC_REGEX.test(url)) return 'apple_music';
  return 'unknown';
}

function extractSourceId(url: string, platform: MusicPlatform): string | null {
  if (platform === 'youtube') {
    const m = url.match(YOUTUBE_REGEX);
    return m?.[1] ?? null;
  }
  if (platform === 'spotify') {
    const m = url.match(SPOTIFY_REGEX);
    return m ? `${m[1]}:${m[2]}` : null;
  }
  if (platform === 'apple_music') {
    const m = url.match(APPLE_MUSIC_REGEX);
    return m ? `${m[2]}:${m[3]}` : null;
  }
  return null;
}

function parseTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(Boolean);
    const last = pathParts[pathParts.length - 1];
    if (last && last.length > 3) {
      return decodeURIComponent(last.replace(/-/g, ' '));
    }
  } catch {
    // ignore
  }
  return null;
}

function matchCatalog(title: string | null): string | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  const songs = loadCatalog();
  for (const song of songs) {
    if (song.title.toLowerCase().includes(lower) || lower.includes(song.title.toLowerCase())) {
      return song.id;
    }
  }
  return null;
}

function buildResult(
  platform: MusicPlatform,
  sourceId: string | null,
  title: string | null,
  playbackStatus: PlaybackStatus,
  matchedCatalogId: string | null,
): LinkResolveResult {
  const fallbackOptions = [
    'Choose an approved demo song from the catalog',
    'Upload music you own or have rights to use',
    'Use a royalty-free track from the approved catalog',
    'Create a manual beatmap shell (future)',
  ];

  const messages: Record<PlaybackStatus, string> = {
    PLAYABLE_APPROVED: 'Matched to an approved catalog track. Ready to play!',
    PLAYABLE_AUTHORIZED_PLATFORM: 'Platform playback may be available with proper licensing.',
    METADATA_ONLY:
      'Metadata only — choose an approved song or upload music you own. No audio was downloaded.',
    NEEDS_USER_UPLOAD:
      'This track is not in our catalog. Upload music you own to play this round.',
    NEEDS_LICENSE: 'This track requires a commercial license before gameplay.',
    UNSUPPORTED: 'Unsupported link format. Try YouTube, Spotify, or Apple Music URLs.',
    BLOCKED_BY_POLICY: 'This link is blocked by platform policy. Use approved catalog instead.',
  };

  return {
    platform,
    sourceId,
    title,
    artist: null,
    album: null,
    artworkUrl: null,
    durationMs: null,
    playbackStatus,
    analysisEligible: playbackStatus === 'PLAYABLE_APPROVED',
    lyricsEligible: false,
    matchedCatalogId,
    message: messages[playbackStatus],
    fallbackOptions,
  };
}

export function resolveLink(url: string): LinkResolveResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return buildResult('unknown', null, null, 'UNSUPPORTED', null);
  }

  const platform = detectPlatform(trimmed);
  if (platform === 'unknown') {
    return buildResult('unknown', null, null, 'UNSUPPORTED', null);
  }

  const sourceId = extractSourceId(trimmed, platform);
  const title = parseTitleFromUrl(trimmed);
  const matchedCatalogId = matchCatalog(title);

  if (matchedCatalogId) {
    return buildResult(platform, sourceId, title, 'PLAYABLE_APPROVED', matchedCatalogId);
  }

  // MVP: never download or rip — metadata only
  return buildResult(platform, sourceId, title, 'METADATA_ONLY', null);
}
