/**
 * Host karaoke stage honesty — phrase prompts visible on host;
 * pitch path never claimed from host browser alone / synthetic mic.
 */

export interface HostKaraokeStageInput {
  modeIsKaraoke: boolean;
  phraseCount: number;
  anyPlayerPitchClaim: boolean;
  secureOriginHost: boolean;
}

export interface HostKaraokeStageAssessment {
  promptsVisible: boolean;
  hostPitchClaimed: false;
  playerPitchObserved: boolean;
  a11yTapFallbackAvailable: true;
  physicalMicAccepted: false;
  honestyBanner: string;
}

export const HOST_KARAOKE_STAGE_HONESTY =
  'Host stage shows karaoke phrases only — host browser ≠ physical mic; synthetic/player pitch flags ≠ commercial clearance.';

export function assessHostKaraokeStage(
  input: HostKaraokeStageInput,
): HostKaraokeStageAssessment {
  const promptsVisible = input.modeIsKaraoke && input.phraseCount > 0;
  return {
    promptsVisible,
    hostPitchClaimed: false,
    playerPitchObserved: input.anyPlayerPitchClaim === true,
    a11yTapFallbackAvailable: true,
    physicalMicAccepted: false,
    honestyBanner: `HOST_KARAOKE_STAGE prompts=${promptsVisible} phrases=${input.phraseCount} playerPitchObserved=${input.anyPlayerPitchClaim === true} hostSecure=${input.secureOriginHost} · host_pitch=false · physical_mic=false · ${HOST_KARAOKE_STAGE_HONESTY}`,
  };
}
