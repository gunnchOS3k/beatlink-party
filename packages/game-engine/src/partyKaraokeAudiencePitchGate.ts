/**
 * Party karaoke audience pitch gate — audience/host seats never authorize pitch,
 * even with strong synthetic claim numbers. Performer seats still use claim bounds.
 * Digital tabs ≠ physical phones/humans.
 */

import {
  boundKaraokePitchClaim,
  type KaraokePitchClaimBound,
  type KaraokePitchClaimInput,
} from './karaokePitchClaimBound.js';

export type PartyKaraokeSeatKind = 'audience' | 'performer' | 'host';

export interface PartyKaraokeAudiencePitchGateInput {
  seatKind: PartyKaraokeSeatKind;
  claim: KaraokePitchClaimInput;
}

export interface PartyKaraokeAudiencePitchGateReport {
  seatKind: PartyKaraokeSeatKind;
  /** True only for performer seats that pass claim bounds. */
  pitchAnalysisActive: boolean;
  rejectedReason: string | null;
  /** Always false — audience never inherits/authorizes pitch. */
  audiencePitchAuthorized: false;
  /** Always false — synthetic/browser ≠ physical mic. */
  physicalMicAccepted: false;
  /** Always false — scripted tabs ≠ independent humans. */
  independentHumansClaimed: false;
  bound: KaraokePitchClaimBound | null;
  honestyBanner: string;
}

export const PARTY_KARAOKE_AUDIENCE_PITCH_GATE_HONESTY =
  'Audience/host seats never authorize karaoke pitch; performer claims still require bounds. Digital ≠ physical mic/humans.';

export function assessPartyKaraokeAudiencePitchGate(
  input: PartyKaraokeAudiencePitchGateInput,
): PartyKaraokeAudiencePitchGateReport {
  if (input.seatKind !== 'performer') {
    const rejectedReason =
      input.seatKind === 'audience' ? 'audience_seat_forbidden' : 'host_seat_forbidden';
    return {
      seatKind: input.seatKind,
      pitchAnalysisActive: false,
      rejectedReason,
      audiencePitchAuthorized: false,
      physicalMicAccepted: false,
      independentHumansClaimed: false,
      bound: null,
      honestyBanner: `PARTY_KARAOKE_AUDIENCE_PITCH_GATE seat=${input.seatKind} pitch=false reason=${rejectedReason} · audience_pitch=false · physical_mic=false · independent_humans=false · ${PARTY_KARAOKE_AUDIENCE_PITCH_GATE_HONESTY}`,
    };
  }

  const bound = boundKaraokePitchClaim(input.claim);
  return {
    seatKind: 'performer',
    pitchAnalysisActive: bound.pitchAnalysisActive,
    rejectedReason: bound.rejectedReason,
    audiencePitchAuthorized: false,
    physicalMicAccepted: false,
    independentHumansClaimed: false,
    bound,
    honestyBanner: `PARTY_KARAOKE_AUDIENCE_PITCH_GATE seat=performer pitch=${bound.pitchAnalysisActive} reason=${bound.rejectedReason ?? 'ok'} · audience_pitch=false · physical_mic=false · independent_humans=false · ${PARTY_KARAOKE_AUDIENCE_PITCH_GATE_HONESTY}`,
  };
}
