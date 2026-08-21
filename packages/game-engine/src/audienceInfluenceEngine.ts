/**
 * AudienceInfluenceEngine — Wave007 GAME-BEATLINK-007.
 * Spam caps, cooldowns, mute/sandbox, and bounded crowd/energy effects.
 */

import {
  AUDIENCE_CROWD_METER_CEILING,
  AUDIENCE_CROWD_METER_FLOOR,
  AUDIENCE_INFLUENCE_COOLDOWN_MS,
  AUDIENCE_INFLUENCE_MAX_DELTA,
  AUDIENCE_INFLUENCE_MAX_PER_ROUND,
  type AudienceInfluenceEvent,
  type AudienceInfluenceType,
  type AudienceMember,
  type RoomPhase,
} from '@beatlink/shared';

export interface AudienceInfluenceDecision {
  accepted: boolean;
  reason?: string;
  crowdDelta: number;
  energyMultiplier: number;
  awardHint: 'none' | 'crowd_surge' | 'vote_tilt';
  event: AudienceInfluenceEvent;
}

export interface AudienceInfluenceContext {
  phase: RoomPhase;
  crowdMeter: number;
  nowMs: number;
}

export class AudienceInfluenceEngine {
  readonly cooldownMs: number;
  readonly maxPerRound: number;
  readonly maxDelta: number;

  constructor(
    opts: {
      cooldownMs?: number;
      maxPerRound?: number;
      maxDelta?: number;
    } = {},
  ) {
    this.cooldownMs = opts.cooldownMs ?? AUDIENCE_INFLUENCE_COOLDOWN_MS;
    this.maxPerRound = opts.maxPerRound ?? AUDIENCE_INFLUENCE_MAX_PER_ROUND;
    this.maxDelta = opts.maxDelta ?? AUDIENCE_INFLUENCE_MAX_DELTA;
  }

  evaluate(
    member: AudienceMember,
    type: AudienceInfluenceType,
    ctx: AudienceInfluenceContext,
    choice?: string,
  ): AudienceInfluenceDecision {
    let accepted = true;
    let reason: string | undefined;
    let crowdDelta = 0;
    let energyMultiplier = 1;
    let awardHint: AudienceInfluenceDecision['awardHint'] = 'none';

    if (member.muted) {
      accepted = false;
      reason = 'muted';
    } else if (member.sandboxed) {
      accepted = false;
      reason = 'sandboxed';
    } else if (
      member.lastInfluenceAt != null &&
      ctx.nowMs - member.lastInfluenceAt < this.cooldownMs
    ) {
      accepted = false;
      reason = 'rate_limited';
    } else if (member.influenceCount >= this.maxPerRound) {
      accepted = false;
      reason = 'round_cap';
    } else if (ctx.phase !== 'playing' && ctx.phase !== 'countdown' && ctx.phase !== 'results') {
      accepted = false;
      reason = 'phase_blocked';
    }

    if (accepted) {
      const rawDelta = type === 'hype' ? 2 : 1;
      crowdDelta = Math.min(this.maxDelta, Math.max(0, rawDelta));
      const proposed = ctx.crowdMeter + crowdDelta;
      if (proposed > AUDIENCE_CROWD_METER_CEILING) {
        crowdDelta = Math.max(0, AUDIENCE_CROWD_METER_CEILING - ctx.crowdMeter);
      }
      if (ctx.crowdMeter + crowdDelta < AUDIENCE_CROWD_METER_FLOOR && crowdDelta < 0) {
        crowdDelta = Math.min(0, AUDIENCE_CROWD_METER_FLOOR - ctx.crowdMeter);
      }
      energyMultiplier = type === 'hype' ? 1.05 : 1.02;
      awardHint = type === 'hype' ? 'crowd_surge' : 'vote_tilt';
    }

    const event: AudienceInfluenceEvent = {
      audienceId: member.id,
      type,
      choice: choice?.slice(0, 32),
      accepted,
      reason,
      crowdDelta,
      atMs: ctx.nowMs,
    };

    return { accepted, reason, crowdDelta, energyMultiplier, awardHint, event };
  }

  /** Apply accepted influence onto member counters + crowd meter. */
  apply(
    member: AudienceMember,
    decision: AudienceInfluenceDecision,
    crowdMeter: number,
  ): { member: AudienceMember; crowdMeter: number } {
    if (!decision.accepted) {
      return { member, crowdMeter };
    }
    const next: AudienceMember = {
      ...member,
      lastInfluenceAt: decision.event.atMs,
      influenceCount: member.influenceCount + 1,
    };
    const nextCrowd = Math.min(100, Math.max(0, crowdMeter + decision.crowdDelta));
    return { member: next, crowdMeter: nextCrowd };
  }
}

export function spamCapBlocksBurst(
  engine: AudienceInfluenceEngine,
  member: AudienceMember,
  ctx: AudienceInfluenceContext,
  burstCount: number,
): { accepted: number; rejected: number } {
  let accepted = 0;
  let rejected = 0;
  let current = { ...member };
  let crowd = ctx.crowdMeter;
  for (let i = 0; i < burstCount; i++) {
    const decision = engine.evaluate(current, 'hype', { ...ctx, crowdMeter: crowd, nowMs: ctx.nowMs + i });
    if (decision.accepted) {
      accepted += 1;
      const applied = engine.apply(current, decision, crowd);
      current = applied.member;
      crowd = applied.crowdMeter;
    } else {
      rejected += 1;
    }
  }
  return { accepted, rejected };
}
