/**
 * Rematch-rights honesty — rematchReady alone ≠ GAMEPLAY_SYNC / link=rip.
 * Does not weaken rights; IV @ab7a8d9 package remains untouched / PREPARED.
 */

export interface PartyRematchRightsHonestyInput {
  rematchReady?: boolean;
  linkEqualsRipPermission?: boolean;
  gameplaySyncAuthorized?: boolean;
  rematchRound?: number;
}

export interface PartyRematchRightsHonestyReport {
  schema: 'beat.party_rematch_rights_honesty/v1';
  rematchElevatesRights: false;
  scoredRematchAuthorized: false;
  karaokeModeActive: false;
  physicalPartyClaimed: false;
  humanFirstFunClaimed: false;
  LINK_EQUALS_RIP_PERMISSION: false;
  GAMEPLAY_SYNC_AUTHORIZED: false;
  ivPacketUntouched: true;
  honestyBanner: string;
}

export const PARTY_REMATCH_RIGHTS_HONESTY =
  'Rematch/results dwell never elevates rights: rematchReady≠GAMEPLAY_SYNC; link≠rip; physical LAN IV @ab7a8d9 untouched/PREPARED; HUMAN first-fun false.';

export function assessPartyRematchRightsHonesty(
  input: PartyRematchRightsHonestyInput = {},
): PartyRematchRightsHonestyReport {
  if (input.linkEqualsRipPermission === true || input.gameplaySyncAuthorized === true) {
    // Refuse elevation — report stays false regardless of caller claims.
  }
  const rematchReady = input.rematchReady === true;
  const round = Math.max(0, Math.floor(input.rematchRound ?? 0));
  void rematchReady;
  return {
    schema: 'beat.party_rematch_rights_honesty/v1',
    rematchElevatesRights: false,
    scoredRematchAuthorized: false,
    karaokeModeActive: false,
    physicalPartyClaimed: false,
    humanFirstFunClaimed: false,
    LINK_EQUALS_RIP_PERMISSION: false,
    GAMEPLAY_SYNC_AUTHORIZED: false,
    ivPacketUntouched: true,
    honestyBanner: `PARTY_REMATCH_RIGHTS rematchReady=${rematchReady} round=${round} elevatesRights=false scoredRematch=false · karaoke=false · link_equals_rip=false · gameplay_sync=false · physical_party=false · human_first_fun=false · iv_untouched=true · ${PARTY_REMATCH_RIGHTS_HONESTY}`,
  };
}
