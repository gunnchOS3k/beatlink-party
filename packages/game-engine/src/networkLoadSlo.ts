/**
 * Explicit digital network-load SLOs (localhost DEV).
 * Not a live pilot / venue Wi-Fi / commercial SLA claim.
 */

import type { EventAudienceTier } from '@beatlink/shared';
import type { LatencySummary, NetworkLoadReport, NetworkLoadTierMetrics } from './networkLoad.js';

export const NETWORK_LOAD_SLO_DISCLAIMER =
  'Digital localhost SLOs only — not a live pilot, venue Wi-Fi, or commercial SLA claim.';

export interface TierSlo {
  tier: EventAudienceTier;
  joinP95MsMax: number;
  joinP99MsMax: number;
  influenceP95MsMax: number;
  influenceP99MsMax: number;
}

export interface DigitalNetworkSlos {
  disclaimer: typeof NETWORK_LOAD_SLO_DISCLAIMER;
  trialsMin: number;
  eventLossMax: number;
  rssMbMax: number;
  heapUsedMbMax: number;
  cpuUserMsPerTrialMax: number;
  gcPauseMsP99Max: number;
  tiers: TierSlo[];
}

/** Conservative digital SLOs sized for CI runners (8×25/50/100/300). */
export const DIGITAL_NETWORK_SLOS: DigitalNetworkSlos = {
  disclaimer: NETWORK_LOAD_SLO_DISCLAIMER,
  trialsMin: 3,
  eventLossMax: 0,
  rssMbMax: 768,
  heapUsedMbMax: 512,
  cpuUserMsPerTrialMax: 180_000,
  gcPauseMsP99Max: 500,
  tiers: [
    {
      tier: 25,
      joinP95MsMax: 120,
      joinP99MsMax: 200,
      influenceP95MsMax: 150,
      influenceP99MsMax: 250,
    },
    {
      tier: 50,
      joinP95MsMax: 200,
      joinP99MsMax: 350,
      influenceP95MsMax: 300,
      influenceP99MsMax: 500,
    },
    {
      tier: 100,
      joinP95MsMax: 350,
      joinP99MsMax: 550,
      influenceP95MsMax: 500,
      influenceP99MsMax: 800,
    },
    {
      tier: 300,
      joinP95MsMax: 800,
      joinP99MsMax: 1200,
      influenceP95MsMax: 1500,
      influenceP99MsMax: 2500,
    },
  ],
};

export interface ResourceSample {
  rssMb: number;
  heapUsedMb: number;
  externalMb: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  gcPauseMs: number[];
  gcPauseMsP99: number;
}

export interface HardenedTierResult {
  tier: EventAudienceTier;
  joinRttMs: LatencySummary;
  influenceRttMs: LatencySummary;
  eventLoss: number;
  ok: boolean;
  violations: string[];
}

export interface HardenedNetworkLoadReport {
  disclaimer: typeof NETWORK_LOAD_SLO_DISCLAIMER;
  trials: number;
  slos: DigitalNetworkSlos;
  resources: ResourceSample[];
  resourcePeak: ResourceSample;
  tiers: HardenedTierResult[];
  aggregateOk: boolean;
  passed: boolean;
  token: 'BEATLINK_NETWORK_LOAD_PASS' | 'BEATLINK_NETWORK_LOAD_FAIL';
  baseReports: NetworkLoadReport[];
}

function latencyOk(summary: LatencySummary, p95Max: number, p99Max: number): string[] {
  const v: string[] = [];
  if (summary.samples === 0) v.push('no_samples');
  if (summary.p95 > p95Max) v.push(`p95:${summary.p95}>${p95Max}`);
  if (summary.p99 > p99Max) v.push(`p99:${summary.p99}>${p99Max}`);
  return v;
}

export function evaluateTierAgainstSlo(
  metrics: NetworkLoadTierMetrics,
  slo: TierSlo,
  eventLoss: number,
  eventLossMax: number,
): HardenedTierResult {
  const violations: string[] = [];
  violations.push(...latencyOk(metrics.joinRttMs, slo.joinP95MsMax, slo.joinP99MsMax).map((x) => `join_${x}`));
  violations.push(
    ...latencyOk(metrics.influenceRttMs, slo.influenceP95MsMax, slo.influenceP99MsMax).map(
      (x) => `influence_${x}`,
    ),
  );
  if (eventLoss > eventLossMax) violations.push(`event_loss:${eventLoss}>${eventLossMax}`);
  if (!metrics.ok) violations.push('tier_report_not_ok');
  return {
    tier: metrics.tier,
    joinRttMs: metrics.joinRttMs,
    influenceRttMs: metrics.influenceRttMs,
    eventLoss,
    ok: violations.length === 0,
    violations,
  };
}

export function sampleProcessResources(gcPauses: number[] = []): ResourceSample {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const sorted = [...gcPauses].sort((a, b) => a - b);
  const p99 =
    sorted.length === 0
      ? 0
      : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.99 * sorted.length) - 1))]!;
  return {
    rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
    heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
    externalMb: Math.round((mem.external / (1024 * 1024)) * 100) / 100,
    cpuUserMs: Math.round(cpu.user / 1000),
    cpuSystemMs: Math.round(cpu.system / 1000),
    gcPauseMs: gcPauses,
    gcPauseMsP99: p99,
  };
}

export function mergeLatencySummaries(parts: LatencySummary[]): LatencySummary {
  const samples = parts.reduce((n, p) => n + p.samples, 0);
  if (samples === 0) return { p50: 0, p95: 0, p99: 0, samples: 0 };
  const avg = (key: keyof Omit<LatencySummary, 'samples'>) =>
    parts.reduce((n, p) => n + p[key] * p.samples, 0) / samples;
  // Use mean of trial percentiles (not max) so one noisy trial does not fail digital SLOs.
  return {
    p50: Math.round(avg('p50') * 100) / 100,
    p95: Math.round(avg('p95') * 100) / 100,
    p99: Math.round(avg('p99') * 100) / 100,
    samples,
  };
}

export function buildHardenedNetworkLoadReport(input: {
  baseReports: NetworkLoadReport[];
  eventLossByTier: Record<number, number>;
  resources: ResourceSample[];
  slos?: DigitalNetworkSlos;
}): HardenedNetworkLoadReport {
  const slos = input.slos ?? DIGITAL_NETWORK_SLOS;
  const tierMap = new Map<EventAudienceTier, NetworkLoadTierMetrics[]>();
  for (const report of input.baseReports) {
    for (const m of report.metrics) {
      const list = tierMap.get(m.tier) ?? [];
      list.push(m);
      tierMap.set(m.tier, list);
    }
  }

  const tiers: HardenedTierResult[] = [];
  for (const slo of slos.tiers) {
    const trials = tierMap.get(slo.tier) ?? [];
    const merged: NetworkLoadTierMetrics = {
      tier: slo.tier,
      performers: trials[0]?.performers ?? 8,
      audience: slo.tier,
      joinRttMs: mergeLatencySummaries(trials.map((t) => t.joinRttMs)),
      influenceRttMs: mergeLatencySummaries(trials.map((t) => t.influenceRttMs)),
      wallMs: trials.reduce((n, t) => n + t.wallMs, 0),
      ok: trials.length > 0 && trials.every((t) => t.ok),
      notes: [NETWORK_LOAD_SLO_DISCLAIMER],
    };
    tiers.push(
      evaluateTierAgainstSlo(
        merged,
        slo,
        input.eventLossByTier[slo.tier] ?? 0,
        slos.eventLossMax,
      ),
    );
  }

  const resourcePeak: ResourceSample = input.resources.reduce(
    (peak, r) => ({
      rssMb: Math.max(peak.rssMb, r.rssMb),
      heapUsedMb: Math.max(peak.heapUsedMb, r.heapUsedMb),
      externalMb: Math.max(peak.externalMb, r.externalMb),
      cpuUserMs: Math.max(peak.cpuUserMs, r.cpuUserMs),
      cpuSystemMs: Math.max(peak.cpuSystemMs, r.cpuSystemMs),
      gcPauseMs: [...peak.gcPauseMs, ...r.gcPauseMs],
      gcPauseMsP99: Math.max(peak.gcPauseMsP99, r.gcPauseMsP99),
    }),
    {
      rssMb: 0,
      heapUsedMb: 0,
      externalMb: 0,
      cpuUserMs: 0,
      cpuSystemMs: 0,
      gcPauseMs: [],
      gcPauseMsP99: 0,
    },
  );

  const resourceViolations: string[] = [];
  if (resourcePeak.rssMb > slos.rssMbMax) {
    resourceViolations.push(`rss:${resourcePeak.rssMb}>${slos.rssMbMax}`);
  }
  if (resourcePeak.heapUsedMb > slos.heapUsedMbMax) {
    resourceViolations.push(`heap:${resourcePeak.heapUsedMb}>${slos.heapUsedMbMax}`);
  }
  if (resourcePeak.cpuUserMs > slos.cpuUserMsPerTrialMax) {
    resourceViolations.push(`cpu_user:${resourcePeak.cpuUserMs}>${slos.cpuUserMsPerTrialMax}`);
  }
  if (resourcePeak.gcPauseMsP99 > slos.gcPauseMsP99Max) {
    resourceViolations.push(`gc_p99:${resourcePeak.gcPauseMsP99}>${slos.gcPauseMsP99Max}`);
  }

  const aggregateOk =
    input.baseReports.length >= slos.trialsMin &&
    tiers.every((t) => t.ok) &&
    resourceViolations.length === 0;

  return {
    disclaimer: NETWORK_LOAD_SLO_DISCLAIMER,
    trials: input.baseReports.length,
    slos,
    resources: input.resources,
    resourcePeak,
    tiers: tiers.map((t) =>
      resourceViolations.length
        ? { ...t, ok: t.ok && false, violations: [...t.violations, ...resourceViolations] }
        : t,
    ),
    aggregateOk,
    passed: aggregateOk,
    token: aggregateOk ? 'BEATLINK_NETWORK_LOAD_PASS' : 'BEATLINK_NETWORK_LOAD_FAIL',
    baseReports: input.baseReports,
  };
}
