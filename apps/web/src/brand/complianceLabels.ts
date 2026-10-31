import type { LinkCapabilityState, LinkResolveResult, SongCatalogEntry } from '@beatlink/shared';

export type EligibilityClass =
  | 'playable_now'
  | 'metadata_only'
  | 'embed_listen'
  | 'rights_verified'
  | 'not_eligible'
  | 'user_link_pending';

export function catalogEligibility(song: SongCatalogEntry): {
  cls: EligibilityClass;
  label: string;
} {
  const license = (song.license ?? '').toLowerCase();
  if (license.includes('pending') || license.includes('user')) {
    return { cls: 'user_link_pending', label: 'USER / LINK PENDING' };
  }
  // Approved demo / PD / CC / original / creator-owned — host note-synced song bed (not a stream rip).
  return { cls: 'playable_now', label: 'PLAYABLE NOW' };
}

const CAPABILITY_UI: Record<
  LinkCapabilityState,
  { cls: EligibilityClass; label: string; badgeClass: string }
> = {
  GAMEPLAY_SYNC_AUTHORIZED: {
    cls: 'playable_now',
    label: 'GAMEPLAY SYNC AUTHORIZED',
    badgeClass: 'status-playable',
  },
  DIRECT_AUDIO_RIGHTS_VERIFIED: {
    cls: 'rights_verified',
    label: 'DIRECT AUDIO RIGHTS VERIFIED',
    badgeClass: 'status-pending',
  },
  OFFICIAL_EMBED_AVAILABLE: {
    cls: 'embed_listen',
    label: 'OFFICIAL EMBED · NOT GAMEPLAY',
    badgeClass: 'status-metadata',
  },
  METADATA_AVAILABLE: {
    cls: 'metadata_only',
    label: 'METADATA ONLY',
    badgeClass: 'status-metadata',
  },
  BLOCKED_OR_UNSUPPORTED: {
    cls: 'not_eligible',
    label: 'BLOCKED OR UNSUPPORTED',
    badgeClass: 'status-blocked',
  },
};

export function linkEligibility(result: LinkResolveResult): {
  cls: EligibilityClass;
  label: string;
  badgeClass: string;
} {
  // Primary: capability state (API key ≠ rights).
  if (result.capabilityState) {
    return CAPABILITY_UI[result.capabilityState];
  }
  // Legacy fallback — never treat PLAYABLE_AUTHORIZED_PLATFORM as playable.
  if (result.playbackStatus === 'PLAYABLE_APPROVED') {
    return CAPABILITY_UI.GAMEPLAY_SYNC_AUTHORIZED;
  }
  if (result.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM') {
    return CAPABILITY_UI.OFFICIAL_EMBED_AVAILABLE;
  }
  if (
    result.playbackStatus === 'UNSUPPORTED' ||
    result.playbackStatus === 'BLOCKED_BY_POLICY' ||
    result.playbackStatus === 'TAKEN_DOWN' ||
    result.playbackStatus === 'RIGHTS_EXPIRED'
  ) {
    return CAPABILITY_UI.BLOCKED_OR_UNSUPPORTED;
  }
  return CAPABILITY_UI.METADATA_AVAILABLE;
}

export const MUSIC_COMPLIANCE_SUMMARY =
  'Pasted YouTube / Spotify / Apple Music / SoundCloud / Bandcamp / Vimeo / Audius links are metadata or official-embed listen paths — never gameplay sync from API keys. Preferred gameplay route: approved catalog or rights-verified direct HTTPS (WAV/MP3/OGG) with hash, beat grid, and charts. BeatLink never rips, DRM-bypasses, or lyric-scrapes. Composition rights ≠ sound-recording rights; CC sync/adaptation require explicit attestation. BETA/RC/LAUNCH/human commercial remain false.';
