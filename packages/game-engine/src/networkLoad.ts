/**
 * Network load metrics helpers — DEV/local localhost latency reporting.
 * Cross-process Socket.IO runner lives in apps/server (socket.io deps).
 */

import { EVENT_AUDIENCE_TIERS, MAX_PERFORMERS, type EventAudienceTier } from '@beatlink/shared';

export const NETWORK_LOAD_DISCLAIMER =
  'Cross-process localhost WebSocket load — DEV/local measurement only; not a live pilot, venue Wi-Fi, or SLA claim.';

export interface LatencySummary {
  p50: number;
  p95: number;
  p99: number;
  samples: number;
}

export interface NetworkLoadTierMetrics {
  tier: EventAudienceTier;
  performers: number;
  audience: number;
  joinRttMs: LatencySummary;
  influenceRttMs: LatencySummary;
  wallMs: number;
  ok: boolean;
  notes: string[];
}

export interface NetworkLoadReport {
  disclaimer: typeof NETWORK_LOAD_DISCLAIMER;
  mode: 'in_process_socket' | 'cross_process';
  baseUrl: string;
  performers: number;
  tiers: EventAudienceTier[];
  metrics: NetworkLoadTierMetrics[];
  passed: boolean;
  token: 'BEATLINK_NETWORK_LOAD_PASS' | 'BEATLINK_NETWORK_LOAD_FAIL';
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export function summarizeLatencies(samples: number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    samples: sorted.length,
  };
}

export function buildNetworkLoadReport(input: {
  mode: NetworkLoadReport['mode'];
  baseUrl: string;
  performers?: number;
  tiers?: EventAudienceTier[];
  metrics: NetworkLoadTierMetrics[];
}): NetworkLoadReport {
  const passed = input.metrics.length > 0 && input.metrics.every((m) => m.ok);
  return {
    disclaimer: NETWORK_LOAD_DISCLAIMER,
    mode: input.mode,
    baseUrl: input.baseUrl,
    performers: input.performers ?? MAX_PERFORMERS,
    tiers: input.tiers ?? [...EVENT_AUDIENCE_TIERS],
    metrics: input.metrics,
    passed,
    token: passed ? 'BEATLINK_NETWORK_LOAD_PASS' : 'BEATLINK_NETWORK_LOAD_FAIL',
  };
}
