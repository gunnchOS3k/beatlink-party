/**
 * Beta event-scale simulation — 8 performers + 25/50/100/300 audience.
 * Honest: in-process simulation ≠ live event capacity, network SLA, or venue ops.
 */

import {
  EVENT_AUDIENCE_TIERS,
  MAX_PERFORMERS,
  emitTelemetry,
  type EventAudienceTier,
} from '@beatlink/shared';
import type { AudienceInfluenceType } from '@beatlink/shared';

export const EVENT_SIM_DISCLAIMER =
  'In-process event-scale simulation only — not a live event, cloud soak, or SLA claim.';

export interface EventScaleRoomApi {
  createRoom(
    hostSocketId: string,
    options?: { capacityProfile?: 'party' | 'event_sim' },
  ): { code: string; hostToken: string; capacityProfile?: string };
  joinRoom(
    code: string,
    socketId: string,
    name: string,
  ): { player: { id: string }; playerToken: string } | null;
  joinAudience(
    code: string,
    socketId: string,
    name: string,
  ): { audience: { id: string }; audienceToken: string } | null;
  leaveRoom(socketId: string): unknown;
  reconnectAudience(
    code: string,
    audienceId: string,
    audienceToken: string,
    socketId: string,
  ): unknown;
  processAudienceInfluence(
    code: string,
    audienceId: string,
    type: AudienceInfluenceType,
    choice?: string,
  ): { event: { accepted: boolean } } | null;
  migrateHostOnDisconnect(socketId: string): { newHostPlayerId: string | null } | null;
  setAudienceSandboxed(code: string, audienceId: string, sandboxed: boolean): unknown;
  getRoom(code: string): {
    phase: string;
    audience: unknown[];
    players: unknown[];
    capacityProfile?: string;
  } | null;
  forcePhase?(code: string, phase: string): void;
  shutdownRoom?(
    code: string,
    options: { hostToken: string },
  ): { phase: string } | null;
}

export interface EventScaleMetrics {
  tier: EventAudienceTier;
  performersJoined: number;
  audienceJoined: number;
  joinLatencyMsP50: number;
  joinLatencyMsP95: number;
  influenceAccepted: number;
  influenceRejected: number;
  disconnects: number;
  reconnects: number;
  hostMigrated: boolean;
  shutdownOk: boolean;
  wallMs: number;
  ok: boolean;
  notes: string[];
}

export interface EventScaleReport {
  disclaimer: typeof EVENT_SIM_DISCLAIMER;
  performerCount: number;
  tiers: EventAudienceTier[];
  metrics: EventScaleMetrics[];
  passed: boolean;
  token: 'BEATLINK_EVENT_SCALE_SIM_PASS' | 'BEATLINK_EVENT_SCALE_SIM_FAIL';
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export function runEventScaleSimulation(
  api: EventScaleRoomApi,
  options: {
    performerCount?: number;
    tiers?: EventAudienceTier[];
    influencePerAudience?: number;
  } = {},
): EventScaleReport {
  const performerCount = options.performerCount ?? MAX_PERFORMERS;
  const tiers = options.tiers ?? [...EVENT_AUDIENCE_TIERS];
  const influencePerAudience = options.influencePerAudience ?? 1;
  const metrics: EventScaleMetrics[] = [];

  for (const tier of tiers) {
    const notes: string[] = [EVENT_SIM_DISCLAIMER];
    const t0 = Date.now();
    const hostSock = `event-host-${tier}`;
    const room = api.createRoom(hostSock, { capacityProfile: 'event_sim' });
    if (room.capacityProfile && room.capacityProfile !== 'event_sim') {
      notes.push('capacity_profile_mismatch');
    }

    let performersJoined = 0;
    for (let i = 0; i < performerCount; i++) {
      const joined = api.joinRoom(room.code, `ep-${tier}-${i}`, `P${i}`);
      if (joined) performersJoined += 1;
    }

    const joinLatencies: number[] = [];
    const audience: Array<{ id: string; sock: string; token: string }> = [];
    let audienceJoined = 0;
    for (let i = 0; i < tier; i++) {
      const j0 = Date.now();
      const sock = `ea-${tier}-${i}`;
      const joined = api.joinAudience(room.code, sock, `A${i}`);
      joinLatencies.push(Date.now() - j0);
      if (joined) {
        audienceJoined += 1;
        audience.push({ id: joined.audience.id, sock, token: joined.audienceToken });
      }
    }
    joinLatencies.sort((a, b) => a - b);

    api.forcePhase?.(room.code, 'playing');

    // Light fault mix at each tier
    let disconnects = 0;
    let reconnects = 0;
    const stormN = Math.min(audience.length, Math.ceil(tier * 0.05) || 1);
    for (let i = 0; i < stormN; i++) {
      const a = audience[i]!;
      api.leaveRoom(a.sock);
      disconnects += 1;
      const reSock = `${a.sock}-re`;
      if (api.reconnectAudience(room.code, a.id, a.token, reSock)) {
        reconnects += 1;
        a.sock = reSock;
      }
    }

    let hostMigrated = false;
    if (performersJoined > 0) {
      const mig = api.migrateHostOnDisconnect(hostSock);
      hostMigrated = mig != null && mig.newHostPlayerId != null;
      notes.push(hostMigrated ? 'host_migrated' : 'host_migrate_failed');
    }

    let influenceAccepted = 0;
    let influenceRejected = 0;
    const sample = audience.slice(0, Math.min(audience.length, 40));
    for (const a of sample) {
      api.setAudienceSandboxed(room.code, a.id, false);
      for (let i = 0; i < influencePerAudience; i++) {
        const result = api.processAudienceInfluence(room.code, a.id, 'hype');
        if (result?.event.accepted) influenceAccepted += 1;
        else influenceRejected += 1;
      }
    }

    let shutdownOk = true;
    if (api.shutdownRoom) {
      const closed = api.shutdownRoom(room.code, { hostToken: room.hostToken });
      shutdownOk = closed?.phase === 'closed' || api.getRoom(room.code) == null;
    }

    const ok =
      performersJoined === performerCount &&
      audienceJoined === tier &&
      shutdownOk &&
      (performersJoined === 0 || hostMigrated);

    if (!ok) notes.push('tier_assertions_failed');

    const metric: EventScaleMetrics = {
      tier,
      performersJoined,
      audienceJoined,
      joinLatencyMsP50: percentile(joinLatencies, 50),
      joinLatencyMsP95: percentile(joinLatencies, 95),
      influenceAccepted,
      influenceRejected,
      disconnects,
      reconnects,
      hostMigrated,
      shutdownOk,
      wallMs: Date.now() - t0,
      ok,
      notes,
    };
    metrics.push(metric);
    emitTelemetry('event_scale_sim', 'EVENT_SIM', {
      tier,
      ok,
      audienceJoined,
      wallMs: metric.wallMs,
      simulation: true,
      liveEvent: false,
    });
  }

  const passed = metrics.every((m) => m.ok);
  return {
    disclaimer: EVENT_SIM_DISCLAIMER,
    performerCount,
    tiers,
    metrics,
    passed,
    token: passed ? 'BEATLINK_EVENT_SCALE_SIM_PASS' : 'BEATLINK_EVENT_SCALE_SIM_FAIL',
  };
}
