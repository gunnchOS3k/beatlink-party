/**
 * Append-only scoring ledger with deterministic replay — Wave007 GAME-BEATLINK-008.
 * Outcomes (individual + team) are derived from the ledger, not client-asserted totals.
 */

import { createHash } from 'node:crypto';
import type { TeamId, TimingGrade } from '@beatlink/shared';

export type LedgerEventKind =
  | 'round_start'
  | 'score'
  | 'audience_influence'
  | 'round_end'
  | 'rematch';

export interface ScoringLedgerEvent {
  seq: number;
  kind: LedgerEventKind;
  atMs: number;
  playerId?: string;
  teamId?: TeamId;
  points?: number;
  grade?: TimingGrade;
  crowdDelta?: number;
  meta?: Record<string, string | number | boolean | null>;
}

export interface LedgerDerivedOutcomes {
  individual: Array<{ playerId: string; score: number; teamId: TeamId }>;
  teamScores: { A: number; B: number; solo: number };
  crowdMeter: number;
  checksum: string;
}

export class ScoringLedger {
  private events: ScoringLedgerEvent[] = [];
  private seq = 0;

  clear(): void {
    this.events = [];
    this.seq = 0;
  }

  append(partial: Omit<ScoringLedgerEvent, 'seq'>): ScoringLedgerEvent {
    const event: ScoringLedgerEvent = { ...partial, seq: ++this.seq };
    this.events.push(event);
    return event;
  }

  snapshot(): ScoringLedgerEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  checksum(): string {
    const payload = JSON.stringify(this.events);
    return createHash('sha256').update(payload).digest('hex');
  }

  /** Recompute individual + team outcomes purely from ledger events. */
  deriveOutcomes(initialCrowd = 50): LedgerDerivedOutcomes {
    const scores = new Map<string, { score: number; teamId: TeamId }>();
    const teamScores = { A: 0, B: 0, solo: 0 };
    let crowdMeter = initialCrowd;

    for (const ev of this.events) {
      if (ev.kind === 'score' && ev.playerId) {
        const teamId = ev.teamId ?? 'solo';
        const points = ev.points ?? 0;
        const prev = scores.get(ev.playerId) ?? { score: 0, teamId };
        prev.score += points;
        prev.teamId = teamId;
        scores.set(ev.playerId, prev);
        teamScores[teamId] += points;
      } else if (ev.kind === 'audience_influence') {
        crowdMeter = Math.min(100, Math.max(0, crowdMeter + (ev.crowdDelta ?? 0)));
      } else if (ev.kind === 'rematch' || ev.kind === 'round_start') {
        scores.clear();
        teamScores.A = 0;
        teamScores.B = 0;
        teamScores.solo = 0;
        crowdMeter = initialCrowd;
      }
    }

    return {
      individual: [...scores.entries()].map(([playerId, v]) => ({
        playerId,
        score: v.score,
        teamId: v.teamId,
      })),
      teamScores: { ...teamScores },
      crowdMeter,
      checksum: this.checksum(),
    };
  }
}

/** Replay a frozen event list and require identical checksum + outcomes. */
export function replayLedgerEvents(
  events: ScoringLedgerEvent[],
  initialCrowd = 50,
): LedgerDerivedOutcomes {
  const ledger = new ScoringLedger();
  for (const ev of events) {
    ledger.append({
      kind: ev.kind,
      atMs: ev.atMs,
      playerId: ev.playerId,
      teamId: ev.teamId,
      points: ev.points,
      grade: ev.grade,
      crowdDelta: ev.crowdDelta,
      meta: ev.meta,
    });
  }
  return ledger.deriveOutcomes(initialCrowd);
}

export function ledgersMatch(a: LedgerDerivedOutcomes, b: LedgerDerivedOutcomes): boolean {
  return (
    a.checksum === b.checksum &&
    a.crowdMeter === b.crowdMeter &&
    a.teamScores.A === b.teamScores.A &&
    a.teamScores.B === b.teamScores.B &&
    a.teamScores.solo === b.teamScores.solo &&
    JSON.stringify(a.individual.sort((x, y) => x.playerId.localeCompare(y.playerId))) ===
      JSON.stringify(b.individual.sort((x, y) => x.playerId.localeCompare(y.playerId)))
  );
}
