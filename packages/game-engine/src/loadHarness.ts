/**
 * Load / fault harness scaffolding — Alpha digital.
 * Simulates audience sizes 8 / 25 / 50 with disconnect storms and late joins.
 * In-process only; not a production load test or SLA claim.
 */

import type { AudienceInfluenceType } from '@beatlink/shared';
import { emitTelemetry } from '@beatlink/shared';

export const LOAD_HARNESS_AUDIENCE_TIERS = [8, 25, 50] as const;
export type LoadHarnessAudienceTier = (typeof LOAD_HARNESS_AUDIENCE_TIERS)[number];

export type LoadHarnessFaultKind =
  | 'none'
  | 'disconnect_storm'
  | 'late_join_burst'
  | 'influence_flood'
  | 'host_drop';

export interface LoadHarnessPlan {
  audienceTier: LoadHarnessAudienceTier[];
  performerCount: number;
  faults: LoadHarnessFaultKind[];
  influenceActionsPerAudience: number;
}

export interface LoadHarnessStep {
  tier: LoadHarnessAudienceTier;
  fault: LoadHarnessFaultKind;
  audienceJoined: number;
  performersJoined: number;
  influenceAccepted: number;
  influenceRejected: number;
  disconnects: number;
  reconnects: number;
  hostMigrated: boolean;
  elapsedMs: number;
  ok: boolean;
  notes: string[];
}

export interface LoadHarnessReport {
  plan: LoadHarnessPlan;
  steps: LoadHarnessStep[];
  passed: boolean;
  token: 'BEATLINK_LOAD_HARNESS_SCAFFOLD_PASS' | 'BEATLINK_LOAD_HARNESS_SCAFFOLD_FAIL';
}

export const DEFAULT_LOAD_HARNESS_PLAN: LoadHarnessPlan = {
  audienceTier: [...LOAD_HARNESS_AUDIENCE_TIERS],
  performerCount: 8,
  faults: ['none', 'disconnect_storm', 'late_join_burst', 'influence_flood', 'host_drop'],
  influenceActionsPerAudience: 2,
};

/** Room-manager shaped surface the harness needs (keeps harness decoupled from class). */
export interface LoadHarnessRoomApi {
  createRoom(hostSocketId: string): { code: string; hostToken: string };
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
  getRoom(code: string): { phase: string; audience: unknown[]; players: unknown[] } | null;
  /** Test hook — force playing phase for influence. */
  forcePhase?(code: string, phase: string): void;
}

export function runLoadFaultHarness(
  api: LoadHarnessRoomApi,
  plan: LoadHarnessPlan = DEFAULT_LOAD_HARNESS_PLAN,
): LoadHarnessReport {
  const steps: LoadHarnessStep[] = [];

  for (const tier of plan.audienceTier) {
    for (const fault of plan.faults) {
      const step = runOneStep(api, tier, fault, plan);
      steps.push(step);
      emitTelemetry('load_harness', 'HARNESS', {
        tier,
        fault,
        ok: step.ok,
      });
    }
  }

  const passed = steps.every((s) => s.ok);
  return {
    plan,
    steps,
    passed,
    token: passed
      ? 'BEATLINK_LOAD_HARNESS_SCAFFOLD_PASS'
      : 'BEATLINK_LOAD_HARNESS_SCAFFOLD_FAIL',
  };
}

function runOneStep(
  api: LoadHarnessRoomApi,
  tier: LoadHarnessAudienceTier,
  fault: LoadHarnessFaultKind,
  plan: LoadHarnessPlan,
): LoadHarnessStep {
  const t0 = Date.now();
  const notes: string[] = [];
  const hostSock = `harness-host-${tier}-${fault}`;
  const room = api.createRoom(hostSock);

  let performersJoined = 0;
  const performers: Array<{ id: string; sock: string; token: string }> = [];
  for (let i = 0; i < plan.performerCount; i++) {
    const sock = `perf-${tier}-${fault}-${i}`;
    const joined = api.joinRoom(room.code, sock, `P${i}`);
    if (joined) {
      performersJoined += 1;
      performers.push({ id: joined.player.id, sock, token: joined.playerToken });
    }
  }

  const audience: Array<{ id: string; sock: string; token: string }> = [];
  let audienceJoined = 0;
  const joinCount = fault === 'late_join_burst' ? Math.min(tier, Math.ceil(tier * 0.6)) : tier;
  for (let i = 0; i < joinCount; i++) {
    const sock = `aud-${tier}-${fault}-${i}`;
    const joined = api.joinAudience(room.code, sock, `A${i}`);
    if (joined) {
      audienceJoined += 1;
      audience.push({
        id: joined.audience.id,
        sock,
        token: joined.audienceToken,
      });
    }
  }

  if (fault === 'late_join_burst') {
    for (let i = joinCount; i < tier; i++) {
      const sock = `aud-late-${tier}-${fault}-${i}`;
      const joined = api.joinAudience(room.code, sock, `L${i}`);
      if (joined) {
        audienceJoined += 1;
        audience.push({
          id: joined.audience.id,
          sock,
          token: joined.audienceToken,
        });
      }
    }
    notes.push('late_join_burst_applied');
  }

  api.forcePhase?.(room.code, 'playing');

  let disconnects = 0;
  let reconnects = 0;
  if (fault === 'disconnect_storm') {
    const storm = audience.slice(0, Math.min(audience.length, Math.ceil(tier * 0.4)));
    for (const a of storm) {
      api.leaveRoom(a.sock);
      disconnects += 1;
      const reSock = `${a.sock}-re`;
      if (api.reconnectAudience(room.code, a.id, a.token, reSock)) {
        reconnects += 1;
        a.sock = reSock;
      }
    }
    notes.push('disconnect_storm_applied');
  }

  let hostMigrated = false;
  if (fault === 'host_drop') {
    const mig = api.migrateHostOnDisconnect(hostSock);
    hostMigrated = mig != null;
    notes.push(hostMigrated ? 'host_migrated' : 'host_drop_no_successor');
  }

  let influenceAccepted = 0;
  let influenceRejected = 0;
  if (fault === 'influence_flood' || fault === 'none' || fault === 'late_join_burst') {
    for (const a of audience) {
      if (fault === 'influence_flood') {
        api.setAudienceSandboxed(room.code, a.id, false);
      }
      for (let i = 0; i < plan.influenceActionsPerAudience; i++) {
        const result = api.processAudienceInfluence(room.code, a.id, 'hype');
        if (result?.event.accepted) influenceAccepted += 1;
        else influenceRejected += 1;
      }
    }
  }

  const live = api.getRoom(room.code);
  const ok =
    performersJoined === plan.performerCount &&
    audienceJoined === tier &&
    live != null &&
    (fault !== 'host_drop' || hostMigrated || performersJoined === 0);

  if (!ok) notes.push('step_failed_assertions');

  return {
    tier,
    fault,
    audienceJoined,
    performersJoined,
    influenceAccepted,
    influenceRejected,
    disconnects,
    reconnects,
    hostMigrated,
    elapsedMs: Date.now() - t0,
    ok,
    notes,
  };
}
