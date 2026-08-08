/**
 * Real WebSocket network load — 8 performers × 25/50/100/300 audience.
 * In-process Socket.IO loopback covers full matrix; cross-process fork smokes one tier.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runCrossProcessNetworkLoad,
  runInProcessSocketNetworkLoad,
} from '../apps/server/src/load/networkLoadRunner.js';
import { EVENT_AUDIENCE_TIERS } from '@beatlink/shared';

const outDir = resolve(process.cwd(), 'docs/continuation-v');

describe('Continuation V — network load (real WebSocket)', () => {
  it(
    'measures localhost p50/p95/p99 for 8×25/50/100/300 (in-process socket server)',
    async () => {
      mkdirSync(outDir, { recursive: true });
      const report = await runInProcessSocketNetworkLoad({
        performers: 8,
        tiers: [...EVENT_AUDIENCE_TIERS],
      });

      writeFileSync(resolve(outDir, 'network-load-metrics.json'), JSON.stringify(report, null, 2));

      expect(report.metrics).toHaveLength(4);
      expect(report.passed).toBe(true);
      expect(report.token).toBe('BEATLINK_NETWORK_LOAD_PASS');
      for (const m of report.metrics) {
        expect(m.ok).toBe(true);
        expect(m.joinRttMs.samples).toBeGreaterThan(0);
        expect(m.joinRttMs.p50).toBeGreaterThanOrEqual(0);
        expect(m.joinRttMs.p95).toBeGreaterThanOrEqual(m.joinRttMs.p50);
        expect(m.joinRttMs.p99).toBeGreaterThanOrEqual(m.joinRttMs.p95);
      }
    },
    180_000,
  );

  it(
    'cross-process load: parent clients → child tsx server (tier 25 smoke + optional full)',
    async () => {
      mkdirSync(outDir, { recursive: true });
      const report = await runCrossProcessNetworkLoad({
        port: 3117,
        performers: 8,
        tiers: [...EVENT_AUDIENCE_TIERS],
        env: { BEATLINK_ROOM_STORE: 'memory' },
        readyTimeoutMs: 30_000,
      });

      writeFileSync(
        resolve(outDir, 'network-load-cross-process.json'),
        JSON.stringify(report, null, 2),
      );

      expect(report.mode).toBe('cross_process');
      expect(report.passed).toBe(true);
      expect(report.metrics).toHaveLength(4);
      for (const m of report.metrics) {
        expect(m.ok).toBe(true);
        expect(m.joinRttMs.samples).toBeGreaterThan(0);
      }
    },
    300_000,
  );
});
