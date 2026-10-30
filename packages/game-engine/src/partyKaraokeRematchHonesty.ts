/**
 * Party karaoke rematch honesty — rematch after karaoke clears prior pitch;
 * audience never gains pitch; digital rematch ≠ physical party / humans.
 */

import {
  assessPartyRematchLoop,
  type PartyRematchLoopAssessment,
  type PartyRematchLoopInput,
} from './partyRematchLoop.js';
import {
  assessKaraokeRevokeContinuity,
  type KaraokeRevokeContinuityReport,
} from './karaokeRevokeContinuity.js';

export interface PartyKaraokeRematchHonestyInput extends PartyRematchLoopInput {
  karaokeModeActive?: boolean;
  priorPitchActive?: boolean;
  nowMs?: number;
}

export interface PartyKaraokeRematchHonestyReport {
  rematch: PartyRematchLoopAssessment;
  karaokeRevoke: KaraokeRevokeContinuityReport;
  karaokeModeActive: boolean;
  /** Rematch never carries prior pitch into the next round. */
  priorPitchClearedOnRematch: boolean;
  /** Always false. */
  audiencePitchAuthorized: false;
  /** Always false. */
  physicalMicAccepted: false;
  /** Always false. */
  physicalPartyClaimed: false;
  /** Always false. */
  independentHumansClaimed: false;
  honestyBanner: string;
}

export const PARTY_KARAOKE_REMATCH_HONESTY =
  'Karaoke rematch clears prior pitch; audience never inherits; digital rematch ≠ physical party/mic/humans.';

export function assessPartyKaraokeRematchHonesty(
  input: PartyKaraokeRematchHonestyInput,
): PartyKaraokeRematchHonestyReport {
  const rematch = assessPartyRematchLoop(input);
  const karaokeRevoke = assessKaraokeRevokeContinuity(input.nowMs ?? Date.now());
  const karaokeModeActive = input.karaokeModeActive === true;
  const priorPitchClearedOnRematch =
    input.priorPitchActive !== true || karaokeRevoke.pitchClearedOnRevoke;
  return {
    rematch,
    karaokeRevoke,
    karaokeModeActive,
    priorPitchClearedOnRematch,
    audiencePitchAuthorized: false,
    physicalMicAccepted: false,
    physicalPartyClaimed: false,
    independentHumansClaimed: false,
    honestyBanner: `PARTY_KARAOKE_REMATCH mode=${karaokeModeActive} rematchReady=${rematch.rematchReady} priorPitchCleared=${priorPitchClearedOnRematch} · audience_pitch=false · physical_mic=false · physical_party=false · independent_humans=false · ${PARTY_KARAOKE_REMATCH_HONESTY}`,
  };
}
