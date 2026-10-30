/**
 * Party timing budgets + resync helpers (host/phone LAN workflows).
 *
 * Budgets below are PROPOSED from product timing windows when no separately
 * approved requirement exists. Do not claim they "passed" without measured
 * evidence on the exact tip. Browser dual-client ≠ physical phone proof.
 */

import { TIMING_WINDOWS_MS } from '@beatlink/shared';

/** Proposed quantitative budgets — claimedPassed stays false until measured. */
export const PROPOSED_PARTY_TIMING_BUDGET = {
  /** Steady-state |client − server| drift after a successful resync. */
  maxSteadyStateDriftMs: Math.min(50, TIMING_WINDOWS_MS.great),
  /** Device calibration sample jitter (stddev) soft ceiling. */
  maxCalibrationJitterMs: 40,
  /** Hide/background longer than this forces a server clock resync. */
  backgroundResyncRequiredAfterMs: 1500,
  /** Grace while inputs may be in flight during brief network loss. */
  inputQueueGraceMs: 2000,
  /** After seat rejoin during play, resync must complete within this. */
  rejoinResyncDeadlineMs: 1000,
  /** Soft warning band before hard drift reject. */
  softDriftWarnMs: 80,
  /** Explicit honesty: proposed ≠ verified pass. */
  claimedPassed: false as const,
  source: 'proposed_from_TIMING_WINDOWS_MS_and_LAN_party_practice',
} as const;

export type PartyTimingScenario =
  | 'steady'
  | 'buffering'
  | 'network_loss'
  | 'rejoin'
  | 'background_resume';

export interface PartyTimingSample {
  scenario: PartyTimingScenario;
  clientGameTimeMs: number;
  serverGameTimeMs: number;
  hiddenMs?: number;
  networkGapMs?: number;
}

export interface PartyTimingAssessment {
  driftMs: number;
  absDriftMs: number;
  withinSteadyBudget: boolean;
  requiresResync: boolean;
  reason: string;
  budget: typeof PROPOSED_PARTY_TIMING_BUDGET;
  /** Always false until a measured evidence package flips it externally. */
  claimedPassed: false;
}

export function measureClockDrift(clientGameTimeMs: number, serverGameTimeMs: number): number {
  return clientGameTimeMs - serverGameTimeMs;
}

export function assessPartyTiming(sample: PartyTimingSample): PartyTimingAssessment {
  const driftMs = measureClockDrift(sample.clientGameTimeMs, sample.serverGameTimeMs);
  const absDriftMs = Math.abs(driftMs);
  const budget = PROPOSED_PARTY_TIMING_BUDGET;

  let requiresResync = absDriftMs > budget.maxSteadyStateDriftMs;
  let reason = requiresResync ? 'drift_exceeds_steady_budget' : 'within_steady_budget';

  if ((sample.hiddenMs ?? 0) >= budget.backgroundResyncRequiredAfterMs) {
    requiresResync = true;
    reason = 'background_resume_requires_resync';
  }
  if (sample.scenario === 'rejoin') {
    requiresResync = true;
    reason = 'rejoin_requires_resync';
  }
  if (sample.scenario === 'network_loss' && (sample.networkGapMs ?? 0) > budget.inputQueueGraceMs) {
    requiresResync = true;
    reason = 'network_loss_exceeded_grace';
  }
  if (sample.scenario === 'buffering' && absDriftMs > budget.softDriftWarnMs) {
    requiresResync = true;
    reason = 'buffering_drift_warn';
  }

  return {
    driftMs,
    absDriftMs,
    withinSteadyBudget: absDriftMs <= budget.maxSteadyStateDriftMs,
    requiresResync,
    reason,
    budget,
    claimedPassed: false,
  };
}

/**
 * Apply authoritative server game time onto the local wall clock.
 * Returns values suitable for PlayerPage rawElapsedMs + gameStartTime.
 */
export function applyServerClockResync(args: {
  serverGameTimeMs: number;
  nowMs?: number;
}): { rawElapsedMs: number; gameStartTime: number; resyncedAtMs: number } {
  const nowMs = args.nowMs ?? Date.now();
  const rawElapsedMs = Math.max(0, args.serverGameTimeMs);
  return {
    rawElapsedMs,
    gameStartTime: nowMs - rawElapsedMs,
    resyncedAtMs: nowMs,
  };
}

export interface SimulatedTimingRun {
  scenario: PartyTimingScenario;
  samples: PartyTimingSample[];
  assessments: PartyTimingAssessment[];
  maxAbsDriftMs: number;
  anyRequiresResync: boolean;
  /** Proposed budget comparison only — not a physical/LAN pass claim. */
  claimedPassed: false;
}

/** Deterministic harness for loss / rejoin / background — no sockets required. */
export function simulatePartyTimingScenario(
  scenario: PartyTimingScenario,
  opts: { serverStartMs?: number; steps?: number; stepMs?: number } = {},
): SimulatedTimingRun {
  const serverStart = opts.serverStartMs ?? 10_000;
  const steps = opts.steps ?? 5;
  const stepMs = opts.stepMs ?? 200;
  const samples: PartyTimingSample[] = [];

  for (let i = 0; i < steps; i++) {
    const serverGameTimeMs = serverStart + i * stepMs;
    let clientGameTimeMs = serverGameTimeMs;
    let hiddenMs = 0;
    let networkGapMs = 0;

    switch (scenario) {
      case 'steady':
        clientGameTimeMs = serverGameTimeMs + (i % 2 === 0 ? 4 : -3);
        break;
      case 'buffering':
        // Client freezes briefly then jumps — classic media buffer skew.
        clientGameTimeMs = i < 2 ? serverStart : serverGameTimeMs + 120;
        break;
      case 'network_loss':
        networkGapMs = 2500;
        clientGameTimeMs = serverGameTimeMs - networkGapMs;
        break;
      case 'rejoin':
        // Stale client clock from before disconnect.
        clientGameTimeMs = serverStart - 5000 + i * stepMs;
        break;
      case 'background_resume':
        hiddenMs = 3000;
        clientGameTimeMs = serverGameTimeMs - hiddenMs;
        break;
    }

    samples.push({
      scenario,
      clientGameTimeMs,
      serverGameTimeMs,
      hiddenMs: hiddenMs || undefined,
      networkGapMs: networkGapMs || undefined,
    });
  }

  const assessments = samples.map(assessPartyTiming);
  const maxAbsDriftMs = Math.max(0, ...assessments.map((a) => a.absDriftMs));
  return {
    scenario,
    samples,
    assessments,
    maxAbsDriftMs,
    anyRequiresResync: assessments.some((a) => a.requiresResync),
    claimedPassed: false,
  };
}

export function partyTimingHonestyBanner(assessment: PartyTimingAssessment): string {
  return `PARTY_TIMING proposed_budget drift=${assessment.absDriftMs}ms requiresResync=${assessment.requiresResync} claimedPassed=false (${assessment.reason})`;
}
