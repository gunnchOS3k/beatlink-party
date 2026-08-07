import type { AccessibilitySettings } from './types.js';
import { DEFAULT_ACCESSIBILITY } from './types.js';

const STORAGE_KEY = 'beatlink_a11y';

export function loadAccessibilitySettings(): AccessibilitySettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_ACCESSIBILITY };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ACCESSIBILITY };
    const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;
    return {
      reduceMotion: Boolean(parsed.reduceMotion),
      highContrast: Boolean(parsed.highContrast),
      largerHitTargets: Boolean(parsed.largerHitTargets),
    };
  } catch {
    return { ...DEFAULT_ACCESSIBILITY };
  }
}

export function saveAccessibilitySettings(settings: AccessibilitySettings): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** CSS class tokens applied to documentElement for a11y prefs. */
export function accessibilityClassList(settings: AccessibilitySettings): string[] {
  const classes: string[] = [];
  if (settings.reduceMotion) classes.push('a11y-reduce-motion');
  if (settings.highContrast) classes.push('a11y-high-contrast');
  if (settings.largerHitTargets) classes.push('a11y-large-targets');
  return classes;
}

export function applyAccessibilityToDocument(settings: AccessibilitySettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const cls of [
    'a11y-reduce-motion',
    'a11y-high-contrast',
    'a11y-large-targets',
  ]) {
    root.classList.remove(cls);
  }
  for (const cls of accessibilityClassList(settings)) {
    root.classList.add(cls);
  }
}
