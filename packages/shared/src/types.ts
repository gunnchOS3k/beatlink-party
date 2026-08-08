export type PlayerRole = 'beat_tapper' | 'vocalist' | 'hype_captain';

/** Seat kind: active scorer vs moderated spectator. */
export type SeatKind = 'player' | 'audience';

export type AudienceInfluenceType = 'hype' | 'vote';

/** First-class selectable game modes (Wave G alpha — roles ≠ modes). */
export type GameModeId =
  | 'BeatTap'
  | 'CallAndResponse'
  | 'KaraokePerformance'
  | 'BandRoles'
  | 'PredictionTrivia';

export type DifficultyId = 'beginner' | 'casual' | 'pro' | 'nightmare';

/** Room capacity profile — party default vs event-sim soft ceiling. */
export type CapacityProfile = 'party' | 'event_sim';

export type RoomPhase =
  | 'lobby'
  | 'song_select'
  | 'calibrating'
  | 'countdown'
  | 'playing'
  | 'results'
  | 'closed';

export type TimingGrade = 'perfect' | 'great' | 'good' | 'miss';

export type MusicPlatform = 'youtube' | 'spotify' | 'apple_music' | 'internal' | 'unknown';

export type PlaybackStatus =
  | 'PLAYABLE_APPROVED'
  | 'PLAYABLE_AUTHORIZED_PLATFORM'
  | 'METADATA_ONLY'
  | 'NEEDS_USER_UPLOAD'
  | 'NEEDS_LICENSE'
  | 'UNSUPPORTED'
  | 'BLOCKED_BY_POLICY'
  | 'TAKEN_DOWN'
  | 'RIGHTS_EXPIRED';

/** Rights attestation for user-owned / creator-uploaded audio (never rip). */
export type RightsAttestationStatus =
  | 'attested'
  | 'pending'
  | 'rejected'
  | 'expired'
  | 'taken_down';

export type InputType =
  | 'tap'
  | 'hold'
  | 'vocal_phrase'
  | 'hype_cheer'
  | 'hype_lights'
  | 'hype_boost'
  | 'hype_combo_save';

/** Device UX roles from field-kit G2-C6 matrix (+ optional docked). */
export type DeviceRoleId =
  | 'student_14_5'
  | 'handheld_hybrid'
  | 'ds_xl_coder'
  | 'edge_io_rings'
  | 'docked';

/** Competitive team seat for versus / band split scoring. */
export type TeamId = 'A' | 'B' | 'solo';

export interface Player {
  id: string;
  name: string;
  role: PlayerRole | null;
  ready: boolean;
  connected: boolean;
  score: number;
  accuracy: number;
  streak: number;
  maxStreak: number;
  color: string;
  /** Combo multiplier derived from streak (exposed to clients). */
  combo: number;
  /** Team assignment — defaults to solo until host assigns A/B. */
  teamId: TeamId;
}

/** Spectator seat — cannot score as a player; moderated influence only. */
export interface AudienceMember {
  id: string;
  name: string;
  connected: boolean;
  muted: boolean;
  sandboxed: boolean;
  influenceCount: number;
  lastInfluenceAt: number | null;
  color: string;
}

export interface AudienceInfluenceEvent {
  audienceId: string;
  type: AudienceInfluenceType;
  /** Optional vote choice label (non-PII). */
  choice?: string;
  accepted: boolean;
  reason?: string;
  crowdDelta: number;
  atMs: number;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  hostId: string | null;
  players: Player[];
  /** Spectator seats (not counted toward player cap / ready gate). */
  audience: AudienceMember[];
  selectedSongId: string | null;
  /** Host-pasted music URL (metadata / catalog match only — never downloaded audio). */
  pastedLinkUrl: string | null;
  /** Last successful link resolve snapshot, broadcast to peers. */
  linkResolveResult: LinkResolveResult | null;
  /** First-class selectable mode for this room round. */
  gameMode: GameModeId;
  /** Difficulty applied to mode scoring / chart density. */
  difficulty: DifficultyId;
  /** Host-measured input latency offset applied to the beatmap. */
  calibrationOffsetMs: number;
  countdown: number | null;
  gameStartTime: number | null;
  gameDurationMs: number;
  teamScore: number;
  crowdMeter: number;
  /** Rematch / round counter (increments on rematch). */
  rematchRound: number;
  /** Structured join payload for QR / deep-link (no third-party dependency). */
  joinQr: RoomJoinQrPayload | null;
  /** Room privacy posture — controls telemetry retention + name visibility. */
  privacy: RoomPrivacySettings;
  /** Team scoreboard when players are assigned to A/B. */
  teamScores: TeamScoreboard;
  /**
   * Capacity profile — `event_sim` raises soft audience ceiling for Beta
   * digital event-scale simulation only (not a live venue claim).
   */
  capacityProfile: CapacityProfile;
  createdAt: number;
  expiresAt: number;
}

export interface RoomPrivacySettings {
  /** When true, display names are redacted in public broadcasts. */
  redactDisplayNames: boolean;
  /** Allow session telemetry sinks (still never includes tokens/raw URLs). */
  telemetryEnabled: boolean;
  /** Soft retention hint for local buffers (ms). */
  telemetryRetentionMs: number;
  /** Audience must stay sandboxed until host unsandboxes (anti-grief default). */
  audienceSandboxByDefault: boolean;
}

export interface TeamScoreboard {
  A: number;
  B: number;
  solo: number;
}

/** Offline-friendly QR payload — clients encode locally; server never fetches remote QR APIs. */
export interface RoomJoinQrPayload {
  code: string;
  joinPath: string;
  joinUrl: string;
  /** Deterministic payload string for QR encoders (code + path). */
  qrText: string;
  expiresAt: number;
}

/** Which official providers have env credentials configured on the server. */
export interface ProviderAuthStatus {
  spotify: boolean;
  youtube: boolean;
  apple_music: boolean;
}

export type CatalogLicense =
  | 'royalty_free'
  | 'public_domain'
  | 'demo_generated'
  | 'synthetic_original'
  | 'licensed_pack';

export interface SongCatalogEntry {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  bpm: number;
  beatmapId: string;
  license: CatalogLicense;
  description: string;
}

export interface RightsAttestation {
  trackId: string;
  attestorId: string;
  status: RightsAttestationStatus;
  attestedAtMs: number;
  expiresAtMs: number | null;
  /** Creator-declared ownership — never implies platform rip rights. */
  ownsOrLicensed: boolean;
  sourceKind: 'catalog' | 'user_upload' | 'synthetic' | 'public_domain';
  notes?: string;
}

export interface LinkResolveResult {
  platform: MusicPlatform;
  sourceId: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  playbackStatus: PlaybackStatus;
  analysisEligible: boolean;
  lyricsEligible: boolean;
  matchedCatalogId: string | null;
  message: string;
  fallbackOptions: string[];
}

export interface BeatmapNote {
  id: string;
  timeMs: number;
  type: 'tap' | 'hold' | 'swipe';
  role: PlayerRole;
  durationMs?: number;
}

export interface VocalPrompt {
  id: string;
  timeMs: number;
  text: string;
  durationMs: number;
}

export interface HypeEvent {
  id: string;
  timeMs: number;
  type: 'cheer' | 'lights' | 'boost' | 'combo_save';
}

export interface BeatmapSection {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
}

export interface Beatmap {
  id: string;
  songId: string;
  version: string;
  bpm: number;
  offsetMs: number;
  durationMs: number;
  difficulty: DifficultyId;
  licenseStatus: string;
  sections: BeatmapSection[];
  notes: BeatmapNote[];
  vocalPrompts: VocalPrompt[];
  hypeEvents: HypeEvent[];
}

export interface PlayerInputEvent {
  playerId: string;
  type: InputType;
  clientTimeMs: number;
  noteId?: string;
  promptId?: string;
  hypeType?: 'cheer' | 'lights' | 'boost' | 'combo_save';
}

export interface ScoreEvent {
  playerId: string;
  grade: TimingGrade;
  points: number;
  streak: number;
  /** Combo multiplier at time of hit (1x, 2x, …). */
  combo: number;
  message: string;
}

export interface AccessibilitySettings {
  reduceMotion: boolean;
  highContrast: boolean;
  largerHitTargets: boolean;
  /** Prefer captions / on-screen text over audio-only cues. */
  captions: boolean;
  /** Soften red/green grade colors for color-vision deficiency. */
  colorBlindSafe: boolean;
  /** Announce critical phase changes via aria-live friendly copy. */
  screenReaderHints: boolean;
}

export type TelemetryEventName =
  | 'room_created'
  | 'player_join'
  | 'audience_join'
  | 'score'
  | 'disconnect'
  | 'audience_influence'
  | 'host_migrated'
  | 'rematch'
  | 'room_expired'
  | 'room_shutdown'
  | 'mode_selected'
  | 'rights_attestation'
  | 'rights_takedown'
  | 'team_assigned'
  | 'privacy_updated'
  | 'calibration_submitted'
  | 'moderation_action'
  | 'load_harness'
  | 'mode_tutorial'
  | 'mode_replay'
  | 'mode_results'
  | 'event_lifecycle'
  | 'event_scale_sim'
  | 'content_path'
  | 'rc_packaging'
  | 'rc_update'
  | 'rc_rollback';

/** Session telemetry — no PII (no names, tokens, or raw URLs). */
export interface TelemetryEvent {
  name: TelemetryEventName;
  roomCodeHash: string;
  atMs: number;
  meta?: Record<string, string | number | boolean | null>;
}

export interface Award {
  id: string;
  label: string;
  playerId: string;
  playerName: string;
  reason: string;
}

export interface GameResults {
  teamScore: number;
  crowdMeter: number;
  teamScores: TeamScoreboard;
  winningTeam: TeamId | 'tie' | null;
  players: Array<{
    id: string;
    name: string;
    role: PlayerRole | null;
    teamId: TeamId;
    score: number;
    accuracy: number;
    maxStreak: number;
  }>;
  awards: Award[];
}

export const PLAYER_COLORS = [
  '#ff6b6b',
  '#4ecdc4',
  '#ffe66d',
  '#a78bfa',
  '#fb923c',
  '#38bdf8',
] as const;

export const ROLES: Array<{ id: PlayerRole; label: string; description: string }> = [
  {
    id: 'beat_tapper',
    label: 'Beat Tapper',
    description: 'Tap in rhythm to keep the beat alive',
  },
  {
    id: 'vocalist',
    label: 'Vocalist',
    description: 'Perform phrase prompts on cue — no mic required for MVP',
  },
  {
    id: 'hype_captain',
    label: 'Hype Captain',
    description: 'Trigger crowd boosts and emotes on beat',
  },
];

export const GAME_MODE_IDS: GameModeId[] = [
  'BeatTap',
  'CallAndResponse',
  'KaraokePerformance',
  'BandRoles',
  'PredictionTrivia',
];

export const DEFAULT_GAME_MODE: GameModeId = 'BeatTap';
export const DEFAULT_DIFFICULTY: DifficultyId = 'casual';

/** Max absolute crowd-meter delta from a single accepted audience influence. */
export const AUDIENCE_INFLUENCE_MAX_DELTA = 2;

/** Soft floor — audience cannot drive crowd meter below this via influence alone. */
export const AUDIENCE_CROWD_METER_FLOOR = 20;

/** Soft ceiling — audience cannot push crowd meter above this via influence alone. */
export const AUDIENCE_CROWD_METER_CEILING = 90;

export const TIMING_WINDOWS_MS = {
  perfect: 40,
  great: 80,
  good: 120,
} as const;

export const SCORE_POINTS: Record<TimingGrade, number> = {
  perfect: 300,
  great: 200,
  good: 100,
  miss: 0,
};

export const HYPE_COOLDOWN_MS = 2000;

/** Audience anti-grief: minimum gap between influence actions. */
export const AUDIENCE_INFLUENCE_COOLDOWN_MS = 4000;

/** Soft cap on audience influence actions per round. */
export const AUDIENCE_INFLUENCE_MAX_PER_ROUND = 8;

export const AUDIENCE_COLORS = [
  '#94a3b8',
  '#64748b',
  '#78716c',
  '#6b7280',
  '#71717a',
  '#52525b',
] as const;

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  reduceMotion: false,
  highContrast: false,
  largerHitTargets: false,
  captions: true,
  colorBlindSafe: false,
  screenReaderHints: true,
};

export const DEFAULT_ROOM_PRIVACY: RoomPrivacySettings = {
  redactDisplayNames: false,
  telemetryEnabled: true,
  telemetryRetentionMs: 15 * 60 * 1000,
  audienceSandboxByDefault: false,
};

export const EMPTY_TEAM_SCORES: TeamScoreboard = { A: 0, B: 0, solo: 0 };

/** ADR-GAME-BL-001 performer floor/ceiling for Alpha digital party loop. */
export const MIN_PERFORMERS = 2;
export const MAX_PERFORMERS = 8;
/** Party soft ceiling — Alpha/Beta digital default. */
export const MAX_AUDIENCE_SEATS = 50;
/**
 * Event-sim soft ceiling for in-process Beta event-scale simulation.
 * Simulation ≠ live event capacity or SLA.
 */
export const MAX_AUDIENCE_SEATS_EVENT = 300;

export const DEFAULT_CAPACITY_PROFILE: CapacityProfile = 'party';

/** Audience tiers exercised by Beta event-scale simulation (honest: in-process). */
export const EVENT_AUDIENCE_TIERS = [25, 50, 100, 300] as const;
export type EventAudienceTier = (typeof EVENT_AUDIENCE_TIERS)[number];

export function maxAudienceForProfile(profile: CapacityProfile): number {
  return profile === 'event_sim' ? MAX_AUDIENCE_SEATS_EVENT : MAX_AUDIENCE_SEATS;
}

/** Legal content path kinds — never implies platform rip / DRM bypass. */
export type ContentPathKind =
  | 'royalty_free'
  | 'public_domain'
  | 'synthetic_original'
  | 'demo_generated'
  | 'licensed_pack'
  | 'creator_upload_attested'
  | 'link_catalog_match'
  | 'blocked_rip_attempt';

/** Combo multiplier steps from streak length. */
export function comboFromStreak(streak: number): number {
  if (streak >= 20) return 4;
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}
