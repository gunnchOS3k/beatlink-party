import { describe, it, expect } from 'vitest';
import {
  PROPOSED_PARTY_TIMING_BUDGET,
  applyServerClockResync,
  assessPartyTiming,
  measureClockDrift,
  partyTimingHonestyBanner,
  simulatePartyTimingScenario,
} from '../packages/game-engine/src/partyTimingBudget.js';

describe('party timing budgets — proposed, not claimed passed', () => {
  it('keeps claimedPassed false and exposes quantitative budgets', () => {
    expect(PROPOSED_PARTY_TIMING_BUDGET.claimedPassed).toBe(false);
    expect(PROPOSED_PARTY_TIMING_BUDGET.maxSteadyStateDriftMs).toBeLessThanOrEqual(50);
    expect(PROPOSED_PARTY_TIMING_BUDGET.backgroundResyncRequiredAfterMs).toBeGreaterThan(0);
    expect(PROPOSED_PARTY_TIMING_BUDGET.rejoinResyncDeadlineMs).toBeGreaterThan(0);
  });

  it('measures drift and forces resync after background / rejoin / loss', () => {
    expect(measureClockDrift(1050, 1000)).toBe(50);

    const steady = assessPartyTiming({
      scenario: 'steady',
      clientGameTimeMs: 1004,
      serverGameTimeMs: 1000,
    });
    expect(steady.withinSteadyBudget).toBe(true);
    expect(steady.requiresResync).toBe(false);
    expect(steady.claimedPassed).toBe(false);

    const bg = assessPartyTiming({
      scenario: 'background_resume',
      clientGameTimeMs: 1000,
      serverGameTimeMs: 4000,
      hiddenMs: 3000,
    });
    expect(bg.requiresResync).toBe(true);
    expect(bg.reason).toBe('background_resume_requires_resync');

    const rejoin = assessPartyTiming({
      scenario: 'rejoin',
      clientGameTimeMs: 500,
      serverGameTimeMs: 5000,
    });
    expect(rejoin.requiresResync).toBe(true);

    const loss = assessPartyTiming({
      scenario: 'network_loss',
      clientGameTimeMs: 1000,
      serverGameTimeMs: 4000,
      networkGapMs: 2500,
    });
    expect(loss.requiresResync).toBe(true);
  });

  it('applies authoritative server clock onto local wall clock', () => {
    const now = 1_700_000_000_000;
    const next = applyServerClockResync({ serverGameTimeMs: 12_345, nowMs: now });
    expect(next.rawElapsedMs).toBe(12345);
    expect(next.gameStartTime).toBe(now - 12345);
  });

  it('simulates buffering/loss/rejoin/background without claiming physical pass', () => {
    for (const scenario of [
      'steady',
      'buffering',
      'network_loss',
      'rejoin',
      'background_resume',
    ] as const) {
      const run = simulatePartyTimingScenario(scenario);
      expect(run.claimedPassed).toBe(false);
      expect(run.assessments.length).toBeGreaterThan(0);
      if (scenario !== 'steady') {
        expect(run.anyRequiresResync).toBe(true);
      }
      expect(partyTimingHonestyBanner(run.assessments[0]!)).toContain('claimedPassed=false');
    }
  });
});
