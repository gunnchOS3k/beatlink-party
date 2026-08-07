import type { VocalPrompt } from '@beatlink/shared';
import { findActiveVocalPrompt } from './timeline.js';

export type KaraokePromptPhase = 'upcoming' | 'active' | 'closing' | 'idle';

export interface KaraokePromptState {
  phase: KaraokePromptPhase;
  prompt: VocalPrompt | null;
  /** 0–1 progress through the active prompt window. */
  progress: number;
  msUntilStart: number | null;
  msRemaining: number | null;
}

/**
 * Structure karaoke round participation without requiring mic pitch detection.
 * Tap / phrase timing uses the prompt window; this helper drives UI timelines.
 */
export function buildKaraokePromptState(
  prompts: VocalPrompt[],
  gameTimeMs: number,
  leadInMs = 800,
): KaraokePromptState {
  const active = findActiveVocalPrompt(prompts, gameTimeMs, leadInMs);
  if (active) {
    const elapsed = gameTimeMs - active.timeMs;
    if (elapsed < 0) {
      return {
        phase: 'upcoming',
        prompt: active,
        progress: 0,
        msUntilStart: -elapsed,
        msRemaining: active.durationMs,
      };
    }
    const progress = Math.min(1, Math.max(0, elapsed / active.durationMs));
    const closing = progress >= 0.85;
    return {
      phase: closing ? 'closing' : 'active',
      prompt: active,
      progress,
      msUntilStart: 0,
      msRemaining: Math.max(0, active.durationMs - elapsed),
    };
  }

  const upcoming = [...prompts]
    .filter((p) => p.timeMs > gameTimeMs)
    .sort((a, b) => a.timeMs - b.timeMs)[0];

  if (upcoming && upcoming.timeMs - gameTimeMs <= leadInMs * 2) {
    return {
      phase: 'upcoming',
      prompt: upcoming,
      progress: 0,
      msUntilStart: upcoming.timeMs - gameTimeMs,
      msRemaining: upcoming.durationMs,
    };
  }

  return {
    phase: 'idle',
    prompt: null,
    progress: 0,
    msUntilStart: upcoming ? upcoming.timeMs - gameTimeMs : null,
    msRemaining: null,
  };
}

export function canSubmitVocalPhrase(state: KaraokePromptState): boolean {
  return state.phase === 'active' || state.phase === 'closing' || state.phase === 'upcoming';
}
