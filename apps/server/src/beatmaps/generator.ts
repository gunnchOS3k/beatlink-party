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

function generateVocalPrompts(durationMs: number) {
  const prompts = [
    'Sing the hook!',
    'Echo the crowd!',
    'Hold this phrase!',
    'Call and response!',
    'Bring the energy!',
    'Hit the chorus!',
  ];
  const interval = durationMs / (prompts.length + 1);
  return prompts.map((text, i) => ({
    id: `vocal-${i}`,
    timeMs: Math.round(interval * (i + 1)),
    text,
    durationMs: 3000,
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
  difficulty: import('@beatlink/shared').DifficultyId = 'casual',
) {
  const beatInterval = difficulty === 'beginner' ? 2 : difficulty === 'pro' ? 0.5 : 1;
  return {
    id,
    songId,
    version: '1.0.0',
    bpm,
    offsetMs: 0,
    durationMs,
    difficulty,
    licenseStatus: 'demo_generated_royalty_free',
    sections: [
      { id: 'intro', label: 'Intro', startMs: 0, endMs: Math.round(durationMs * 0.15) },
      { id: 'verse', label: 'Verse', startMs: Math.round(durationMs * 0.15), endMs: Math.round(durationMs * 0.45) },
      { id: 'chorus', label: 'Chorus', startMs: Math.round(durationMs * 0.45), endMs: Math.round(durationMs * 0.75) },
      { id: 'outro', label: 'Outro', startMs: Math.round(durationMs * 0.75), endMs: durationMs },
    ],
    notes: generateNotes(bpm, durationMs, beatInterval),
    vocalPrompts: generateVocalPrompts(durationMs),
    hypeEvents: generateHypeEvents(bpm, durationMs),
  };
}
