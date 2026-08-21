/**
 * Lawful SongSource architecture — Wave007 GAME-BEATLINK-003 + 010.
 * A provider link is metadata / reference — never rip permission or implied playback auth.
 */

import type { LinkResolveResult, PlaybackStatus, SongCatalogEntry } from '@beatlink/shared';
import {
  AuthorizedCatalogEmbedProvider,
  ProceduralMetronomeProvider,
  selectMediaProvider,
  type MediaDescriptor,
  type MediaResolveInput,
} from './media.js';
import { createRightsAttestation } from './rights.js';

export type SongSourceKind =
  | 'approved_catalog'
  | 'authorized_platform_playback'
  | 'provider_reference_only'
  | 'procedural_fixture'
  | 'user_attested_upload'
  | 'blocked';

export interface SongSource {
  kind: SongSourceKind;
  songId: string | null;
  title: string;
  playbackStatus: PlaybackStatus;
  /** Explicit: resolving a link never grants download/rip rights. */
  linkIsNotRipPermission: true;
  ripAllowed: false;
  downloadAllowed: false;
  /** Reference-only sources cannot stream gameplay media or cache binaries. */
  canGameplayStream: boolean;
  canCacheMedia: boolean;
  media: MediaDescriptor;
  message: string;
}

export interface SongSourceResolveInput extends MediaResolveInput {
  /** When true, attempts that look like rip/download intents are blocked. */
  rejectRipIntent?: boolean;
  ripIntentSignals?: string[];
  /** Optional raw URL for allowlist enforcement (LinkResolveResult has no url field). */
  providerUrl?: string;
  /** Sabotage / negative-control hook — must never be used in production paths. */
  __sabotageDownloader?: (url: string) => Uint8Array | null;
}

const RIP_INTENT_PATTERNS = [
  /download/i,
  /rip(ped|ping)?/i,
  /ytdl/i,
  /mp3.?extract/i,
  /bypass.?drm/i,
  /stream.?copy/i,
];

const ALLOWED_PROVIDER_HOSTS = new Set([
  'open.spotify.com',
  'spotify.com',
  'music.youtube.com',
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'music.apple.com',
  'itunes.apple.com',
]);

export function detectRipIntent(signals: string[] = []): boolean {
  return signals.some((s) => RIP_INTENT_PATTERNS.some((re) => re.test(s)));
}

/** Allowlisted schemes/hosts only — no arbitrary user-URL fetch. */
export function isAllowlistedProviderUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (ALLOWED_PROVIDER_HOSTS.has(u.hostname.toLowerCase()) || ALLOWED_PROVIDER_HOSTS.has(host)) {
      return true;
    }
    // Accept subdomain matches for known roots
    return [...ALLOWED_PROVIDER_HOSTS].some(
      (h) => host === h || host.endsWith(`.${h.replace(/^www\./, '')}`),
    );
  } catch {
    return false;
  }
}

export function resolveSongSource(input: SongSourceResolveInput): SongSource {
  // Negative-control sabotage: downloader callback must force blocked result.
  if (typeof input.__sabotageDownloader === 'function') {
    return {
      kind: 'blocked',
      songId: null,
      title: 'Blocked downloader path',
      playbackStatus: 'BLOCKED_BY_POLICY',
      linkIsNotRipPermission: true,
      ripAllowed: false,
      downloadAllowed: false,
      canGameplayStream: false,
      canCacheMedia: false,
      media: {
        kind: 'metadata_only',
        songId: null,
        title: 'Blocked downloader path',
        artist: null,
        bpm: null,
        durationMs: null,
        playbackStatus: 'BLOCKED_BY_POLICY',
        embed: null,
        message: 'Downloader callbacks are forbidden. Music links are not rip permission.',
      },
      message: 'Downloader callbacks are forbidden. Music links are not rip permission.',
    };
  }

  const signals = input.ripIntentSignals ?? [];
  if (input.rejectRipIntent !== false && detectRipIntent(signals)) {
    return blockedSource('Blocked rip intent', 'Music links are not rip permission. Download/rip intents are rejected.');
  }

  if (input.providerUrl && !isAllowlistedProviderUrl(input.providerUrl)) {
    return blockedSource('Arbitrary URL blocked', 'Provider URL host/scheme is not allowlisted. No fetch performed.');
  }

  const provider = selectMediaProvider(input);
  const media = provider.resolve(input) as MediaDescriptor;

  let kind: SongSourceKind = 'procedural_fixture';
  let canGameplayStream = false;
  let canCacheMedia = false;

  if (media.kind === 'catalog_approved') {
    kind = 'approved_catalog';
    canGameplayStream = media.playbackStatus === 'PLAYABLE_APPROVED';
    canCacheMedia = false;
  } else if (media.kind === 'procedural_metronome') {
    kind = 'procedural_fixture';
    canGameplayStream = true;
    canCacheMedia = false;
  } else if (media.kind === 'authorized_embed') {
    // Only claim authorized platform playback when status proves it.
    if (media.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM') {
      kind = 'authorized_platform_playback';
      canGameplayStream = true;
      canCacheMedia = false;
    } else {
      kind = 'provider_reference_only';
      canGameplayStream = false;
      canCacheMedia = false;
    }
  } else if (media.kind === 'metadata_only') {
    // Truthful: metadata_only is reference-only, never authorized_platform_link.
    kind = 'provider_reference_only';
    canGameplayStream = false;
    canCacheMedia = false;
  }

  if (
    media.playbackStatus === 'BLOCKED_BY_POLICY' ||
    media.playbackStatus === 'UNSUPPORTED' ||
    media.playbackStatus === 'NEEDS_LICENSE'
  ) {
    kind = 'blocked';
    canGameplayStream = false;
    canCacheMedia = false;
  }

  return {
    kind,
    songId: media.songId,
    title: media.title,
    playbackStatus: media.playbackStatus,
    linkIsNotRipPermission: true,
    ripAllowed: false,
    downloadAllowed: false,
    canGameplayStream,
    canCacheMedia,
    media,
    message: media.message,
  };
}

function blockedSource(title: string, message: string): SongSource {
  return {
    kind: 'blocked',
    songId: null,
    title,
    playbackStatus: 'BLOCKED_BY_POLICY',
    linkIsNotRipPermission: true,
    ripAllowed: false,
    downloadAllowed: false,
    canGameplayStream: false,
    canCacheMedia: false,
    media: {
      kind: 'metadata_only',
      songId: null,
      title,
      artist: null,
      bpm: null,
      durationMs: null,
      playbackStatus: 'BLOCKED_BY_POLICY',
      embed: null,
      message,
    },
    message,
  };
}

/** Copyright-safe Wave007 fixture — procedural / demo catalog only. */
export function copyrightSafeWave007Fixture(
  catalogEntry?: SongCatalogEntry | null,
): SongSource {
  const provider = new ProceduralMetronomeProvider();
  const media = provider.resolve({ catalogEntry: catalogEntry ?? null, fallbackBpm: 120 });
  return {
    kind: 'procedural_fixture',
    songId: media.songId,
    title: media.title,
    playbackStatus: 'PLAYABLE_APPROVED',
    linkIsNotRipPermission: true,
    ripAllowed: false,
    downloadAllowed: false,
    canGameplayStream: true,
    canCacheMedia: false,
    media,
    message: 'Wave007 copyright-safe procedural fixture — no commercial media.',
  };
}

export function assertLinkIsNotRipPermission(source: SongSource): boolean {
  return (
    source.linkIsNotRipPermission === true &&
    source.ripAllowed === false &&
    source.downloadAllowed === false
  );
}

export function songSourceFromLinkResult(
  link: LinkResolveResult,
  catalogEntry?: SongCatalogEntry | null,
): SongSource {
  return resolveSongSource({
    linkResult: link,
    catalogEntry: catalogEntry ?? null,
    rejectRipIntent: true,
  });
}

export {
  AuthorizedCatalogEmbedProvider,
  ProceduralMetronomeProvider,
  createRightsAttestation,
};
