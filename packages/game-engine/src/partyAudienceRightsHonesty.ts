/**
 * Audience seat rights honesty — audience ≠ performers; link ≠ rip.
 * Does not weaken rights: GAMEPLAY_SYNC never granted by UX alone.
 */

import {
  assessPartyAudienceHonesty,
  type PartyAudienceHonestyInput,
  type PartyAudienceHonestyReport,
} from './partyAudienceHonesty.js';

export interface PartyAudienceRightsHonestyInput extends PartyAudienceHonestyInput {
  linkEqualsRipPermission?: boolean;
  gameplaySyncAuthorized?: boolean;
}

export interface PartyAudienceRightsHonestyReport extends PartyAudienceHonestyReport {
  schema: 'beat.party_audience_rights_honesty/v1';
  LINK_EQUALS_RIP_PERMISSION: false;
  GAMEPLAY_SYNC_AUTHORIZED: false;
  humanFirstFunClaimed: false;
}

export const PARTY_AUDIENCE_RIGHTS_HONESTY =
  'Audience seats stay digital observers; audience≠performers; link≠rip; GAMEPLAY_SYNC not granted by UX alone; physical LAN IV packet untouched/PREPARED; HUMAN first-fun false.';

export function assessPartyAudienceRightsHonesty(
  input: PartyAudienceRightsHonestyInput,
): PartyAudienceRightsHonestyReport {
  if (input.linkEqualsRipPermission === true || input.gameplaySyncAuthorized === true) {
    // Refuse elevation.
  }
  const base = assessPartyAudienceHonesty(input);
  return {
    schema: 'beat.party_audience_rights_honesty/v1',
    ...base,
    LINK_EQUALS_RIP_PERMISSION: false,
    GAMEPLAY_SYNC_AUTHORIZED: false,
    humanFirstFunClaimed: false,
    honestyBanner: `${base.honestyBanner} · link_equals_rip=false · gameplay_sync=false · human_first_fun=false · ${PARTY_AUDIENCE_RIGHTS_HONESTY}`,
  };
}
