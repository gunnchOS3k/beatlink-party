import type { TimingGrade } from '@beatlink/shared';
import { TIMING_WINDOWS_MS } from '@beatlink/shared';

export function gradeTiming(deltaMs: number): TimingGrade {
  const abs = Math.abs(deltaMs);
  if (abs <= TIMING_WINDOWS_MS.perfect) return 'perfect';
  if (abs <= TIMING_WINDOWS_MS.great) return 'great';
  if (abs <= TIMING_WINDOWS_MS.good) return 'good';
  return 'miss';
}

export function computeDeltaMs(inputTimeMs: number, targetTimeMs: number): number {
  return inputTimeMs - targetTimeMs;
}

export function isWithinWindow(deltaMs: number, grade: TimingGrade): boolean {
  const abs = Math.abs(deltaMs);
  switch (grade) {
    case 'perfect':
      return abs <= TIMING_WINDOWS_MS.perfect;
    case 'great':
      return abs <= TIMING_WINDOWS_MS.great;
    case 'good':
      return abs <= TIMING_WINDOWS_MS.good;
    default:
      return false;
  }
}
