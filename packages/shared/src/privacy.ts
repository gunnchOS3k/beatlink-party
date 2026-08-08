/**
 * Privacy architecture — Alpha digital.
 * Telemetry never includes names, tokens, or raw URLs.
 * Display-name redaction is opt-in per room.
 */

import type { Player, RoomPrivacySettings, TeamId } from './types.js';
import { DEFAULT_ROOM_PRIVACY } from './types.js';

const PII_KEYS = new Set([
  'name',
  'playerName',
  'displayName',
  'hostToken',
  'playerToken',
  'audienceToken',
  'token',
  'url',
  'pastedLinkUrl',
  'artworkUrl',
]);

export function createRoomPrivacy(
  patch: Partial<RoomPrivacySettings> = {},
): RoomPrivacySettings {
  return { ...DEFAULT_ROOM_PRIVACY, ...patch };
}

/** Strip known PII keys from arbitrary meta payloads. */
export function redactPiiMeta(
  meta: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (PII_KEYS.has(key) || /token|password|secret|url/i.test(key)) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function displayNameForBroadcast(
  name: string,
  privacy: RoomPrivacySettings,
  seatIndex: number,
): string {
  if (!privacy.redactDisplayNames) return name;
  return `Player ${seatIndex + 1}`;
}

export function publicPlayerView(
  player: Player,
  privacy: RoomPrivacySettings,
  seatIndex: number,
): Player {
  return {
    ...player,
    name: displayNameForBroadcast(player.name, privacy, seatIndex),
  };
}

/** Drop aged telemetry events beyond retention window. */
export function pruneTelemetryByRetention<T extends { atMs: number }>(
  events: T[],
  retentionMs: number,
  nowMs = Date.now(),
): T[] {
  const cutoff = nowMs - retentionMs;
  return events.filter((e) => e.atMs >= cutoff);
}

export function isTeamId(value: string): value is TeamId {
  return value === 'A' || value === 'B' || value === 'solo';
}
