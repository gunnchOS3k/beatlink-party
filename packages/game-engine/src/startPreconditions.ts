/**
 * Authoritative start-gate evaluation for host Start / calibration / countdown.
 * Connected seats only — disconnected players must not block a real party start.
 */

import type { Player, RoomPhase } from '@beatlink/shared';

export type StartBlockerCode =
  | 'NO_ROOM'
  | 'WRONG_PHASE'
  | 'NO_PLAYERS'
  | 'PLAYER_NOT_READY'
  | 'PLAYER_NO_ROLE'
  | 'NO_SONG'
  | 'NO_BEATMAP'
  | 'COUNTDOWN_ALREADY'
  | 'NOT_CALIBRATING'
  | 'HOST_REQUIRED';

export interface StartBlocker {
  code: StartBlockerCode;
  message: string;
  playerName?: string;
}

export interface StartGateInput {
  phase?: RoomPhase | string | null;
  selectedSongId?: string | null;
  /** When present (server), null means beatmap missing. Clients omit this field. */
  beatmap?: unknown | null;
  players?: Array<Pick<Player, 'name' | 'ready' | 'role' | 'connected'>> | null;
}

export interface StartGateResult {
  ok: boolean;
  blockers: StartBlocker[];
  /** Primary human-readable reason (first blocker), or null when ok. */
  reason: string | null;
  connectedCount: number;
  disconnectedCount: number;
}

export interface StartGateOptions {
  /** Server sets true; clients omit beatmap from RoomState so default is false there. */
  requireBeatmap?: boolean;
}

function connectedPlayers(room: StartGateInput) {
  return (room.players ?? []).filter((p) => p.connected);
}

/**
 * Lobby / song_select gate shared by host CTA and server startCalibration.
 * Ignores disconnected seats so refresh/leave ghosts cannot soft-lock Start.
 */
export function evaluateStartPreconditions(
  room: StartGateInput | null | undefined,
  options: StartGateOptions = {},
): StartGateResult {
  if (!room) {
    return {
      ok: false,
      blockers: [{ code: 'NO_ROOM', message: 'Room not found' }],
      reason: 'Room not found',
      connectedCount: 0,
      disconnectedCount: 0,
    };
  }

  const all = room.players ?? [];
  const connected = connectedPlayers(room);
  const disconnectedCount = all.length - connected.length;
  const blockers: StartBlocker[] = [];
  const requireBeatmap =
    options.requireBeatmap ?? Object.prototype.hasOwnProperty.call(room, 'beatmap');

  const phase = room.phase ?? 'lobby';
  if (phase === 'countdown') {
    blockers.push({
      code: 'COUNTDOWN_ALREADY',
      message: 'Countdown already running',
    });
  } else if (phase !== 'lobby' && phase !== 'song_select') {
    blockers.push({
      code: 'WRONG_PHASE',
      message: `Cannot start from ${phase} — return to lobby first`,
    });
  }

  if (!room.selectedSongId) {
    blockers.push({
      code: 'NO_SONG',
      message: 'Choose a playable song',
    });
  }

  if (requireBeatmap && room.selectedSongId && !room.beatmap) {
    blockers.push({
      code: 'NO_BEATMAP',
      message: 'Beatmap not ready for the selected song',
    });
  }

  if (connected.length < 1) {
    blockers.push({
      code: 'NO_PLAYERS',
      message: 'Waiting for a player to join',
    });
  } else {
    for (const p of connected) {
      if (!p.role) {
        blockers.push({
          code: 'PLAYER_NO_ROLE',
          message: `Waiting for ${p.name} to choose a role`,
          playerName: p.name,
        });
      }
      if (!p.ready) {
        blockers.push({
          code: 'PLAYER_NOT_READY',
          message: `Waiting for ${p.name} to Ready Up`,
          playerName: p.name,
        });
      }
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    reason: blockers[0]?.message ?? null,
    connectedCount: connected.length,
    disconnectedCount,
  };
}

/** Countdown requires calibrating phase + the same player/song prerequisites. */
export function evaluateCountdownPreconditions(
  room: StartGateInput | null | undefined,
): StartGateResult {
  const base = evaluateStartPreconditions(
    room
      ? {
          ...room,
          // Reuse song/player checks; phase checked separately below.
          phase: 'song_select',
        }
      : room,
    { requireBeatmap: true },
  );

  if (!room) return base;

  const blockers = [...base.blockers.filter((b) => b.code !== 'WRONG_PHASE')];
  if (room.phase !== 'calibrating') {
    blockers.unshift({
      code: 'NOT_CALIBRATING',
      message:
        room.phase === 'countdown'
          ? 'Countdown already running'
          : 'Finish calibration before starting countdown',
    });
  }

  return {
    ok: blockers.length === 0,
    blockers,
    reason: blockers[0]?.message ?? null,
    connectedCount: base.connectedCount,
    disconnectedCount: base.disconnectedCount,
  };
}

export function assertCanStartRoom(room: StartGateInput): boolean {
  const connected = connectedPlayers(room);
  return (
    connected.length > 0 &&
    connected.every((player) => player.ready && player.role !== null)
  );
}
