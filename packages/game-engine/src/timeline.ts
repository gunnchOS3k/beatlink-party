import type { Beatmap, BeatmapNote, HypeEvent, VocalPrompt } from '@beatlink/shared';

/**
 * Convert wall-clock elapsed ms into calibrated game timeline ms.
 * Positive calibrationOffsetMs means the host/players tap late → subtract.
 */
export function calibratedGameTimeMs(rawElapsedMs: number, calibrationOffsetMs: number): number {
  return rawElapsedMs - (calibrationOffsetMs || 0);
}

export function beatIntervalMs(bpm: number): number {
  return 60_000 / Math.max(1, bpm);
}

export function beatIndexAt(gameTimeMs: number, bpm: number, offsetMs = 0): number {
  const interval = beatIntervalMs(bpm);
  return Math.floor((gameTimeMs - offsetMs) / interval);
}

export function nextBeatTimeMs(gameTimeMs: number, bpm: number, offsetMs = 0): number {
  const interval = beatIntervalMs(bpm);
  const idx = Math.ceil((gameTimeMs - offsetMs) / interval);
  return offsetMs + idx * interval;
}

export interface TimelineSyncSnapshot {
  gameTimeMs: number;
  calibratedMs: number;
  beatIndex: number;
  nextBeatMs: number;
  progress: number;
}

export function buildTimelineSync(
  beatmap: Pick<Beatmap, 'bpm' | 'offsetMs' | 'durationMs'>,
  rawElapsedMs: number,
  calibrationOffsetMs: number,
): TimelineSyncSnapshot {
  const calibratedMs = calibratedGameTimeMs(rawElapsedMs, calibrationOffsetMs);
  const offset = beatmap.offsetMs || 0;
  return {
    gameTimeMs: rawElapsedMs,
    calibratedMs,
    beatIndex: beatIndexAt(calibratedMs, beatmap.bpm, offset),
    nextBeatMs: nextBeatTimeMs(calibratedMs, beatmap.bpm, offset),
    progress: Math.min(1, Math.max(0, calibratedMs / Math.max(1, beatmap.durationMs))),
  };
}

export function findNearestNote(
  notes: BeatmapNote[],
  gameTimeMs: number,
  windowMs = 150,
  role?: BeatmapNote['role'],
): BeatmapNote | null {
  let best: BeatmapNote | null = null;
  let bestDelta = Infinity;
  for (const note of notes) {
    if (role && note.role !== role) continue;
    const delta = Math.abs(note.timeMs - gameTimeMs);
    if (delta <= windowMs && delta < bestDelta) {
      best = note;
      bestDelta = delta;
    }
  }
  return best;
}

export function findActiveVocalPrompt(
  prompts: VocalPrompt[],
  gameTimeMs: number,
  leadInMs = 500,
): VocalPrompt | null {
  return (
    prompts.find(
      (p) => gameTimeMs >= p.timeMs - leadInMs && gameTimeMs <= p.timeMs + p.durationMs,
    ) ?? null
  );
}

export function findNearestHypeEvent(
  events: HypeEvent[],
  gameTimeMs: number,
  windowMs = 300,
): HypeEvent | null {
  let best: HypeEvent | null = null;
  let bestDelta = Infinity;
  for (const event of events) {
    const delta = Math.abs(event.timeMs - gameTimeMs);
    if (delta <= windowMs && delta < bestDelta) {
      best = event;
      bestDelta = delta;
    }
  }
  return best;
}
