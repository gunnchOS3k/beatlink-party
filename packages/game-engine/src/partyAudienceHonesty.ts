/**
 * Party audience seat honesty — audience ≠ performers; scripted ≠ humans.
 */

export interface PartyAudienceHonestyInput {
  performerCount: number;
  audienceCount: number;
  maxPerformers: number;
  scriptedAudience?: boolean;
}

export interface PartyAudienceHonestyReport {
  performerCount: number;
  audienceCount: number;
  capacityOk: boolean;
  audienceDistinctFromPerformers: true;
  /** Always false — digital seats ≠ independent human party. */
  independentHumansClaimed: false;
  /** Always false until PHYSICAL_LAN_REVIEW_PACKET. */
  physicalPartyClaimed: false;
  honestyBanner: string;
}

export const PARTY_AUDIENCE_HONESTY =
  'Audience seats are digital observers — scripted tabs ≠ independent humans; audience ≠ performers.';

export function assessPartyAudienceHonesty(
  input: PartyAudienceHonestyInput,
): PartyAudienceHonestyReport {
  const capacityOk =
    input.performerCount >= 0 &&
    input.performerCount <= input.maxPerformers &&
    input.audienceCount >= 0;
  return {
    performerCount: input.performerCount,
    audienceCount: input.audienceCount,
    capacityOk,
    audienceDistinctFromPerformers: true,
    independentHumansClaimed: false,
    physicalPartyClaimed: false,
    honestyBanner: `PARTY_AUDIENCE performers=${input.performerCount}/${input.maxPerformers} audience=${input.audienceCount} scripted=${input.scriptedAudience === true} · independent_humans=false · physical_party=false · ${PARTY_AUDIENCE_HONESTY}`,
  };
}
