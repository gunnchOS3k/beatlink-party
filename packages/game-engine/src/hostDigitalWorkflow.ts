/**
 * Digital host workflow checklist — create → calibrate → play → pause/resume → results.
 * Browser / loopback dual-client only. Never claims physical phone or LAN party pass.
 */

import {
  PROPOSED_PARTY_TIMING_BUDGET,
  assessPartyTiming,
  type PartyTimingAssessment,
} from './partyTimingBudget.js';

export type HostDigitalStepId =
  | 'create_room'
  | 'seat_players'
  | 'select_catalog_song'
  | 'set_mode'
  | 'host_calibration'
  | 'countdown'
  | 'playing'
  | 'pause_resume'
  | 'results'
  | 'rematch_or_end';

export interface HostDigitalStep {
  id: HostDigitalStepId;
  label: string;
  done: boolean;
}

export const HOST_DIGITAL_STEPS: readonly Omit<HostDigitalStep, 'done'>[] = [
  { id: 'create_room', label: 'Create room (host token issued)' },
  { id: 'seat_players', label: 'Seat ≥1 ready performer (digital client ok)' },
  { id: 'select_catalog_song', label: 'Select rights-cleared catalog / launch song' },
  { id: 'set_mode', label: 'Choose one of five modes' },
  { id: 'host_calibration', label: 'Run host latency calibration' },
  { id: 'countdown', label: 'Start countdown → playing' },
  { id: 'playing', label: 'Authoritative clock ticking (game.tick)' },
  { id: 'pause_resume', label: 'Optional host pause/resume preserves timeline' },
  { id: 'results', label: 'Results + ledger checksum' },
  { id: 'rematch_or_end', label: 'Rematch or end room' },
] as const;

export function buildHostDigitalWorkflow(
  doneIds: Iterable<HostDigitalStepId>,
): HostDigitalStep[] {
  const done = new Set(doneIds);
  return HOST_DIGITAL_STEPS.map((s) => ({ ...s, done: done.has(s.id) }));
}

export function hostDigitalCompletionPercent(steps: HostDigitalStep[]): number {
  if (!steps.length) return 0;
  return Math.round((100 * steps.filter((s) => s.done).length) / steps.length);
}

export function hostDigitalHonestyBanner(opts: {
  physicalPhoneClaimed?: boolean;
  workflowPercent: number;
}): string {
  const physical = opts.physicalPhoneClaimed === true;
  return `HOST_DIGITAL_WORKFLOW ${opts.workflowPercent}% · physical_phone=${physical} · timing_budget_claimedPassed=${PROPOSED_PARTY_TIMING_BUDGET.claimedPassed}`;
}

/**
 * After pause/resume, host client clock must match server game time within budget
 * or require resync — digital measurement only.
 */
export function assessHostPauseResumeClock(args: {
  clientGameTimeMs: number;
  serverGameTimeMs: number;
  wasPaused: boolean;
}): PartyTimingAssessment {
  return assessPartyTiming({
    scenario: args.wasPaused ? 'rejoin' : 'steady',
    clientGameTimeMs: args.clientGameTimeMs,
    serverGameTimeMs: args.serverGameTimeMs,
  });
}

/** Infer workflow progress from room-like phase signals (no sockets required). */
export function inferHostDigitalDone(args: {
  hasRoom: boolean;
  playerCount: number;
  readyCount: number;
  hasSong: boolean;
  hasMode: boolean;
  phase:
    | 'lobby'
    | 'song_select'
    | 'calibrating'
    | 'countdown'
    | 'playing'
    | 'paused'
    | 'results'
    | 'closed'
    | string;
  calibrated: boolean;
  pausedOnce?: boolean;
  resumedOnce?: boolean;
}): HostDigitalStepId[] {
  const done: HostDigitalStepId[] = [];
  if (args.hasRoom) done.push('create_room');
  if (args.playerCount >= 1 && args.readyCount >= 1) done.push('seat_players');
  if (args.hasSong) done.push('select_catalog_song');
  if (args.hasMode) done.push('set_mode');
  if (args.calibrated || ['countdown', 'playing', 'paused', 'results'].includes(args.phase)) {
    done.push('host_calibration');
  }
  if (['countdown', 'playing', 'paused', 'results'].includes(args.phase)) done.push('countdown');
  if (['playing', 'paused', 'results'].includes(args.phase)) done.push('playing');
  if (args.pausedOnce && args.resumedOnce) done.push('pause_resume');
  if (args.phase === 'results' || args.phase === 'closed') done.push('results');
  if (args.phase === 'closed') done.push('rematch_or_end');
  return done;
}
