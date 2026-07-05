export type PlayerRole = 'beat_tapper' | 'vocalist' | 'hype_captain';

export type RoomPhase =
  | 'lobby'
  | 'song_select'
  | 'calibrating'
  | 'countdown'
  | 'playing'
  | 'results';

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
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  hostId: string | null;
  players: Player[];
  selectedSongId: string | null;
  countdown: number | null;
  gameStartTime: number | null;
  gameDurationMs: number;
  teamScore: number;
  crowdMeter: number;
  createdAt: number;
  expiresAt: number;
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
  message: string;
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
