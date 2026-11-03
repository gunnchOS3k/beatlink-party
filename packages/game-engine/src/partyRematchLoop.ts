/**
 * Digital party rematch / results dwell loop.
 * Suggested cadence only — not a physical LAN party or human fun claim.
 */

import {
  SUGGESTED_COUNTDOWN_SECONDS,
  SUGGESTED_RESULTS_DWELL_MS,
} from './partyPacing.js';

export interface PartyRematchLoopInput {
  rematchRound: number;
  phase: 'results' | 'lobby' | 'song_select' | 'calibrating' | 'countdown' | 'playing' | 'paused' | 'closed' | string;
  hasResults: boolean;
  resultsDwellMs?: number;
  modeId?: string | null;
}

export interface PartyRematchLoopAssessment {
  rematchRound: number;
  resultsVisible: boolean;
  dwellSuggestedMs: number;
  dwellObservedMs: number | null;
  dwellMet: boolean;
  rematchReady: boolean;
  suggestedCountdownSeconds: number;
  /** Always false — digital rematch ≠ physical party pass. */
  physicalPartyClaimed: false;
  /** Always false until HUMAN review. */
  humanFirstFunClaimed: false;
  honestyBanner: string;
}

export const PARTY_REMATCH_HONESTY =
  'Digital rematch/results dwell ≠ physical LAN party or HUMAN first-fun claim.';

export function assessPartyRematchLoop(input: PartyRematchLoopInput): PartyRematchLoopAssessment {
  const resultsVisible = input.phase === 'results' && input.hasResults;
  const dwellObservedMs =
    typeof input.resultsDwellMs === 'number' && Number.isFinite(input.resultsDwellMs)
      ? Math.max(0, input.resultsDwellMs)
      : null;
  const dwellMet =
    dwellObservedMs == null ? false : dwellObservedMs >= SUGGESTED_RESULTS_DWELL_MS;
  const rematchReady = resultsVisible;
  return {
    rematchRound: Math.max(0, Math.floor(input.rematchRound)),
    resultsVisible,
    dwellSuggestedMs: SUGGESTED_RESULTS_DWELL_MS,
    dwellObservedMs,
    dwellMet,
    rematchReady,
    suggestedCountdownSeconds: SUGGESTED_COUNTDOWN_SECONDS,
    physicalPartyClaimed: false,
    humanFirstFunClaimed: false,
    honestyBanner: `PARTY_REMATCH round=${Math.max(0, Math.floor(input.rematchRound))} results=${resultsVisible} dwellMet=${dwellMet} mode=${input.modeId ?? '—'} · physical_party=false · human_first_fun=false · ${PARTY_REMATCH_HONESTY}`,
  };
}
