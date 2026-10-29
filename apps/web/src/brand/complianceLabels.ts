import type { LinkResolveResult, SongCatalogEntry } from '@beatlink/shared';

export type EligibilityClass =
  | 'playable_now'
  | 'metadata_only'
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

export function linkEligibility(result: LinkResolveResult): {
  cls: EligibilityClass;
  label: string;
  badgeClass: string;
} {
  if (result.playbackStatus === 'PLAYABLE_APPROVED') {
    return { cls: 'playable_now', label: 'PLAYABLE NOW', badgeClass: 'status-playable' };
  }
  if (result.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM') {
    return {
      cls: 'metadata_only',
      label: 'METADATA ONLY · PLATFORM EMBED',
      badgeClass: 'status-metadata',
    };
  }
  if (
    result.playbackStatus === 'UNSUPPORTED' ||
    result.playbackStatus === 'BLOCKED_BY_POLICY' ||
    result.playbackStatus === 'TAKEN_DOWN' ||
    result.playbackStatus === 'RIGHTS_EXPIRED'
  ) {
    return { cls: 'not_eligible', label: 'NOT ELIGIBLE', badgeClass: 'status-blocked' };
  }
  return { cls: 'metadata_only', label: 'METADATA ONLY', badgeClass: 'status-metadata' };
}

export const MUSIC_COMPLIANCE_SUMMARY =
  'Pasted YouTube / Spotify / Apple Music links are metadata-only unless an authorized platform path is configured. BeatLink never downloads or DRM-bypasses third-party streams. Scoring rounds use approved demo / PD / CC / original / creator-attested catalog songs with a host note-synced song bed — never a ripped stem.';
