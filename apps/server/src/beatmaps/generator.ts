import type { CatalogKaraokePhrase, DifficultyId, SongCatalogEntry } from '@beatlink/shared';

function generateNotes(bpm: number, durationMs: number, beatInterval: number) {
  const beatMs = (60 / bpm) * 1000;
  const notes = [];
  let t = process.env.BEATLINK_WAVE007_E2E === '1' ? 400 : 2000;
  let i = 0;
  const endPad = process.env.BEATLINK_WAVE007_E2E === '1' ? 500 : 2000;
  while (t < durationMs - endPad) {
    const kind =
      i % 7 === 0 ? 'hold' : i % 5 === 0 ? 'swipe' : 'tap';
    notes.push({
      id: `note-${i}`,
      timeMs: Math.round(t),
      type: kind as 'tap' | 'swipe' | 'hold',
      role: 'beat_tapper' as const,
      durationMs: kind === 'hold' ? beatMs * 2 : undefined,
    });
    t += beatMs * beatInterval;
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

function generateHypeEvents(bpm: number, durationMs: number) {
  const beatMs = (60 / bpm) * 1000;
  const types = ['cheer', 'lights', 'boost', 'combo_save'] as const;
  const events = [];
  let t = 3000;
  let i = 0;
  while (t < durationMs - 3000) {
    events.push({
      id: `hype-${i}`,
      timeMs: Math.round(t),
      type: types[i % types.length],
    });
    t += beatMs * 4;
    i++;
  }
  return events;
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
  return {
    id,
    songId,
    version: '1.1.0',
    bpm,
    offsetMs: 0,
    durationMs,
    difficulty,
    licenseStatus: catalogEntry?.license ?? 'demo_generated_royalty_free',
    sections: [
      { id: 'intro', label: 'Intro', startMs: 0, endMs: Math.round(durationMs * 0.12) },
      { id: 'verse', label: 'Verse', startMs: Math.round(durationMs * 0.12), endMs: Math.round(durationMs * 0.4) },
      { id: 'chorus', label: 'Chorus', startMs: Math.round(durationMs * 0.4), endMs: Math.round(durationMs * 0.68) },
      { id: 'bridge', label: 'Bridge', startMs: Math.round(durationMs * 0.68), endMs: Math.round(durationMs * 0.85) },
      { id: 'outro', label: 'Outro', startMs: Math.round(durationMs * 0.85), endMs: durationMs },
    ],
    notes: generateNotes(bpm, durationMs, beatInterval),
    vocalPrompts: generateVocalPrompts(durationMs, {
      phrases: karaoke?.phrases,
      prompts: karaoke?.prompts,
      pitchHintHz: karaoke?.pitchHintHz ?? null,
    }),
    hypeEvents: generateHypeEvents(bpm, durationMs),
  };
}
