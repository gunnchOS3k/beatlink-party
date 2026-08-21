/**
 * Lawful SongSource architecture — Wave007 GAME-BEATLINK-003 + 010.
 * A provider link is metadata / authorized embed intent — never rip permission.
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
  | 'authorized_platform_link'
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
  media: MediaDescriptor;
  message: string;
}

export interface SongSourceResolveInput extends MediaResolveInput {
  /** When true, attempts that look like rip/download intents are blocked. */
  rejectRipIntent?: boolean;
  ripIntentSignals?: string[];
}

const RIP_INTENT_PATTERNS = [
  /download/i,
  /rip(ped|ping)?/i,
  /ytdl/i,
  /mp3.?extract/i,
  /bypass.?drm/i,
  /stream.?copy/i,
];

export function detectRipIntent(signals: string[] = []): boolean {
  return signals.some((s) => RIP_INTENT_PATTERNS.some((re) => re.test(s)));
}

export function resolveSongSource(input: SongSourceResolveInput): SongSource {
  const signals = input.ripIntentSignals ?? [];
  if (input.rejectRipIntent !== false && detectRipIntent(signals)) {
    return {
      kind: 'blocked',
      songId: null,
      title: 'Blocked rip intent',
      playbackStatus: 'BLOCKED_BY_POLICY',
      linkIsNotRipPermission: true,
      ripAllowed: false,
      downloadAllowed: false,
      media: {
        kind: 'metadata_only',
        songId: null,
        title: 'Blocked rip intent',
        artist: null,
        bpm: null,
        durationMs: null,
        playbackStatus: 'BLOCKED_BY_POLICY',
        embed: null,
        message: 'Music links are not rip permission. Download/rip intents are rejected.',
      },
      message: 'Music links are not rip permission. Download/rip intents are rejected.',
    };
  }

  const provider = selectMediaProvider(input);
  const media = provider.resolve(input) as MediaDescriptor;

  let kind: SongSourceKind = 'procedural_fixture';
  if (media.kind === 'catalog_approved') kind = 'approved_catalog';
  else if (media.kind === 'authorized_embed' || media.kind === 'metadata_only') {
    kind = input.linkResult ? 'authorized_platform_link' : 'procedural_fixture';
  } else if (media.kind === 'procedural_metronome') kind = 'procedural_fixture';

  if (
    media.playbackStatus === 'BLOCKED_BY_POLICY' ||
    media.playbackStatus === 'UNSUPPORTED' ||
    media.playbackStatus === 'NEEDS_LICENSE'
  ) {
    kind = 'blocked';
  }

  return {
    kind,
    songId: media.songId,
    title: media.title,
    playbackStatus: media.playbackStatus,
    linkIsNotRipPermission: true,
    ripAllowed: false,
    downloadAllowed: false,
    media,
    message: media.message,
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
