/**
 * Durable room backend contract.
 * In-memory for unit tests; Redis for process-restart durability (compose).
 * Socket routing maps stay ephemeral on RoomManager — only room snapshots persist.
 */

import type {
  AudienceMember,
  Beatmap,
  DifficultyId,
  GameModeId,
  LinkResolveResult,
  Player,
  RoomPhase,
  RoomPrivacySettings,
  RoomJoinQrPayload,
  CapacityProfile,
  TeamScoreboard,
} from '@beatlink/shared';
import type { CalibrationSample } from '@beatlink/game-engine';

export type RoomStoreBackend = 'memory' | 'redis';

/** JSON-safe durable snapshot (Maps/Sets flattened). */
export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  hostId: string | null;
  players: Player[];
  audience: AudienceMember[];
  selectedSongId: string | null;
  pastedLinkUrl: string | null;
  linkResolveResult: LinkResolveResult | null;
  gameMode: GameModeId;
  difficulty: DifficultyId;
  calibrationOffsetMs: number;
  countdown: number | null;
  gameStartTime: number | null;
  gameDurationMs: number;
  teamScore: number;
  crowdMeter: number;
  capacityProfile: CapacityProfile;
  rematchRound: number;
  joinQr: RoomJoinQrPayload | null;
  privacy: RoomPrivacySettings;
  teamScores: TeamScoreboard;
  createdAt: number;
  expiresAt: number;
  beatmap: Beatmap | null;
  hypeCooldowns: Record<string, number>;
  hostToken: string;
  playerTokens: Record<string, string>;
  audienceTokens: Record<string, string>;
  scoredTargets: string[];
  publicOrigin: string;
  calibrationSamples: CalibrationSample[];
}

export interface RoomStore {
  readonly backend: RoomStoreBackend;
  has(code: string): boolean;
  get(code: string): RoomSnapshot | null;
  set(code: string, snapshot: RoomSnapshot): void;
  delete(code: string): void;
  entries(): IterableIterator<[string, RoomSnapshot]>;
  /** Optional flush for async backends (Redis write-through). */
  flush?(): Promise<void>;
  /** Optional hydrate from durable medium into local cache. */
  hydrate?(): Promise<number>;
  close?(): Promise<void>;
}
