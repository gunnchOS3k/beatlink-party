/**
 * Append-only scoring ledger with deterministic replay + event identity — Wave007 GAME-BEATLINK-008/L.
 * Outcomes (individual + team) are derived from the ledger, not client-asserted totals.
 */

import type { TeamId, TimingGrade } from '@beatlink/shared';

export type LedgerEventKind =
  | 'round_start'
  | 'score'
  | 'audience_influence'
  | 'round_end'
  | 'rematch'
  | 'rejected';

export interface ScoringLedgerEvent {
  seq: number;
  kind: LedgerEventKind;
  atMs: number;
  event_id?: string;
  round_id?: string;
  idempotency_key?: string;
  payload_hash?: string;
  accepted?: boolean;
  rejection_reason?: string | null;
  score_delta?: number;
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

export interface AppendInputEventArgs {
  kind: 'score' | 'audience_influence';
  atMs: number;
  round_id: string;
  event_id: string;
  idempotency_key: string;
  playerId?: string;
  teamId?: TeamId;
  points?: number;
  grade?: TimingGrade;
  crowdDelta?: number;
  payload: Record<string, unknown>;
  meta?: Record<string, string | number | boolean | null>;
}

/** Portable FNV-1a 64-bit hex — browser+node safe (identity checksum, not a crypto claim). */
export function portableChecksum(payload: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < payload.length; i++) {
    hash ^= BigInt(payload.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function payloadHash(payload: Record<string, unknown>): string {
  return portableChecksum(JSON.stringify(payload));
}

export class ScoringLedger {
  private events: ScoringLedgerEvent[] = [];
  private seq = 0;
  private seenKeys = new Set<string>();

  clear(): void {
    this.events = [];
    this.seq = 0;
    this.seenKeys.clear();
  }

  append(partial: Omit<ScoringLedgerEvent, 'seq'>): ScoringLedgerEvent {
    const event: ScoringLedgerEvent = {
      accepted: partial.accepted ?? partial.kind !== 'rejected',
      rejection_reason: partial.rejection_reason ?? null,
      score_delta: partial.score_delta ?? (partial.kind === 'score' ? (partial.points ?? 0) : 0),
      ...partial,
      seq: ++this.seq,
    };
    if (event.idempotency_key) {
      this.seenKeys.add(event.idempotency_key);
    }
    this.events.push(event);
    return event;
  }

  /**
   * Authoritative input-event append with idempotency.
   * Duplicate idempotency_key → rejected, score_delta 0.
   */
  appendInputEvent(args: AppendInputEventArgs): ScoringLedgerEvent {
    const hash = payloadHash(args.payload);
    if (this.seenKeys.has(args.idempotency_key)) {
      return this.append({
        kind: 'rejected',
        atMs: args.atMs,
        event_id: args.event_id,
        round_id: args.round_id,
        idempotency_key: args.idempotency_key,
        payload_hash: hash,
        accepted: false,
        rejection_reason: 'duplicate_idempotency_key',
        score_delta: 0,
        playerId: args.playerId,
        teamId: args.teamId,
        points: 0,
        grade: args.grade,
        crowdDelta: 0,
        meta: { ...(args.meta ?? {}), duplicate: true },
      });
    }
    return this.append({
      kind: args.kind,
      atMs: args.atMs,
      event_id: args.event_id,
      round_id: args.round_id,
      idempotency_key: args.idempotency_key,
      payload_hash: hash,
      accepted: true,
      rejection_reason: null,
      score_delta: args.kind === 'score' ? (args.points ?? 0) : 0,
      playerId: args.playerId,
      teamId: args.teamId,
      points: args.points,
      grade: args.grade,
      crowdDelta: args.crowdDelta,
      meta: args.meta,
    });
  }

  hasIdempotencyKey(key: string): boolean {
    return this.seenKeys.has(key);
  }

  snapshot(): ScoringLedgerEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  checksum(): string {
    return portableChecksum(JSON.stringify(this.events));
  }

  /** Recompute individual + team outcomes purely from ledger events. */
  deriveOutcomes(initialCrowd = 50): LedgerDerivedOutcomes {
    const scores = new Map<string, { score: number; teamId: TeamId }>();
    const teamScores = { A: 0, B: 0, solo: 0 };
    let crowdMeter = initialCrowd;

    for (const ev of this.events) {
      if (ev.kind === 'score' && ev.accepted !== false && ev.playerId) {
        const teamId = ev.teamId ?? 'solo';
        const points = ev.score_delta ?? ev.points ?? 0;
        const prev = scores.get(ev.playerId) ?? { score: 0, teamId };
        prev.score += points;
        prev.teamId = teamId;
        scores.set(ev.playerId, prev);
        teamScores[teamId] += points;
      } else if (ev.kind === 'audience_influence' && ev.accepted !== false) {
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
      event_id: ev.event_id,
      round_id: ev.round_id,
      idempotency_key: ev.idempotency_key,
      payload_hash: ev.payload_hash,
      accepted: ev.accepted,
      rejection_reason: ev.rejection_reason,
      score_delta: ev.score_delta,
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
