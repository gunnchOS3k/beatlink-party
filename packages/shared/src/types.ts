export type PlayerRole = 'beat_tapper' | 'vocalist' | 'hype_captain';

/** Seat kind: active scorer vs moderated spectator. */
export type SeatKind = 'player' | 'audience';

export type AudienceInfluenceType = 'hype' | 'vote';

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
  | 'BLOCKED_BY_POLICY';

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
  /** Host-measured input latency offset applied to the beatmap. */
  calibrationOffsetMs: number;
  countdown: number | null;
  gameStartTime: number | null;
  gameDurationMs: number;
  teamScore: number;
  crowdMeter: number;
  /** Rematch / round counter (increments on rematch). */
  rematchRound: number;
  createdAt: number;
  expiresAt: number;
}

/** Which official providers have env credentials configured on the server. */
export interface ProviderAuthStatus {
  spotify: boolean;
  youtube: boolean;
  apple_music: boolean;
}

export interface SongCatalogEntry {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  bpm: number;
  beatmapId: string;
  license: 'royalty_free' | 'public_domain' | 'demo_generated';
  description: string;
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
  difficulty: 'beginner' | 'casual' | 'pro' | 'nightmare';
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
}

export type TelemetryEventName =
  | 'room_created'
  | 'player_join'
  | 'audience_join'
  | 'score'
  | 'disconnect'
  | 'audience_influence'
  | 'host_migrated'
  | 'rematch';

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
  players: Array<{
    id: string;
    name: string;
    role: PlayerRole | null;
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
};

/** Combo multiplier steps from streak length. */
export function comboFromStreak(streak: number): number {
  if (streak >= 20) return 4;
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}
