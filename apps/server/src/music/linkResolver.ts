import type {
  LinkCapabilityState,
  LinkMediaClassification,
  LinkResolveResult,
  MusicPlatform,
  PlaybackStatus,
  ProviderAuthStatus,
} from '@beatlink/shared';
import {
  detectProviderAdapter,
  evaluateDirectHttpsMedia,
  firstPartyOriginalRightsLayers,
  isDirectAudioFormat,
  mediaClassificationForCapability,
  playbackStatusForCapability,
  resolveLinkCapability,
  resolveSourceEligibilityRouter,
  capabilityHonestyMessage,
} from '@beatlink/game-engine';
import { loadCatalog } from '../beatmaps/store.js';

const YOUTUBE_REGEX =
  /(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const SPOTIFY_REGEX = /open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;
const APPLE_MUSIC_REGEX =
  /music\.apple\.com\/([a-z]{2})\/(album|song|playlist)\/([^/?#]+)(?:\/(\d+))?/;
const SOUNDCLOUD_REGEX = /(?:www\.)?soundcloud\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;
const VIMEO_REGEX = /(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/;
const AUDIUS_REGEX = /(?:www\.)?audius\.co\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;
const BANDCAMP_REGEX = /([a-zA-Z0-9-]+)\.bandcamp\.com\/(track|album)\/([a-zA-Z0-9_-]+)/;

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
  if (SOUNDCLOUD_REGEX.test(url) || /on\.soundcloud\.com/.test(url)) return 'soundcloud';
  if (BANDCAMP_REGEX.test(url) || /\.bandcamp\.com/.test(url)) return 'bandcamp';
  if (VIMEO_REGEX.test(url)) return 'vimeo';
  if (AUDIUS_REGEX.test(url)) return 'audius';
  if (isDirectAudioFormat(url)) return 'direct_https';
  const adapter = detectProviderAdapter(url);
  if (adapter) return adapter.platform;
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
  if (platform === 'soundcloud') {
    const m = url.match(SOUNDCLOUD_REGEX);
    return m ? `${m[1]}/${m[2]}` : null;
  }
  if (platform === 'bandcamp') {
    const m = url.match(BANDCAMP_REGEX);
    return m ? `${m[1]}:${m[2]}:${m[3]}` : null;
  }
  if (platform === 'vimeo') {
    const m = url.match(VIMEO_REGEX);
    return m?.[1] ?? null;
  }
  if (platform === 'audius') {
    const m = url.match(AUDIUS_REGEX);
    return m ? `${m[1]}/${m[2]}` : null;
  }
  if (platform === 'direct_https') {
    try {
      return new URL(url).pathname;
    } catch {
      return null;
    }
  }
  return null;
}

function parseTitleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(Boolean);
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

function officialEmbedPossible(platform: MusicPlatform, sourceId: string | null): boolean {
  if (!sourceId) return false;
  return (
    platform === 'youtube' ||
    platform === 'spotify' ||
    platform === 'apple_music' ||
    platform === 'soundcloud' ||
    platform === 'bandcamp' ||
    platform === 'vimeo' ||
    platform === 'audius'
  );
}

function buildResult(partial: {
  platform: MusicPlatform;
  sourceId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  capabilityState: LinkCapabilityState;
  matchedCatalogId: string | null;
  providerCredentialsPresent: boolean;
  message?: string;
  analysisEligible?: boolean;
}): LinkResolveResult {
  const fallbackOptions = [
    'Choose an approved demo song from the catalog',
    'Upload music you own or have rights to use (WAV/MP3/OGG + attestation)',
    'Use a royalty-free track from the approved catalog',
    'Provider API keys enrich metadata only — they are not music rights or gameplay sync',
  ];

  const playbackStatus: PlaybackStatus = playbackStatusForCapability(partial.capabilityState, {
    catalogMatched: Boolean(partial.matchedCatalogId),
  });
  const mediaClassification: LinkMediaClassification = mediaClassificationForCapability(
    partial.capabilityState,
    partial.platform,
  );

  const defaultMessage = `${capabilityHonestyMessage(partial.capabilityState)}${
    partial.providerCredentialsPresent
      ? ' Provider credentials are present for metadata/SDK wiring only.'
      : ''
  }`;

  const base: LinkResolveResult = {
    platform: partial.platform,
    sourceId: partial.sourceId,
    title: partial.title,
    artist: partial.artist,
    album: partial.album,
    artworkUrl: partial.artworkUrl,
    durationMs: partial.durationMs,
    playbackStatus,
    capabilityState: partial.capabilityState,
    mediaClassification,
    providerCredentialsPresent: partial.providerCredentialsPresent,
    analysisEligible:
      partial.analysisEligible ?? partial.capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED',
    lyricsEligible: false,
    matchedCatalogId: partial.matchedCatalogId,
    message: partial.message ?? defaultMessage,
    fallbackOptions,
  };

  const route = resolveSourceEligibilityRouter({
    linkResolve: base,
    catalogAlternatives: loadCatalog(),
  });
  const altLines = route.alternatives.map(
    (a) => `Catalog alternative [path ${route.letter}→A]: ${a.title} (${a.songId})`,
  );
  const message = route.playable
    ? base.message
    : `${base.message} Link recognition alone is not gameplay — choose a catalog alternative.`;
  return {
    ...base,
    message,
    fallbackOptions: [...altLines, ...fallbackOptions],
  };
}

/**
 * Resolve a pasted music link to metadata + capability eligibility.
 * Uses public oEmbed / URL parsing only (no audio download/streaming/rip).
 * API credentials ≠ music rights ≠ GAMEPLAY_SYNC_AUTHORIZED.
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
      capabilityState: 'BLOCKED_OR_UNSUPPORTED',
      matchedCatalogId: null,
      providerCredentialsPresent: false,
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
      capabilityState: 'BLOCKED_OR_UNSUPPORTED',
      matchedCatalogId: null,
      providerCredentialsPresent: false,
      message: 'Unsupported link format. Try YouTube, Spotify, Apple Music, SoundCloud, Bandcamp, Vimeo, Audius, or direct HTTPS WAV/MP3/OGG.',
    });
  }

  const sourceId = extractSourceId(trimmed, platform);
  let title = parseTitleFromUrl(trimmed);
  let artist: string | null = null;
  let artworkUrl: string | null = null;
  const album: string | null = null;
  let durationMs: number | null = null;
  let appleMessage: string | undefined;
  const credentialsPresent = hasProviderCredentials(platform);

  // Direct HTTPS preferred gameplay route — rights must be attested separately.
  if (platform === 'direct_https') {
    const layers = firstPartyOriginalRightsLayers();
    // Without attestation payload on the URL alone, we cannot verify rights — stay blocked/honest.
    const decision = evaluateDirectHttpsMedia({
      url: trimmed,
      composition: { ...layers.composition, basis: 'none', syncAuthorized: false, adaptationAuthorized: false },
      soundRecording: {
        ...layers.soundRecording,
        basis: 'none',
        reproductionAuthorized: false,
      },
      beatGridReady: false,
      chartsReady: false,
      contentSha256: null,
    });
    return buildResult({
      platform,
      sourceId,
      title: title ?? 'Direct HTTPS audio',
      artist,
      album,
      artworkUrl,
      durationMs,
      capabilityState: decision.capabilityState,
      matchedCatalogId: null,
      providerCredentialsPresent: false,
      message: `${decision.message} Paste alone is not attestation — use creator ingest with rights + hash + beat grid + charts.`,
      analysisEligible: false,
    });
  }

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
    appleMessage =
      'Apple Music metadata is best-effort from the URL path (public oEmbed is limited). Deep-link only — developer token ≠ sync rights.';
  } else if (
    platform === 'soundcloud' ||
    platform === 'bandcamp' ||
    platform === 'vimeo' ||
    platform === 'audius'
  ) {
    // Scaffold: parse path title only — embed/listen-first stubs, honest classification.
    title = title ?? `${platform} track`;
  }

  const matchedCatalogId = matchCatalog(title, artist);
  if (matchedCatalogId) {
    const song = loadCatalog().find((s) => s.id === matchedCatalogId);
    if (song) {
      title = song.title;
      artist = song.artist;
      durationMs = song.durationMs;
    }
    const capabilityState = resolveLinkCapability({
      platform,
      hasMetadata: true,
      officialEmbedPossible: officialEmbedPossible(platform, sourceId),
      catalogMatched: true,
      directAudioRightsVerified: false,
      beatGridAndChartsReady: true,
      providerCredentialsPresent: credentialsPresent,
    });
    return buildResult({
      platform,
      sourceId,
      title,
      artist,
      album,
      artworkUrl,
      durationMs,
      capabilityState,
      matchedCatalogId,
      providerCredentialsPresent: credentialsPresent,
      message:
        'Matched to an approved catalog track. Gameplay uses catalog audio / song bed — never a platform rip. Ready with host metronome!',
      analysisEligible: true,
    });
  }

  // Critical fix: credentials must NOT yield PLAYABLE_AUTHORIZED_PLATFORM / GAMEPLAY_SYNC.
  const hasMeta = Boolean(title || artist || artworkUrl || sourceId);
  const embedOk = officialEmbedPossible(platform, sourceId);
  const capabilityState = resolveLinkCapability({
    platform,
    hasMetadata: hasMeta,
    officialEmbedPossible: embedOk,
    catalogMatched: false,
    directAudioRightsVerified: false,
    beatGridAndChartsReady: false,
    providerCredentialsPresent: credentialsPresent,
  });

  let message: string | undefined;
  if (platform === 'apple_music' && appleMessage) {
    message = `${appleMessage} Capability: ${capabilityState}.`;
  } else if (credentialsPresent) {
    message = `${capabilityHonestyMessage(capabilityState)} ${platform} credentials are configured for metadata/SDK wiring only — not music rights, not gameplay sync, not audio download.`;
  } else if (
    platform === 'soundcloud' ||
    platform === 'bandcamp' ||
    platform === 'vimeo' ||
    platform === 'audius'
  ) {
    message = `${platform} scaffold: embed/listen-first (${capabilityState}). Not playable-audio gameplay until rights-verified direct HTTPS or catalog match.`;
  }

  return buildResult({
    platform,
    sourceId,
    title,
    artist,
    album,
    artworkUrl,
    durationMs,
    capabilityState,
    matchedCatalogId: null,
    providerCredentialsPresent: credentialsPresent,
    message,
    analysisEligible: false,
  });
}
