import type {
  CatalogKaraokePhrase,
  DifficultyId,
  PlayerRole,
  SongCatalogEntry,
} from '@beatlink/shared';

type NoteKind = 'tap' | 'swipe' | 'hold';

interface ChartSection {
  id: string;
  label: string;
  startMs: number;
  endMs: number;
}

/** Section density multipliers — chorus denser than intro/outro; not duration padding. */
const SECTION_DENSITY: Record<string, number> = {
  intro: 0.45,
  verse: 0.85,
  chorus: 1.35,
  bridge: 1.0,
  outro: 0.4,
};

function sectionAt(sections: ChartSection[], t: number): ChartSection | null {
  return sections.find((s) => t >= s.startMs && t < s.endMs) ?? sections[sections.length - 1] ?? null;
}

function pickKind(i: number, sectionId: string): NoteKind {
  if (sectionId === 'chorus') {
    return i % 4 === 0 ? 'hold' : i % 3 === 0 ? 'swipe' : 'tap';
  }
  if (sectionId === 'bridge') {
    return i % 5 === 0 ? 'swipe' : i % 6 === 0 ? 'hold' : 'tap';
  }
  if (sectionId === 'intro' || sectionId === 'outro') {
    return i % 8 === 0 ? 'hold' : 'tap';
  }
  return i % 7 === 0 ? 'hold' : i % 5 === 0 ? 'swipe' : 'tap';
}

/**
 * Musically sectioned chart — density follows intro/verse/chorus/bridge/outro.
 * Uniform metronome padding is not musical completion.
 */
function generateNotes(
  bpm: number,
  durationMs: number,
  beatInterval: number,
  sections: ChartSection[],
  noteRoles: PlayerRole[],
) {
  const beatMs = (60 / bpm) * 1000;
  const notes = [];
  const e2e = process.env.BEATLINK_WAVE007_E2E === '1';
  let t = e2e ? 400 : 2000;
  let i = 0;
  const endPad = e2e ? 500 : 2000;
  const roles = noteRoles.length > 0 ? noteRoles : (['beat_tapper'] as PlayerRole[]);

  while (t < durationMs - endPad) {
    const section = sectionAt(sections, t);
    const sectionId = section?.id ?? 'verse';
    const density = SECTION_DENSITY[sectionId] ?? 1;
    // Higher density → shorter step between notes (more musical activity in chorus).
    const stepBeats = Math.max(0.25, beatInterval / density);
    const kind = pickKind(i, sectionId);
    const role = roles[i % roles.length]!;

    notes.push({
      id: `note-${i}`,
      timeMs: Math.round(t),
      type: kind,
      role,
      durationMs: kind === 'hold' ? Math.round(beatMs * (sectionId === 'chorus' ? 1.5 : 2)) : undefined,
    });

    t += beatMs * stepBeats;
    i++;
  }
  return notes;
}

const DEFAULT_PROMPTS = [
  'Sing the hook!',
  'Echo the crowd!',
  'Hold this phrase!',
  'Call and response!',
  'Bring the energy!',
  'Hit the chorus!',
  'Soft verse line!',
  'Lift into the bridge!',
];

/** Melodic contour (Hz) for original placeholder phrases — not commercial lyrics. */
const DEFAULT_MELODY_HZ = [196, 220, 247, 262, 294, 330, 294, 247];

function generateVocalPrompts(
  durationMs: number,
  options: {
    phrases?: CatalogKaraokePhrase[];
    prompts?: string[];
    pitchHintHz?: number | null;
  } = {},
) {
  if (options.phrases && options.phrases.length > 0) {
    return options.phrases.map((p) => ({
      id: p.id,
      timeMs: Math.round(p.startMs),
      text: p.text,
      durationMs: Math.max(100, Math.round(p.durationMs)),
      targetPitchHz: p.targetPitchHz,
    }));
  }

  const prompts = options.prompts?.length ? options.prompts : DEFAULT_PROMPTS;
  // Spread phrases across the song body (skip intro/outro pads).
  const usable = Math.max(8000, durationMs - 6000);
  const interval = usable / (prompts.length + 1);
  const base = options.pitchHintHz && options.pitchHintHz > 0 ? options.pitchHintHz : 220;
  return prompts.map((text, i) => ({
    id: `vocal-${i}`,
    timeMs: Math.round(3000 + interval * (i + 1)),
    text,
    durationMs: Math.min(4500, Math.max(2200, Math.round(interval * 0.55))),
    targetPitchHz: DEFAULT_MELODY_HZ[i % DEFAULT_MELODY_HZ.length] ?? base,
  }));
}

function generateHypeEvents(bpm: number, durationMs: number, sections: ChartSection[]) {
  const beatMs = (60 / bpm) * 1000;
  const types = ['cheer', 'lights', 'boost', 'combo_save'] as const;
  const events = [];
  let t = 3000;
  let i = 0;
  while (t < durationMs - 3000) {
    const section = sectionAt(sections, t);
    // Prefer hype accents in chorus/bridge — musical placement, not uniform pad.
    const stepBeats = section?.id === 'chorus' ? 2 : section?.id === 'bridge' ? 3 : 4;
    events.push({
      id: `hype-${i}`,
      timeMs: Math.round(t),
      type: types[i % types.length],
    });
    t += beatMs * stepBeats;
    i++;
  }
  return events;
}

function buildSections(durationMs: number): ChartSection[] {
  return [
    { id: 'intro', label: 'Intro', startMs: 0, endMs: Math.round(durationMs * 0.12) },
    {
      id: 'verse',
      label: 'Verse',
      startMs: Math.round(durationMs * 0.12),
      endMs: Math.round(durationMs * 0.4),
    },
    {
      id: 'chorus',
      label: 'Chorus',
      startMs: Math.round(durationMs * 0.4),
      endMs: Math.round(durationMs * 0.68),
    },
    {
      id: 'bridge',
      label: 'Bridge',
      startMs: Math.round(durationMs * 0.68),
      endMs: Math.round(durationMs * 0.85),
    },
    { id: 'outro', label: 'Outro', startMs: Math.round(durationMs * 0.85), endMs: durationMs },
  ];
}

/** Audit helper — chorus must be denser than intro (musical, not pad). */
export function chartSectionDensities(
  notes: Array<{ timeMs: number }>,
  sections: ChartSection[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  const durations: Record<string, number> = {};
  for (const s of sections) {
    counts[s.id] = 0;
    durations[s.id] = Math.max(1, s.endMs - s.startMs);
  }
  for (const n of notes) {
    const sid = sectionAt(sections, n.timeMs)?.id;
    if (sid && counts[sid] != null) counts[sid]! += 1;
  }
  const out: Record<string, number> = {};
  for (const id of Object.keys(counts)) {
    out[id] = (counts[id]! * 60_000) / durations[id]!;
  }
  return out;
}

/** Honest musical-quality gate — duration padding alone fails. */
export function assessChartMusicalQuality(
  notes: Array<{ timeMs: number; type: string; role: string }>,
  sections: ChartSection[],
): {
  sectionAware: boolean;
  metronomePaddingOnly: boolean;
  chorusDenserThanIntro: boolean;
  roleVariety: number;
  typeVariety: number;
  ok: boolean;
} {
  const dens = chartSectionDensities(notes, sections);
  const chorusDenserThanIntro = (dens.chorus ?? 0) > (dens.intro ?? 0) * 1.15;
  const roleVariety = new Set(notes.map((n) => n.role)).size;
  const typeVariety = new Set(notes.map((n) => n.type)).size;
  // Uniform single-gap metronome pad → fail musical quality.
  const times = notes.map((n) => n.timeMs).sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => t - times[i]!);
  const uniqGaps = new Set(gaps.map((g) => Math.round(g / 10) * 10));
  const metronomePaddingOnly = uniqGaps.size <= 1 && typeVariety <= 1;
  const sectionAware = sections.length >= 4 && chorusDenserThanIntro;
  return {
    sectionAware,
    metronomePaddingOnly,
    chorusDenserThanIntro,
    roleVariety,
    typeVariety,
    ok: sectionAware && !metronomePaddingOnly && notes.length > 10,
  };
}

export function createDemoBeatmap(
  id: string,
  songId: string,
  bpm: number,
  durationMs: number,
  difficulty: DifficultyId = 'casual',
  catalogEntry?: SongCatalogEntry | null,
) {
  const beatInterval =
    difficulty === 'beginner' ? 2 : difficulty === 'pro' ? 0.5 : difficulty === 'nightmare' ? 0.4 : 1;
  const karaoke = catalogEntry?.karaokeMeta;
  const sections = buildSections(durationMs);
  const noteRoles: PlayerRole[] =
    catalogEntry?.chart?.noteRoles?.length
      ? catalogEntry.chart.noteRoles
      : catalogEntry?.modes?.includes('BandRoles')
        ? ['beat_tapper', 'vocalist', 'hype_captain']
        : ['beat_tapper'];
  const notes = generateNotes(bpm, durationMs, beatInterval, sections, noteRoles);
  return {
    id,
    songId,
    version: '1.2.0',
    bpm,
    offsetMs: 0,
    durationMs,
    difficulty,
    licenseStatus: catalogEntry?.license ?? 'demo_generated_royalty_free',
    sections,
    notes,
    vocalPrompts: generateVocalPrompts(durationMs, {
      phrases: karaoke?.phrases,
      prompts: karaoke?.prompts,
      pitchHintHz: karaoke?.pitchHintHz ?? null,
    }),
    hypeEvents: generateHypeEvents(bpm, durationMs, sections),
  };
}
