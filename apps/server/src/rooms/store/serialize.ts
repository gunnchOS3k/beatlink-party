import type { RoomSnapshot } from './types.js';

/** Runtime room shape RoomManager keeps (Maps/Sets + snapshot fields). */
export interface InternalRoomLive extends Omit<
  RoomSnapshot,
  'hypeCooldowns' | 'playerTokens' | 'audienceTokens' | 'scoredTargets'
> {
  hypeCooldowns: Map<string, number>;
  playerTokens: Map<string, string>;
  audienceTokens: Map<string, string>;
  scoredTargets: Set<string>;
  calibrationSamples: RoomSnapshot['calibrationSamples'];
}

export function serializeRoom(room: InternalRoomLive): RoomSnapshot {
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    players: room.players,
    audience: room.audience,
    selectedSongId: room.selectedSongId,
    pastedLinkUrl: room.pastedLinkUrl,
    linkResolveResult: room.linkResolveResult,
    gameMode: room.gameMode,
    difficulty: room.difficulty,
    calibrationOffsetMs: room.calibrationOffsetMs,
    countdown: room.countdown,
    gameStartTime: room.gameStartTime,
    gameDurationMs: room.gameDurationMs,
    teamScore: room.teamScore,
    crowdMeter: room.crowdMeter,
    capacityProfile: room.capacityProfile,
    rematchRound: room.rematchRound,
    joinQr: room.joinQr,
    privacy: room.privacy,
    teamScores: room.teamScores,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    beatmap: room.beatmap,
    hypeCooldowns: Object.fromEntries(room.hypeCooldowns.entries()),
    hostToken: room.hostToken,
    playerTokens: Object.fromEntries(room.playerTokens.entries()),
    audienceTokens: Object.fromEntries(room.audienceTokens.entries()),
    scoredTargets: [...room.scoredTargets],
    publicOrigin: room.publicOrigin,
    calibrationSamples: room.calibrationSamples,
  };
}

export function deserializeRoom(snapshot: RoomSnapshot): InternalRoomLive {
  return {
    ...snapshot,
    hypeCooldowns: new Map(Object.entries(snapshot.hypeCooldowns ?? {})),
    playerTokens: new Map(Object.entries(snapshot.playerTokens ?? {})),
    audienceTokens: new Map(Object.entries(snapshot.audienceTokens ?? {})),
    scoredTargets: new Set(snapshot.scoredTargets ?? []),
    calibrationSamples: snapshot.calibrationSamples ?? [],
  };
}
