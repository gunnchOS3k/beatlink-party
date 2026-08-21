/**
 * Authoritative product state machine — Wave007.
 * Maps product HOME..ERROR onto existing RoomPhase while preserving RoomManager transitions.
 */

import type { RoomPhase } from '@beatlink/shared';
import { canTransition } from './stateMachine.js';

/** Wave007 charter product states. */
export type ProductState =
  | 'HOME'
  | 'LOBBY'
  | 'SONG_SELECT'
  | 'CALIBRATING'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'PAUSED'
  | 'RESULTS'
  | 'REMATCH'
  | 'ERROR';

const ROOM_TO_PRODUCT: Record<RoomPhase, ProductState> = {
  lobby: 'LOBBY',
  song_select: 'SONG_SELECT',
  calibrating: 'CALIBRATING',
  countdown: 'COUNTDOWN',
  playing: 'PLAYING',
  paused: 'PAUSED',
  results: 'RESULTS',
  closed: 'HOME',
};

const PRODUCT_TO_ROOM: Partial<Record<ProductState, RoomPhase>> = {
  HOME: 'closed',
  LOBBY: 'lobby',
  SONG_SELECT: 'song_select',
  CALIBRATING: 'calibrating',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  PAUSED: 'paused',
  RESULTS: 'results',
  REMATCH: 'lobby',
};

export function roomPhaseToProductState(phase: RoomPhase, rematchRound = 0): ProductState {
  if (phase === 'lobby' && rematchRound > 0) return 'REMATCH';
  return ROOM_TO_PRODUCT[phase];
}

export function productStateToRoomPhase(state: ProductState): RoomPhase | null {
  return PRODUCT_TO_ROOM[state] ?? null;
}

export const PRODUCT_TRANSITIONS: Record<ProductState, ProductState[]> = {
  HOME: ['LOBBY', 'ERROR'],
  LOBBY: ['SONG_SELECT', 'CALIBRATING', 'HOME', 'ERROR'],
  SONG_SELECT: ['CALIBRATING', 'COUNTDOWN', 'LOBBY', 'ERROR'],
  CALIBRATING: ['COUNTDOWN', 'LOBBY', 'ERROR'],
  COUNTDOWN: ['PLAYING', 'LOBBY', 'ERROR'],
  PLAYING: ['PAUSED', 'RESULTS', 'LOBBY', 'ERROR'],
  PAUSED: ['PLAYING', 'RESULTS', 'LOBBY', 'ERROR'],
  RESULTS: ['REMATCH', 'LOBBY', 'SONG_SELECT', 'HOME', 'ERROR'],
  REMATCH: ['SONG_SELECT', 'CALIBRATING', 'LOBBY', 'ERROR'],
  ERROR: ['HOME', 'LOBBY'],
};

export function canProductTransition(from: ProductState, to: ProductState): boolean {
  return PRODUCT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Consistency check: product edges that map to room phases must obey RoomPhase SM. */
export function productRoomConsistencyOk(): boolean {
  const pairs: Array<[RoomPhase, RoomPhase]> = [
    ['lobby', 'song_select'],
    ['song_select', 'calibrating'],
    ['calibrating', 'countdown'],
    ['countdown', 'playing'],
    ['playing', 'paused'],
    ['paused', 'playing'],
    ['playing', 'results'],
    ['results', 'lobby'],
  ];
  return pairs.every(([a, b]) => canTransition(a, b));
}

export const PRODUCT_STATES_ORDER: ProductState[] = [
  'HOME',
  'LOBBY',
  'SONG_SELECT',
  'CALIBRATING',
  'COUNTDOWN',
  'PLAYING',
  'PAUSED',
  'RESULTS',
  'REMATCH',
  'ERROR',
];
