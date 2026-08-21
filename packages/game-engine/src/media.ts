import type { LinkResolveResult, PlaybackStatus, SongCatalogEntry } from '@beatlink/shared';

/**
 * Authorized / local media only.
 * Providers never rip, download, or copy copyrighted audio streams.
 */
export type MediaKind = 'procedural_metronome' | 'catalog_approved' | 'authorized_embed' | 'metadata_only';

export interface MediaDescriptor {
  kind: MediaKind;
  songId: string | null;
  title: string;
  artist: string | null;
  bpm: number | null;
  durationMs: number | null;
  playbackStatus: PlaybackStatus;
  /** Official embed / deep-link metadata only — never a ripped stream URL. */
  embed: {
    platform: LinkResolveResult['platform'] | 'internal';
    sourceId: string | null;
    artworkUrl: string | null;
  } | null;
  message: string;
}

export interface MediaProvider {
  readonly id: string;
  /** Resolve a playable / metadata descriptor without fetching audio binaries. */
  resolve(input: MediaResolveInput): Promise<MediaDescriptor> | MediaDescriptor;
}

export interface MediaResolveInput {
  catalogEntry?: SongCatalogEntry | null;
  linkResult?: LinkResolveResult | null;
  fallbackBpm?: number;
}

/** Local procedural metronome — synthesized clicks, no licensed stems. */
export class ProceduralMetronomeProvider implements MediaProvider {
  readonly id = 'procedural_metronome';

  resolve(input: MediaResolveInput): MediaDescriptor {
    const entry = input.catalogEntry;
    return {
      kind: 'procedural_metronome',
      songId: entry?.id ?? null,
      title: entry?.title ?? 'Procedural Metronome',
      artist: entry?.artist ?? 'BeatLink',
      bpm: entry?.bpm ?? input.fallbackBpm ?? 120,
      durationMs: entry?.durationMs ?? 45_000,
      playbackStatus: 'PLAYABLE_APPROVED',
      embed: null,
      message: 'Host Web Audio metronome — no copyrighted audio files.',
    };
  }
}

/** User-authorized catalog / official embed metadata only. */
export class AuthorizedCatalogEmbedProvider implements MediaProvider {
  readonly id = 'authorized_catalog_embed';

  resolve(input: MediaResolveInput): MediaDescriptor {
    const link = input.linkResult;
    const entry = input.catalogEntry;

    if (entry && (!link || link.playbackStatus === 'PLAYABLE_APPROVED')) {
      return {
        kind: 'catalog_approved',
        songId: entry.id,
        title: entry.title,
        artist: entry.artist,
        bpm: entry.bpm,
        durationMs: entry.durationMs,
        playbackStatus: 'PLAYABLE_APPROVED',
        embed: null,
        message: 'Approved demo catalog entry — procedural playback path.',
      };
    }

    if (link) {
      const authorizedPlayback = link.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM';
      return {
        kind: authorizedPlayback ? 'authorized_embed' : 'metadata_only',
        songId: link.matchedCatalogId,
        title: link.title ?? entry?.title ?? 'Linked track',
        artist: link.artist ?? entry?.artist ?? null,
        bpm: entry?.bpm ?? input.fallbackBpm ?? null,
        durationMs: link.durationMs ?? entry?.durationMs ?? null,
        playbackStatus: link.playbackStatus,
        embed: {
          platform: link.platform,
          sourceId: link.sourceId,
          artworkUrl: link.artworkUrl,
        },
        message: link.message,
      };
    }

    return {
      kind: 'metadata_only',
      songId: null,
      title: 'No media selected',
      artist: null,
      bpm: input.fallbackBpm ?? null,
      durationMs: null,
      playbackStatus: 'UNSUPPORTED',
      embed: null,
      message: 'Select an approved catalog song or paste an authorized platform link.',
    };
  }
}

export function selectMediaProvider(input: MediaResolveInput): MediaProvider {
  if (input.catalogEntry && (!input.linkResult || input.linkResult.playbackStatus === 'PLAYABLE_APPROVED')) {
    return new ProceduralMetronomeProvider();
  }
  if (input.linkResult) return new AuthorizedCatalogEmbedProvider();
  return new ProceduralMetronomeProvider();
}

export function resolveMediaDescriptor(input: MediaResolveInput): MediaDescriptor {
  return selectMediaProvider(input).resolve(input) as MediaDescriptor;
}
