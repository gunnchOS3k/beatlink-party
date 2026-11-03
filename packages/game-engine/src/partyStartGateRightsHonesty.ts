/**
 * Start-gate rights honesty — preview/link alone ≠ GAMEPLAY_SYNC.
 * Does not weaken rights: link ≠ rip; scored start stays gated.
 */

export interface PartyStartGateRightsHonestyInput {
  linkEqualsRipPermission?: boolean;
  gameplaySyncAuthorized?: boolean;
  previewOnlyLink?: boolean;
  hasMatchedCatalogId?: boolean;
  /** Caller-observed gameplay-gate flag — never treated as legal clearance or scored-start authority. */
  syncEligible?: boolean;
}

export interface PartyStartGateRightsHonestyReport {
  schema: 'beat.party_start_gate_rights_honesty/v1';
  scoredStartAllowed: false;
  previewOnlyInsufficient: true;
  karaokeModeActive: false;
  physicalPartyClaimed: false;
  humanFirstFunClaimed: false;
  LINK_EQUALS_RIP_PERMISSION: false;
  GAMEPLAY_SYNC_AUTHORIZED: false;
  syncEligibleObserved: boolean;
  verifiedLegalClearance: false;
  scoredStartFromSyncEligible: false;
  honestyBanner: string;
}

export const PARTY_START_GATE_RIGHTS_HONESTY =
  'Start gate keeps scored play denied when only preview/link exists; syncEligible is a gameplay-gate assertion≠legal clearance; link≠rip; GAMEPLAY_SYNC not granted by UX alone; physical LAN IV packet untouched/PREPARED; HUMAN first-fun false.';

export function assessPartyStartGateRightsHonesty(
  input: PartyStartGateRightsHonestyInput = {},
): PartyStartGateRightsHonestyReport {
  if (input.linkEqualsRipPermission === true || input.gameplaySyncAuthorized === true) {
    // Refuse elevation.
  }
  const previewOnly = input.previewOnlyLink !== false;
  const matched = input.hasMatchedCatalogId === true;
  const syncEligible = input.syncEligible === true;
  // Honesty report always refuses scored start elevation via this module alone.
  void previewOnly;
  return {
    schema: 'beat.party_start_gate_rights_honesty/v1',
    scoredStartAllowed: false,
    previewOnlyInsufficient: true,
    karaokeModeActive: false,
    physicalPartyClaimed: false,
    humanFirstFunClaimed: false,
    LINK_EQUALS_RIP_PERMISSION: false,
    GAMEPLAY_SYNC_AUTHORIZED: false,
    syncEligibleObserved: syncEligible,
    verifiedLegalClearance: false,
    scoredStartFromSyncEligible: false,
    honestyBanner: `PARTY_START_GATE_RIGHTS scoredStart=false previewOnlyInsufficient=${previewOnly} matchedCatalog=${matched} syncEligible=${syncEligible} verifiedLegalClearance=false scoredStartFromSyncEligible=false · karaoke=false · link_equals_rip=false · gameplay_sync=false · physical_party=false · human_first_fun=false · ${PARTY_START_GATE_RIGHTS_HONESTY}`,
  };
}
