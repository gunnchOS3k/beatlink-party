/**
 * Shared helpers for mode-specific runtime scoring (Call & Response / Prediction Trivia).
 * Rights-safe: operates on beatmap section metadata only — never on ripped audio.
 */
import type { Beatmap, BeatmapSection, DifficultyId } from '@beatlink/shared';
import { getModeDifficultyHooks } from './modes/index.js';

/** Call phase = first half of a section; response = second half. */
export function isCallAndResponseWindow(
  sections: BeatmapSection[],
  gameTimeMs: number,
): { phase: 'call' | 'response' | 'idle'; section: BeatmapSection | null } {
  const section =
    sections.find((s) => gameTimeMs >= s.startMs && gameTimeMs < s.endMs) ?? null;
  if (!section) return { phase: 'idle', section: null };
  const mid = section.startMs + (section.endMs - section.startMs) / 2;
  return {
    phase: gameTimeMs < mid ? 'call' : 'response',
    section,
  };
}

export function responseMatchedForCallAndResponse(
  sections: BeatmapSection[],
  gameTimeMs: number,
  grade: string,
): boolean {
  if (grade === 'miss') return false;
  return isCallAndResponseWindow(sections, gameTimeMs).phase === 'response';
}

/** Next section that has not yet started — the prediction target. */
export function nextPredictionSection(
  sections: BeatmapSection[],
  gameTimeMs: number,
): BeatmapSection | null {
  const upcoming = sections
    .filter((s) => s.startMs > gameTimeMs)
    .sort((a, b) => a.startMs - b.startMs);
  return upcoming[0] ?? null;
}

export function buildPredictionChoices(
  beatmap: Beatmap,
  difficulty: DifficultyId,
  target: BeatmapSection,
): string[] {
  const hooks = getModeDifficultyHooks('PredictionTrivia', difficulty);
  const maxChoices = Math.max(2, hooks.predictionChoices ?? 3);
  const decoys = beatmap.sections
    .filter((s) => s.id !== target.id)
    .map((s) => s.label);
  const pool = [target.label, ...decoys];
  const unique: string[] = [];
  for (const label of pool) {
    if (!unique.includes(label)) unique.push(label);
    if (unique.length >= maxChoices) break;
  }
  // Stable shuffle by section id hash so CI is deterministic per target.
  const seed = target.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return unique
    .map((label, i) => ({ label, key: (seed * 31 + i * 17) % 997 }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.label);
}

export function predictionChoiceCorrect(
  target: BeatmapSection,
  choice: string | undefined,
): boolean {
  if (!choice) return false;
  const normalized = choice.trim().toLowerCase();
  return (
    normalized === target.id.toLowerCase() ||
    normalized === target.label.toLowerCase()
  );
}
