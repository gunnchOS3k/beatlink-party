import type { RoomPhase } from '@beatlink/shared';

const VALID_TRANSITIONS: Record<RoomPhase, RoomPhase[]> = {
  lobby: ['song_select', 'lobby'],
  song_select: ['calibrating', 'countdown', 'lobby'],
  calibrating: ['countdown', 'lobby'],
  countdown: ['playing', 'lobby'],
  playing: ['results', 'lobby'],
  results: ['lobby', 'song_select', 'countdown'],
};

export function canTransition(from: RoomPhase, to: RoomPhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: RoomPhase, to: RoomPhase): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid room phase transition: ${from} -> ${to}`);
  }
}

export function getNextPhaseAfterCountdown(): RoomPhase {
  return 'playing';
}

export function getPhaseAfterGameEnd(): RoomPhase {
  return 'results';
}
