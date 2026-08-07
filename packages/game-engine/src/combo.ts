import { comboFromStreak } from '@beatlink/shared';

export interface ComboState {
  streak: number;
  maxStreak: number;
  combo: number;
}

export function buildComboState(streak: number, maxStreak: number): ComboState {
  return {
    streak,
    maxStreak: Math.max(maxStreak, streak),
    combo: comboFromStreak(streak),
  };
}

export function describeCombo(combo: number): string {
  if (combo >= 4) return `${combo}x MEGA`;
  if (combo >= 3) return `${combo}x SUPER`;
  if (combo >= 2) return `${combo}x`;
  return '1x';
}
