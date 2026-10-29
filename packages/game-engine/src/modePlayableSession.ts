/**
 * Mode playable sessions — authorized original / PD / CC / creator-owned paths only.
 * Synchronized notes, scoring envelopes, stage cues, and results per registered mode.
 * Never rips streaming platforms or scrapes lyrics.
 */

import type {
  Beatmap,
  BeatmapNote,
  CatalogLicense,
  DifficultyId,
  GameModeId,
  SongCatalogEntry,
  TeamId,
  TimingGrade,
  VocalPrompt,
} from '@beatlink/shared';
import { GAME_MODE_IDS } from '@beatlink/shared';
import { getGameMode, buildModeResultsBoard, type ModeResultsRow } from './modes/index.js';
import {
  isCallAndResponseWindow,
  nextPredictionSection,
  buildPredictionChoices,
} from './modeRuntime.js';
import { buildKaraokePromptState } from './karaoke.js';
import { resolveContentPath, type ContentPathDecision } from './contentPaths.js';
import { resolveSongSource, type SongSource } from './songSource.js';

export type PlayableAudioKind =
  | 'procedural_song_bed'
  | 'procedural_metronome_fallback'
  | 'creator_attested_stub'
  | 'blocked';

export interface ModeNoteCue {
  noteId: string;
  timeMs: number;
  lane: 'tap' | 'hold' | 'swipe' | 'vocal' | 'hype' | 'predict';
  label: string;
}

export interface ModeStageVisual {
  modeId: GameModeId;
  headline: string;
  subline: string;
  energy: number;
  activeCueLabel: string | null;
  sectionLabel: string | null;
  callResponsePhase: 'call' | 'response' | 'idle' | null;
  karaokePhase: string | null;
  predictionTarget: string | null;
}

export interface ModePlayableSession {
  modeId: GameModeId;
  songId: string;
  songTitle: string;
  license: CatalogLicense;
  audioKind: PlayableAudioKind;
  contentPath: ContentPathDecision;
  songSource: SongSource;
  bpm: number;
  durationMs: number;
  difficulty: DifficultyId;
  /** Beat-synced cues derived from the chart — not metronome-only filler. */
  noteCues: ModeNoteCue[];
  vocalPrompts: VocalPrompt[];
  rightsHonest: {
    ripForbidden: true;
    drmBypassForbidden: true;
    commercialClaim: false;
    pitchAnalysisClaim: boolean;
  };
  message: string;
}

const LAUNCH_SAFE: CatalogLicense[] = [
  'demo_generated',
  'synthetic_original',
  'public_domain',
  'royalty_free',
  'creative_commons',
  'creator_owned',
  'licensed_pack',
];

function noteLane(note: BeatmapNote): ModeNoteCue['lane'] {
  if (note.type === 'hold') return 'hold';
  if (note.type === 'swipe') return 'swipe';
  return 'tap';
}

function cuesFromBeatmap(modeId: GameModeId, beatmap: Beatmap): ModeNoteCue[] {
  const cues: ModeNoteCue[] = [];
  for (const note of beatmap.notes) {
    cues.push({
      noteId: note.id,
      timeMs: note.timeMs,
      lane: noteLane(note),
      label: `${note.type} @ ${note.timeMs}ms`,
    });
  }
  if (modeId === 'KaraokePerformance' || modeId === 'BandRoles') {
    for (const p of beatmap.vocalPrompts) {
      cues.push({
        noteId: p.id,
        timeMs: p.timeMs,
        lane: 'vocal',
        label: p.text,
      });
    }
  }
  if (modeId === 'BandRoles') {
    for (const h of beatmap.hypeEvents) {
      cues.push({
        noteId: h.id,
        timeMs: h.timeMs,
        lane: 'hype',
        label: h.type,
      });
    }
  }
  if (modeId === 'PredictionTrivia') {
    for (const s of beatmap.sections) {
      cues.push({
        noteId: `predict-${s.id}`,
        timeMs: Math.max(0, s.startMs - 1500),
        lane: 'predict',
        label: `Predict ${s.label}`,
      });
    }
  }
  return cues.sort((a, b) => a.timeMs - b.timeMs);
}

/** Prefer mode-tagged launch songs; fall back to any launch-safe catalog entry. */
export function pickModeSong(
  modeId: GameModeId,
  catalog: SongCatalogEntry[],
): SongCatalogEntry | null {
  const tagged = catalog.find(
    (s) =>
      s.launchEligible !== false &&
      LAUNCH_SAFE.includes(s.license) &&
      (s.modes?.includes(modeId) ?? false),
  );
  if (tagged) return tagged;
  return (
    catalog.find((s) => LAUNCH_SAFE.includes(s.license) && s.modes?.includes(modeId)) ??
    catalog.find((s) => LAUNCH_SAFE.includes(s.license)) ??
    null
  );
}

export function openModePlayableSession(input: {
  modeId: GameModeId;
  catalogEntry: SongCatalogEntry;
  beatmap: Beatmap;
  difficulty?: DifficultyId;
  /** When true, karaoke session may claim pitch path (mic consented + DSP). */
  pitchAnalysisEnabled?: boolean;
}): ModePlayableSession {
  const mode = getGameMode(input.modeId);
  const contentPath = resolveContentPath({ catalogEntry: input.catalogEntry });
  const songSource = resolveSongSource({ catalogEntry: input.catalogEntry });
  const playable =
    contentPath.ok &&
    LAUNCH_SAFE.includes(input.catalogEntry.license) &&
    songSource.canGameplayStream;

  const audioKind: PlayableAudioKind = !playable
    ? 'blocked'
    : input.catalogEntry.license === 'creator_owned'
      ? 'creator_attested_stub'
      : songSource.media.kind === 'procedural_song_bed' ||
          songSource.media.kind === 'catalog_approved'
        ? 'procedural_song_bed'
        : 'procedural_metronome_fallback';

  return {
    modeId: input.modeId,
    songId: input.catalogEntry.id,
    songTitle: input.catalogEntry.title,
    license: input.catalogEntry.license,
    audioKind,
    contentPath,
    songSource,
    bpm: input.catalogEntry.bpm,
    durationMs: input.catalogEntry.durationMs,
    difficulty: input.difficulty ?? 'casual',
    noteCues: cuesFromBeatmap(input.modeId, input.beatmap),
    vocalPrompts: input.beatmap.vocalPrompts,
    rightsHonest: {
      ripForbidden: true,
      drmBypassForbidden: true,
      commercialClaim: false,
      pitchAnalysisClaim:
        input.modeId === 'KaraokePerformance' && input.pitchAnalysisEnabled === true,
    },
    message: playable
      ? `${mode.label} session on "${input.catalogEntry.title}" (${audioKind}) — lawful catalog path.`
      : `Blocked: ${contentPath.message}`,
  };
}

export function buildModeStageVisual(
  session: ModePlayableSession,
  beatmap: Beatmap,
  gameTimeMs: number,
  crowdMeter = 50,
): ModeStageVisual {
  const upcoming = session.noteCues.find((c) => c.timeMs >= gameTimeMs - 50);
  const section =
    beatmap.sections.find((s) => gameTimeMs >= s.startMs && gameTimeMs < s.endMs) ?? null;
  const cr =
    session.modeId === 'CallAndResponse'
      ? isCallAndResponseWindow(beatmap.sections, gameTimeMs).phase
      : null;
  const karaoke =
    session.modeId === 'KaraokePerformance' || session.modeId === 'BandRoles'
      ? buildKaraokePromptState(beatmap.vocalPrompts, gameTimeMs).phase
      : null;
  const pred =
    session.modeId === 'PredictionTrivia'
      ? nextPredictionSection(beatmap.sections, gameTimeMs)?.label ?? null
      : null;

  return {
    modeId: session.modeId,
    headline: `${getGameMode(session.modeId).label} · ${session.songTitle}`,
    subline: session.message,
    energy: Math.max(0, Math.min(100, crowdMeter)),
    activeCueLabel: upcoming?.label ?? null,
    sectionLabel: section?.label ?? null,
    callResponsePhase: cr,
    karaokePhase: karaoke,
    predictionTarget: pred,
  };
}

export function buildModeSessionResults(
  session: ModePlayableSession,
  input: {
    teamScore: number;
    crowdMeter: number;
    winningTeam: TeamId | 'tie' | null;
    rows: ModeResultsRow[];
  },
) {
  const board = buildModeResultsBoard(session.modeId, {
    difficulty: session.difficulty,
    teamScore: input.teamScore,
    crowdMeter: input.crowdMeter,
    winningTeam: input.winningTeam,
    rows: input.rows,
  });
  return {
    ...board,
    songId: session.songId,
    songTitle: session.songTitle,
    audioKind: session.audioKind,
    license: session.license,
    pitchAnalysisClaimed: session.rightsHonest.pitchAnalysisClaim,
    commercialClaim: false as const,
    headline: `${board.headline} · ${session.songTitle}`,
  };
}

/** Upcoming synced note window for host/player stage lanes. */
export function upcomingSyncedNotes(
  cues: ModeNoteCue[],
  gameTimeMs: number,
  windowMs = 2000,
): ModeNoteCue[] {
  return cues.filter((c) => c.timeMs >= gameTimeMs - 100 && c.timeMs <= gameTimeMs + windowMs);
}

export function assertFiveModePlayableCoverage(catalog: SongCatalogEntry[]): {
  complete: boolean;
  missing: GameModeId[];
  byMode: Record<GameModeId, string | null>;
} {
  const byMode = {} as Record<GameModeId, string | null>;
  const missing: GameModeId[] = [];
  for (const id of GAME_MODE_IDS) {
    const song = pickModeSong(id, catalog);
    byMode[id] = song?.id ?? null;
    if (!song) missing.push(id);
  }
  return { complete: missing.length === 0, missing, byMode };
}

export function predictionChoicesForSession(
  session: ModePlayableSession,
  beatmap: Beatmap,
  gameTimeMs: number,
): string[] {
  if (session.modeId !== 'PredictionTrivia') return [];
  const target = nextPredictionSection(beatmap.sections, gameTimeMs);
  if (!target) return [];
  return buildPredictionChoices(beatmap, session.difficulty, target);
}

export type GradeSample = { atMs: number; grade: TimingGrade; points: number };
