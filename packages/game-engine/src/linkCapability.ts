/**
 * Link capability state machine — API key ≠ music rights.
 *
 * METADATA_AVAILABLE — title/artist/artwork recognized
 * OFFICIAL_EMBED_AVAILABLE — official visible embed / deep-link listen path (not gameplay sync)
 * DIRECT_AUDIO_RIGHTS_VERIFIED — HTTPS WAV/MP3/OGG with composition+recording rights + hash
 * GAMEPLAY_SYNC_AUTHORIZED — beat grid + charts may drive multiplayer scoring
 * BLOCKED_OR_UNSUPPORTED — policy block / unknown / rip / DRM
 */

import type {
  LinkCapabilityState,
  LinkMediaClassification,
  LinkResolveResult,
  PlaybackStatus,
} from '@beatlink/shared';

export const LINK_CAPABILITY_STATES: readonly LinkCapabilityState[] = [
  'METADATA_AVAILABLE',
  'OFFICIAL_EMBED_AVAILABLE',
  'DIRECT_AUDIO_RIGHTS_VERIFIED',
  'GAMEPLAY_SYNC_AUTHORIZED',
  'BLOCKED_OR_UNSUPPORTED',
] as const;

const CAPABILITY_RANK: Record<LinkCapabilityState, number> = {
  BLOCKED_OR_UNSUPPORTED: 0,
  METADATA_AVAILABLE: 1,
  OFFICIAL_EMBED_AVAILABLE: 2,
  DIRECT_AUDIO_RIGHTS_VERIFIED: 3,
  GAMEPLAY_SYNC_AUTHORIZED: 4,
};

export function capabilityRank(state: LinkCapabilityState): number {
  return CAPABILITY_RANK[state];
}

/** Gameplay sync / analysis only when explicitly authorized — never from API keys. */
export function isGameplaySyncAuthorized(state: LinkCapabilityState): boolean {
  return state === 'GAMEPLAY_SYNC_AUTHORIZED';
}

export function isOfficialEmbedOrListen(state: LinkCapabilityState): boolean {
  return state === 'OFFICIAL_EMBED_AVAILABLE' || state === 'METADATA_AVAILABLE';
}

export function isBlockedCapability(state: LinkCapabilityState): boolean {
  return state === 'BLOCKED_OR_UNSUPPORTED';
}

/**
 * Map capability → legacy PlaybackStatus for RoomManager / older UI paths.
 * Never maps OFFICIAL_EMBED / METADATA / credentials to PLAYABLE_AUTHORIZED_PLATFORM.
 */
export function playbackStatusForCapability(
  state: LinkCapabilityState,
  opts?: { catalogMatched?: boolean },
): PlaybackStatus {
  if (opts?.catalogMatched && state === 'GAMEPLAY_SYNC_AUTHORIZED') {
    return 'PLAYABLE_APPROVED';
  }
  switch (state) {
    case 'GAMEPLAY_SYNC_AUTHORIZED':
      return 'PLAYABLE_APPROVED';
    case 'DIRECT_AUDIO_RIGHTS_VERIFIED':
      // Rights verified but beat-grid/chart sync not yet authorized.
      return 'NEEDS_USER_UPLOAD';
    case 'OFFICIAL_EMBED_AVAILABLE':
    case 'METADATA_AVAILABLE':
      return 'METADATA_ONLY';
    case 'BLOCKED_OR_UNSUPPORTED':
    default:
      return 'UNSUPPORTED';
  }
}

export function mediaClassificationForCapability(
  state: LinkCapabilityState,
  platformHint?: LinkResolveResult['platform'],
): LinkMediaClassification {
  switch (state) {
    case 'GAMEPLAY_SYNC_AUTHORIZED':
    case 'DIRECT_AUDIO_RIGHTS_VERIFIED':
      return 'playable_audio';
    case 'OFFICIAL_EMBED_AVAILABLE':
      if (platformHint === 'apple_music') return 'deep_link_only';
      return 'embed_only';
    case 'METADATA_AVAILABLE':
      return 'metadata_only';
    case 'BLOCKED_OR_UNSUPPORTED':
    default:
      return 'blocked';
  }
}

export interface CapabilityResolveInput {
  platform: LinkResolveResult['platform'];
  hasMetadata: boolean;
  officialEmbedPossible: boolean;
  /** Catalog match or internal approved audio — gameplay via catalog path. */
  catalogMatched: boolean;
  /** Direct HTTPS media with verified composition + sound-recording rights + hash. */
  directAudioRightsVerified: boolean;
  /** Beat grid + chart present for sync scoring. */
  beatGridAndChartsReady: boolean;
  blocked?: boolean;
  unsupported?: boolean;
  /**
   * Provider API credentials present (YOUTUBE_API_KEY, etc.).
   * Informational only — MUST NOT elevate to GAMEPLAY_SYNC_AUTHORIZED.
   */
  providerCredentialsPresent?: boolean;
}

/**
 * Resolve capability state. Credentials never grant gameplay sync.
 */
export function resolveLinkCapability(input: CapabilityResolveInput): LinkCapabilityState {
  if (input.blocked || input.unsupported) {
    return 'BLOCKED_OR_UNSUPPORTED';
  }

  // Preferred full-gameplay route: catalog match or rights-verified direct audio + grid.
  if (input.catalogMatched) {
    return 'GAMEPLAY_SYNC_AUTHORIZED';
  }

  if (input.directAudioRightsVerified && input.beatGridAndChartsReady) {
    return 'GAMEPLAY_SYNC_AUTHORIZED';
  }

  if (input.directAudioRightsVerified) {
    return 'DIRECT_AUDIO_RIGHTS_VERIFIED';
  }

  // Official embed / deep-link listen — never gameplay sync, even with API keys.
  if (input.officialEmbedPossible) {
    return 'OFFICIAL_EMBED_AVAILABLE';
  }

  if (input.hasMetadata) {
    return 'METADATA_AVAILABLE';
  }

  // Credentials alone are not a capability elevation.
  void input.providerCredentialsPresent;
  return 'BLOCKED_OR_UNSUPPORTED';
}

export function capabilityHonestyMessage(state: LinkCapabilityState): string {
  switch (state) {
    case 'GAMEPLAY_SYNC_AUTHORIZED':
      return 'Gameplay sync authorized via approved catalog or rights-verified direct audio + beat grid. Not granted by provider API keys.';
    case 'DIRECT_AUDIO_RIGHTS_VERIFIED':
      return 'Direct HTTPS audio rights verified (composition + sound recording). Beat grid/charts still required for gameplay sync.';
    case 'OFFICIAL_EMBED_AVAILABLE':
      return 'Official embed / deep-link listen available. Embed ≠ rhythm-sync rights. API credentials ≠ music rights.';
    case 'METADATA_AVAILABLE':
      return 'Metadata available only. No gameplay sync. Provider API keys do not authorize playback or ripping.';
    case 'BLOCKED_OR_UNSUPPORTED':
    default:
      return 'Link blocked or unsupported. No rip, DRM bypass, or lyric scrape.';
  }
}

/** Derive capability from a partial / legacy LinkResolveResult when missing. */
export function deriveCapabilityFromLegacy(result: {
  playbackStatus: PlaybackStatus;
  matchedCatalogId: string | null;
  platform: LinkResolveResult['platform'];
  sourceId: string | null;
  capabilityState?: LinkCapabilityState;
}): LinkCapabilityState {
  if (result.capabilityState) return result.capabilityState;
  if (result.matchedCatalogId && result.playbackStatus === 'PLAYABLE_APPROVED') {
    return 'GAMEPLAY_SYNC_AUTHORIZED';
  }
  if (
    result.playbackStatus === 'UNSUPPORTED' ||
    result.playbackStatus === 'BLOCKED_BY_POLICY' ||
    result.playbackStatus === 'TAKEN_DOWN' ||
    result.playbackStatus === 'RIGHTS_EXPIRED'
  ) {
    return 'BLOCKED_OR_UNSUPPORTED';
  }
  // Legacy PLAYABLE_AUTHORIZED_PLATFORM was wrongly assigned from API keys —
  // downgrade to official embed when a source id exists, else metadata.
  if (
    result.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM' ||
    result.playbackStatus === 'METADATA_ONLY'
  ) {
    if (result.sourceId && result.platform !== 'unknown') {
      return 'OFFICIAL_EMBED_AVAILABLE';
    }
    return 'METADATA_AVAILABLE';
  }
  if (result.playbackStatus === 'PLAYABLE_APPROVED') {
    return 'GAMEPLAY_SYNC_AUTHORIZED';
  }
  if (result.playbackStatus === 'NEEDS_USER_UPLOAD' || result.playbackStatus === 'NEEDS_LICENSE') {
    return 'METADATA_AVAILABLE';
  }
  return 'BLOCKED_OR_UNSUPPORTED';
}
