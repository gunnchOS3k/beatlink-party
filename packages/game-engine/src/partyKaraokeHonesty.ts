/**
 * Party + karaoke combined honesty — audience seats never inherit pitch claims;
 * mid-phrase revoke clears performer pitch; digital party ≠ physical humans/phones.
 */

import {
  assessPartyAudienceHonesty,
  type PartyAudienceHonestyInput,
  type PartyAudienceHonestyReport,
} from './partyAudienceHonesty.js';
import {
  assessKaraokeRevokeContinuity,
  type KaraokeRevokeContinuityReport,
} from './karaokeRevokeContinuity.js';

export interface PartyKaraokeHonestyInput extends PartyAudienceHonestyInput {
  karaokeModeActive?: boolean;
  nowMs?: number;
}

export interface PartyKaraokeHonestyReport {
  audience: PartyAudienceHonestyReport;
  karaokeRevoke: KaraokeRevokeContinuityReport;
  karaokeModeActive: boolean;
  /** Audience never authorized for MICROPHONE_PITCH_ANALYSIS. */
  audiencePitchAuthorized: false;
  /** Always false — browser party karaoke ≠ physical phone mic LAN. */
  physicalMicAccepted: false;
  /** Always false — scripted tabs ≠ independent humans. */
  independentHumansClaimed: false;
  /** Always false until PHYSICAL_LAN_REVIEW_PACKET. */
  physicalPartyClaimed: false;
  honestyBanner: string;
}

export const PARTY_KARAOKE_HONESTY =
  'Party karaoke: audience seats never inherit pitch; revoke clears performer pitch; digital tabs ≠ physical phones/humans.';

export function assessPartyKaraokeHonesty(
  input: PartyKaraokeHonestyInput,
): PartyKaraokeHonestyReport {
  const audience = assessPartyAudienceHonesty(input);
  const karaokeRevoke = assessKaraokeRevokeContinuity(input.nowMs ?? Date.now());
  const karaokeModeActive = input.karaokeModeActive === true;
  return {
    audience,
    karaokeRevoke,
    karaokeModeActive,
    audiencePitchAuthorized: false,
    physicalMicAccepted: false,
    independentHumansClaimed: false,
    physicalPartyClaimed: false,
    honestyBanner: `PARTY_KARAOKE mode=${karaokeModeActive} performers=${input.performerCount}/${input.maxPerformers} audience=${input.audienceCount} revokePitchCleared=${karaokeRevoke.pitchClearedOnRevoke} audience_pitch=false · physical_mic=false · independent_humans=false · physical_party=false · ${PARTY_KARAOKE_HONESTY}`,
  };
}
