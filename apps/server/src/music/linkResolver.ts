import type { LinkResolveResult, MusicPlatform, PlaybackStatus, ProviderAuthStatus } from '@beatlink/shared';
import { loadCatalog } from '../beatmaps/store.js';

const YOUTUBE_REGEX =
  /(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const SPOTIFY_REGEX = /open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;
const APPLE_MUSIC_REGEX =
  /music\.apple\.com\/([a-z]{2})\/(album|song|playlist)\/([^/?#]+)(?:\/(\d+))?/;

const OEMBED_TIMEOUT_MS = 3500;

export function getProviderAuthStatus(): ProviderAuthStatus {
  const spotify = Boolean(process.env.SPOTIFY_CLIENT_ID);
  const youtube = Boolean(process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_CLIENT_ID);
  const apple_music = Boolean(process.env.APPLE_MUSIC_DEVELOPER_TOKEN);
  return {
    spotify,
    youtube,
    apple_music,
    authState: spotify || youtube || apple_music ? 'CREDENTIALS_PRESENT' : 'EXTERNAL_PENDING',
  };
}

function hasProviderCredentials(platform: MusicPlatform): boolean {
  const status = getProviderAuthStatus();
  if (platform === 'spotify') return status.spotify;
  if (platform === 'youtube') return status.youtube;
  if (platform === 'apple_music') return status.apple_music;
  return false;
}

function detectPlatform(url: string): MusicPlatform {
  if (YOUTUBE_REGEX.test(url) || /music\.youtube\.com/.test(url)) return 'youtube';
  if (SPOTIFY_REGEX.test(url)) return 'spotify';
  if (/music\.apple\.com/.test(url)) return 'apple_music';
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
    try {
      const u = new URL(url);
      const iParam = u.searchParams.get('i');
      const m = url.match(APPLE_MUSIC_REGEX);
      if (iParam) return `song:${iParam}`;
      if (m) {
        const kind = m[2];
        const id = m[4] ?? m[3];
        return `${kind}:${id}`;
      }
    } catch {
      // fall through
    }
  }
  return null;
}

function parseTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(Boolean);
    // Apple Music: /us/album/song-name/id — prefer slug before numeric id
    if (u.hostname.includes('apple.com') && pathParts.length >= 3) {
      const slug = pathParts[pathParts.length - 2];
      const last = pathParts[pathParts.length - 1];
      if (slug && !/^\d+$/.test(slug)) {
        return decodeURIComponent(slug.replace(/-/g, ' '));
      }
      if (last && !/^\d+$/.test(last) && last.length > 2) {
        return decodeURIComponent(last.replace(/-/g, ' '));
      }
    }
    const last = pathParts[pathParts.length - 1];
    if (last && last.length > 3 && !/^\d+$/.test(last)) {
      return decodeURIComponent(last.replace(/-/g, ' '));
    }
  } catch {
    // ignore
  }
  return null;
}

function matchCatalog(title: string | null, artist: string | null): string | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  const artistLower = artist?.toLowerCase() ?? '';
  const songs = loadCatalog();
  for (const song of songs) {
    const songTitle = song.title.toLowerCase();
    if (songTitle.includes(lower) || lower.includes(songTitle)) {
      return song.id;
    }
    // Loose match: catalog title words appear in oEmbed title
    const words = songTitle.split(/\s+/).filter((w) => w.length > 3);
    if (words.length > 0 && words.every((w) => lower.includes(w))) {
      return song.id;
    }
    if (artistLower && song.artist.toLowerCase().includes(artistLower) && lower.includes(songTitle)) {
      return song.id;
    }
  }
  return null;
}

interface OEmbedPayload {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

async function fetchJsonWithTimeout(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYouTubeOEmbed(url: string): Promise<OEmbedPayload | null> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const data = await fetchJsonWithTimeout(endpoint);
  if (!data || typeof data !== 'object') return null;
  return data as OEmbedPayload;
}

async function fetchSpotifyOEmbed(url: string): Promise<OEmbedPayload | null> {
  const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const data = await fetchJsonWithTimeout(endpoint);
  if (!data || typeof data !== 'object') return null;
  return data as OEmbedPayload;
}

function buildResult(partial: {
  platform: MusicPlatform;
  sourceId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  playbackStatus: PlaybackStatus;
  matchedCatalogId: string | null;
  message?: string;
}): LinkResolveResult {
  const fallbackOptions = [
    'Choose an approved demo song from the catalog',
    'Upload music you own or have rights to use',
    'Use a royalty-free track from the approved catalog',
    'Connect an official provider when credentials are configured (no audio ripping)',
  ];

  const messages: Record<PlaybackStatus, string> = {
    PLAYABLE_APPROVED: 'Matched to an approved catalog track. Ready to play with host metronome!',
    PLAYABLE_AUTHORIZED_PLATFORM:
      'Provider credentials detected. Official embed/auth path available — no audio was downloaded.',
    METADATA_ONLY:
      'Metadata only — choose an approved song or connect a provider. No audio was downloaded or ripped.',
    NEEDS_USER_UPLOAD:
      'This track is not in our catalog. Upload music you own to play this round.',
    NEEDS_LICENSE: 'This track requires a commercial license before gameplay.',
    UNSUPPORTED: 'Unsupported link format. Try YouTube, YouTube Music, Spotify, or Apple Music URLs.',
    BLOCKED_BY_POLICY: 'This link is blocked by platform policy. Use approved catalog instead.',
    TAKEN_DOWN: 'This track was taken down and cannot be used for playback.',
    RIGHTS_EXPIRED: 'Rights attestation expired — renew attestation or pick an approved catalog track.',
  };

  return {
    platform: partial.platform,
    sourceId: partial.sourceId,
    title: partial.title,
    artist: partial.artist,
    album: partial.album,
    artworkUrl: partial.artworkUrl,
    durationMs: partial.durationMs,
    playbackStatus: partial.playbackStatus,
    analysisEligible: partial.playbackStatus === 'PLAYABLE_APPROVED',
    lyricsEligible: false,
    matchedCatalogId: partial.matchedCatalogId,
    message: partial.message ?? messages[partial.playbackStatus],
    fallbackOptions,
  };
}

/**
 * Resolve a pasted music link to metadata + playback eligibility.
 * Uses public oEmbed endpoints only (no audio download/streaming/rip).
 */
export async function resolveLink(url: string): Promise<LinkResolveResult> {
  const trimmed = url.trim();
  if (!trimmed) {
    return buildResult({
      platform: 'unknown',
      sourceId: null,
      title: null,
      artist: null,
      album: null,
      artworkUrl: null,
      durationMs: null,
      playbackStatus: 'UNSUPPORTED',
      matchedCatalogId: null,
    });
  }

  const platform = detectPlatform(trimmed);
  if (platform === 'unknown') {
    return buildResult({
      platform: 'unknown',
      sourceId: null,
      title: null,
      artist: null,
      album: null,
      artworkUrl: null,
      durationMs: null,
      playbackStatus: 'UNSUPPORTED',
      matchedCatalogId: null,
    });
  }

  const sourceId = extractSourceId(trimmed, platform);
  let title = parseTitleFromUrl(trimmed);
  let artist: string | null = null;
  let artworkUrl: string | null = null;
  const album: string | null = null;
  let durationMs: number | null = null;
  let appleMessage: string | undefined;

  if (platform === 'youtube') {
    const oembed = await fetchYouTubeOEmbed(trimmed);
    if (oembed) {
      title = oembed.title ?? title;
      artist = oembed.author_name ?? null;
      artworkUrl = oembed.thumbnail_url ?? null;
    }
  } else if (platform === 'spotify') {
    const oembed = await fetchSpotifyOEmbed(trimmed);
    if (oembed) {
      title = oembed.title ?? title;
      // Spotify oEmbed often puts "Artist · Track" or author_name
      artist = oembed.author_name ?? artist;
      artworkUrl = oembed.thumbnail_url ?? null;
      if (title?.includes(' · ')) {
        const parts = title.split(' · ');
        if (parts.length >= 2 && !artist) {
          artist = parts[parts.length - 1] ?? null;
          title = parts.slice(0, -1).join(' · ');
        }
      }
    }
  } else if (platform === 'apple_music') {
    // Apple Music public oEmbed is limited; best-effort path title + honest messaging
    appleMessage =
      'Apple Music metadata is best-effort from the URL path (public oEmbed is limited). No audio was downloaded.';
  }

  // Enrich catalog match with catalog duration when approved
  const matchedCatalogId = matchCatalog(title, artist);
  if (matchedCatalogId) {
    const song = loadCatalog().find((s) => s.id === matchedCatalogId);
    if (song) {
      title = song.title;
      artist = song.artist;
      durationMs = song.durationMs;
    }
    return buildResult({
      platform,
      sourceId,
      title,
      artist,
      album,
      artworkUrl,
      durationMs,
      playbackStatus: 'PLAYABLE_APPROVED',
      matchedCatalogId,
    });
  }

  if (hasProviderCredentials(platform)) {
    return buildResult({
      platform,
      sourceId,
      title,
      artist,
      album,
      artworkUrl,
      durationMs,
      playbackStatus: 'PLAYABLE_AUTHORIZED_PLATFORM',
      matchedCatalogId: null,
      message:
        platform === 'apple_music' && appleMessage
          ? `${appleMessage} Provider token detected — connect Apple Music for official playback when available.`
          : undefined,
    });
  }

  return buildResult({
    platform,
    sourceId,
    title,
    artist,
    album,
    artworkUrl,
    durationMs,
    playbackStatus: 'METADATA_ONLY',
    matchedCatalogId: null,
    message:
      platform === 'apple_music' && appleMessage
        ? `${appleMessage} Connect Provider credentials are not configured — remaining METADATA_ONLY.`
        : undefined,
  });
}
