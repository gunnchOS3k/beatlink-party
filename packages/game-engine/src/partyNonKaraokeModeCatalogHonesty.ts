/**
 * Non-karaoke mode catalog honesty — digital party modes stay digital-only.
 * Does not weaken rights: link ≠ rip; GAMEPLAY_SYNC never granted by UX alone.
 */

export const NON_KARAOKE_DIGITAL_MODE_IDS = [
  'BeatTap',
  'CallAndResponse',
  'BandRoles',
  'PredictionTrivia',
] as const;

export type NonKaraokeDigitalModeId = (typeof NON_KARAOKE_DIGITAL_MODE_IDS)[number];

export interface PartyNonKaraokeModeCatalogHonestyReport {
  schema: 'beat.party_non_karaoke_mode_catalog_honesty/v1';
  modeCount: number;
  modes: readonly NonKaraokeDigitalModeId[];
  karaokeModeActive: false;
  physicalPartyClaimed: false;
  humanFirstFunClaimed: false;
  LINK_EQUALS_RIP_PERMISSION: false;
  GAMEPLAY_SYNC_AUTHORIZED: false;
  honestyBanner: string;
}

export const PARTY_NON_KARAOKE_MODE_CATALOG_HONESTY =
  'Non-karaoke digital mode catalog (BeatTap/CallAndResponse/BandRoles/PredictionTrivia) stays digital-only; karaoke inactive; link≠rip; GAMEPLAY_SYNC not granted by UX alone; physical LAN IV packet untouched/PREPARED; HUMAN first-fun false.';

export function assessPartyNonKaraokeModeCatalogHonesty(input?: {
  karaokeModeActive?: boolean;
  linkEqualsRipPermission?: boolean;
  gameplaySyncAuthorized?: boolean;
}): PartyNonKaraokeModeCatalogHonestyReport {
  if (input?.linkEqualsRipPermission === true || input?.gameplaySyncAuthorized === true) {
    // Refuse elevation.
  }
  if (input?.karaokeModeActive === true) {
    // Karaoke stays on karaoke modules.
  }
  return {
    schema: 'beat.party_non_karaoke_mode_catalog_honesty/v1',
    modeCount: NON_KARAOKE_DIGITAL_MODE_IDS.length,
    modes: NON_KARAOKE_DIGITAL_MODE_IDS,
    karaokeModeActive: false,
    physicalPartyClaimed: false,
    humanFirstFunClaimed: false,
    LINK_EQUALS_RIP_PERMISSION: false,
    GAMEPLAY_SYNC_AUTHORIZED: false,
    honestyBanner: `PARTY_NON_KARAOKE_MODE_CATALOG modes=${NON_KARAOKE_DIGITAL_MODE_IDS.join(',')} · karaoke=false · link_equals_rip=false · gameplay_sync=false · physical_party=false · human_first_fun=false · ${PARTY_NON_KARAOKE_MODE_CATALOG_HONESTY}`,
  };
}
