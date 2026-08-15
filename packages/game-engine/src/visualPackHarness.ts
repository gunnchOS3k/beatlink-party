/**
 * Lightweight VISUAL pack harness — manifests only.
 * Heavy capture deferred while Product-Use QEMU is active.
 */

export type VisualPackStatus =
  | 'HARNESS_READY'
  | 'CAPTURE_DEFERRED'
  | 'HISTORICAL_ONLY'
  | 'UNAVAILABLE';

export interface BeatLinkVisualPackManifest {
  schema: 'gunnchos.game_rc.visual_pack_harness/v1';
  game: 'beatlink-party';
  packet: 'GAME-RC-004';
  status: VisualPackStatus;
  VISUAL_MODEL_REVIEW: 'HISTORICAL_CAPTURES_ONLY';
  surfaces: Array<{ id: string; kind: string; capture: 'DEFERRED' | 'HISTORICAL' }>;
  deferred_heavy_work: string[];
  notes: string;
}

export function buildBeatLinkVisualPackHarness(): BeatLinkVisualPackManifest {
  return {
    schema: 'gunnchos.game_rc.visual_pack_harness/v1',
    game: 'beatlink-party',
    packet: 'GAME-RC-004',
    status: 'HARNESS_READY',
    VISUAL_MODEL_REVIEW: 'HISTORICAL_CAPTURES_ONLY',
    surfaces: [
      { id: 'landing', kind: 'screen', capture: 'HISTORICAL' },
      { id: 'host_lobby', kind: 'screen', capture: 'HISTORICAL' },
      { id: 'player_phone', kind: 'screen', capture: 'DEFERRED' },
      { id: 'audience_seat', kind: 'screen', capture: 'DEFERRED' },
      { id: 'results_awards', kind: 'screen', capture: 'DEFERRED' },
      { id: 'five_mode_transitions', kind: 'flow', capture: 'DEFERRED' },
    ],
    deferred_heavy_work: [
      'repeated video capture of five-mode session',
      'large Android/iOS export batches',
      'additional QEMU device soaks',
      'heavy multiplayer load simulations beyond unit harness',
    ],
    notes:
      'Harness + historical landing/host captures only. No invented pixel critique. Heavy capture deferred under Product-Use QEMU rule.',
  };
}
