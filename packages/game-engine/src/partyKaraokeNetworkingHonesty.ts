/**
 * Party karaoke + networking honesty — loopback membership ≠ physical LAN;
 * karaoke-active audience seats never authorize pitch.
 */

import {
  assessPartyNetworking,
  type PartyNetworkingAssessment,
  type PartyNetworkingSeat,
} from './partyNetworking.js';

export interface PartyKaraokeNetworkingHonestyInput {
  seats: PartyNetworkingSeat[];
  transportClass?: PartyNetworkingAssessment['transportClass'];
  karaokeModeActive?: boolean;
}

export interface PartyKaraokeNetworkingHonestyReport {
  networking: PartyNetworkingAssessment;
  karaokeModeActive: boolean;
  /** Always false — audience never inherits pitch over the wire. */
  audiencePitchAuthorized: false;
  /** Always false — membershipOk ≠ physical LAN phone party. */
  physicalLanAccepted: false;
  /** Always false. */
  physicalMicAccepted: false;
  /** Always false. */
  independentHumansClaimed: false;
  honestyBanner: string;
}

export const PARTY_KARAOKE_NETWORKING_HONESTY =
  'Karaoke-active loopback membership ≠ physical LAN; audience seats never get pitch over the wire.';

export function assessPartyKaraokeNetworkingHonesty(
  input: PartyKaraokeNetworkingHonestyInput,
): PartyKaraokeNetworkingHonestyReport {
  const networking = assessPartyNetworking({
    seats: input.seats,
    transportClass: input.transportClass,
  });
  const karaokeModeActive = input.karaokeModeActive === true;
  return {
    networking,
    karaokeModeActive,
    audiencePitchAuthorized: false,
    physicalLanAccepted: false,
    physicalMicAccepted: false,
    independentHumansClaimed: false,
    honestyBanner: `PARTY_KARAOKE_NETWORKING mode=${karaokeModeActive} membershipOk=${networking.membershipOk} audience=${networking.audienceConnected} · audience_pitch=false · physical_lan=false · physical_mic=false · independent_humans=false · ${PARTY_KARAOKE_NETWORKING_HONESTY}`,
  };
}
