/**
 * Provider adapter matrix — honest embed/listen-first vs playable-audio classification.
 * Stubs are intentional: no rip, no DRM bypass, no lyric scrape, no AV separation.
 */

import type {
  LinkCapabilityState,
  LinkMediaClassification,
  MusicPlatform,
} from '@beatlink/shared';

export type ProviderAdapterId =
  | 'youtube'
  | 'spotify'
  | 'apple_music'
  | 'soundcloud'
  | 'bandcamp'
  | 'vimeo'
  | 'audius'
  | 'direct_https';

export interface ProviderAdapterDescriptor {
  id: ProviderAdapterId;
  platform: MusicPlatform;
  displayName: string;
  /** Host patterns used for detection (lowercase). */
  hostPatterns: string[];
  /** What this adapter may honestly claim today. */
  classification: LinkMediaClassification;
  /** Max capability reachable without separate rights attestation / catalog match. */
  maxCapabilityWithoutRights: LinkCapabilityState;
  officialEmbedSupported: boolean;
  deepLinkSupported: boolean;
  /** Direct playable audio path (WAV/MP3/OGG HTTPS) — only direct_https. */
  playableAudioPath: boolean;
  /** Gameplay sync requires extra rights + beat grid — never implied by API key. */
  gameplaySyncViaApiKey: false;
  status: 'wired' | 'scaffold_embed_listen' | 'preferred_direct_audio';
  honestyNotes: string;
}

export const PROVIDER_ADAPTERS: readonly ProviderAdapterDescriptor[] = [
  {
    id: 'youtube',
    platform: 'youtube',
    displayName: 'YouTube',
    hostPatterns: ['youtube.com', 'youtu.be', 'music.youtube.com', 'm.youtube.com'],
    classification: 'embed_only',
    maxCapabilityWithoutRights: 'OFFICIAL_EMBED_AVAILABLE',
    officialEmbedSupported: true,
    deepLinkSupported: true,
    playableAudioPath: false,
    gameplaySyncViaApiKey: false,
    status: 'wired',
    honestyNotes:
      'Official IFrame API only (visible player). No AV separation / audio extraction. YOUTUBE_API_KEY ≠ sync rights.',
  },
  {
    id: 'spotify',
    platform: 'spotify',
    displayName: 'Spotify',
    hostPatterns: ['open.spotify.com', 'spotify.com'],
    classification: 'embed_only',
    maxCapabilityWithoutRights: 'OFFICIAL_EMBED_AVAILABLE',
    officialEmbedSupported: true,
    deepLinkSupported: true,
    playableAudioPath: false,
    gameplaySyncViaApiKey: false,
    status: 'wired',
    honestyNotes:
      'Metadata + official embed / deep-link only. Never a game-streaming content path. Client ID ≠ gameplay sync.',
  },
  {
    id: 'apple_music',
    platform: 'apple_music',
    displayName: 'Apple Music',
    hostPatterns: ['music.apple.com', 'itunes.apple.com'],
    classification: 'deep_link_only',
    maxCapabilityWithoutRights: 'OFFICIAL_EMBED_AVAILABLE',
    officialEmbedSupported: false,
    deepLinkSupported: true,
    playableAudioPath: false,
    gameplaySyncViaApiKey: false,
    status: 'wired',
    honestyNotes:
      'Deep-link / MusicKit boundary. Developer token ≠ composition or sound-recording sync rights for BeatLink scoring.',
  },
  {
    id: 'soundcloud',
    platform: 'soundcloud',
    displayName: 'SoundCloud',
    hostPatterns: ['soundcloud.com', 'on.soundcloud.com'],
    classification: 'embed_only',
    maxCapabilityWithoutRights: 'OFFICIAL_EMBED_AVAILABLE',
    officialEmbedSupported: true,
    deepLinkSupported: true,
    playableAudioPath: false,
    gameplaySyncViaApiKey: false,
    status: 'scaffold_embed_listen',
    honestyNotes:
      'Scaffold: official widget embed / listen-first. Not playable-audio gameplay. No stream rip.',
  },
  {
    id: 'bandcamp',
    platform: 'bandcamp',
    displayName: 'Bandcamp',
    hostPatterns: ['bandcamp.com'],
    classification: 'embed_only',
    maxCapabilityWithoutRights: 'OFFICIAL_EMBED_AVAILABLE',
    officialEmbedSupported: true,
    deepLinkSupported: true,
    playableAudioPath: false,
    gameplaySyncViaApiKey: false,
    status: 'scaffold_embed_listen',
    honestyNotes:
      'Scaffold: Bandcamp Embedded Player listen-first. Purchase/own rights still required for direct audio path.',
  },
  {
    id: 'vimeo',
    platform: 'vimeo',
    displayName: 'Vimeo',
    hostPatterns: ['vimeo.com', 'player.vimeo.com'],
    classification: 'embed_only',
    maxCapabilityWithoutRights: 'OFFICIAL_EMBED_AVAILABLE',
    officialEmbedSupported: true,
    deepLinkSupported: true,
    playableAudioPath: false,
    gameplaySyncViaApiKey: false,
    status: 'scaffold_embed_listen',
    honestyNotes:
      'Scaffold: official Vimeo player embed (visible). No audio extraction / AV separation.',
  },
  {
    id: 'audius',
    platform: 'audius',
    displayName: 'Audius',
    hostPatterns: ['audius.co'],
    classification: 'embed_only',
    maxCapabilityWithoutRights: 'OFFICIAL_EMBED_AVAILABLE',
    officialEmbedSupported: true,
    deepLinkSupported: true,
    playableAudioPath: false,
    gameplaySyncViaApiKey: false,
    status: 'scaffold_embed_listen',
    honestyNotes:
      'Scaffold: embed/listen-first. Track license must still be attested before DIRECT_AUDIO_RIGHTS_VERIFIED.',
  },
  {
    id: 'direct_https',
    platform: 'direct_https',
    displayName: 'Direct HTTPS media',
    hostPatterns: [],
    classification: 'playable_audio',
    maxCapabilityWithoutRights: 'BLOCKED_OR_UNSUPPORTED',
    officialEmbedSupported: false,
    deepLinkSupported: false,
    playableAudioPath: true,
    gameplaySyncViaApiKey: false,
    status: 'preferred_direct_audio',
    honestyNotes:
      'Preferred full-gameplay route: WAV/MP3/OGG over HTTPS with rights eligibility, hash, beat grid, charts.',
  },
] as const;

export function getProviderAdapter(id: ProviderAdapterId): ProviderAdapterDescriptor {
  const found = PROVIDER_ADAPTERS.find((a) => a.id === id);
  if (!found) {
    throw new Error(`Unknown provider adapter: ${id}`);
  }
  return found;
}

export function detectProviderAdapter(url: string): ProviderAdapterDescriptor | null {
  let host = '';
  try {
    host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }

  for (const adapter of PROVIDER_ADAPTERS) {
    if (adapter.id === 'direct_https') continue;
    for (const pattern of adapter.hostPatterns) {
      const p = pattern.replace(/^www\./, '');
      if (host === p || host.endsWith(`.${p}`)) {
        return adapter;
      }
    }
  }

  // Bandcamp artist subdomains: *.bandcamp.com already matched via endsWith.
  return null;
}

export function providerMatrixSummary(): Array<{
  id: ProviderAdapterId;
  classification: LinkMediaClassification;
  maxCapabilityWithoutRights: LinkCapabilityState;
  status: ProviderAdapterDescriptor['status'];
  gameplaySyncViaApiKey: false;
}> {
  return PROVIDER_ADAPTERS.map((a) => ({
    id: a.id,
    classification: a.classification,
    maxCapabilityWithoutRights: a.maxCapabilityWithoutRights,
    status: a.status,
    gameplaySyncViaApiKey: false as const,
  }));
}
