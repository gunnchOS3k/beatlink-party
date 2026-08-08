/**
 * Localization architecture — Alpha digital.
 * Message catalogs + locale resolution. Not a full translation set;
 * establishes the seam for Beta content localization.
 */

export type LocaleId = 'en' | 'es' | 'ja' | 'pt';

export const SUPPORTED_LOCALES: LocaleId[] = ['en', 'es', 'ja', 'pt'];
export const DEFAULT_LOCALE: LocaleId = 'en';

type MessageCatalog = Record<string, string>;

const EN: MessageCatalog = {
  'app.title': 'BeatLink Party',
  'phase.lobby': 'Lobby',
  'phase.song_select': 'Song select',
  'phase.calibrating': 'Calibrating',
  'phase.countdown': 'Countdown',
  'phase.playing': 'Playing',
  'phase.results': 'Results',
  'phase.closed': 'Closed',
  'mode.BeatTap': 'Beat Tap',
  'mode.CallAndResponse': 'Call & Response',
  'mode.KaraokePerformance': 'Karaoke',
  'mode.BandRoles': 'Band Roles',
  'mode.PredictionTrivia': 'Prediction Trivia',
  'a11y.reduce_motion': 'Reduce motion',
  'a11y.high_contrast': 'High contrast',
  'a11y.large_targets': 'Larger hit targets',
  'a11y.captions': 'Captions',
  'a11y.color_blind': 'Color-blind safe grades',
  'a11y.screen_reader': 'Screen reader phase hints',
  'privacy.redact_names': 'Hide display names',
  'moderation.muted': 'Audience muted',
  'moderation.sandboxed': 'Audience sandboxed',
  'team.A': 'Team A',
  'team.B': 'Team B',
  'team.solo': 'Solo',
  'calibration.prompt': 'Tap with the click to measure latency',
  'error.room_full': 'Room is full',
  'error.auth_failed': 'Authorization failed',
};

const ES: MessageCatalog = {
  ...EN,
  'app.title': 'BeatLink Fiesta',
  'phase.lobby': 'Sala de espera',
  'phase.calibrating': 'Calibrando',
  'phase.playing': 'Jugando',
  'phase.results': 'Resultados',
  'mode.BeatTap': 'Toque de ritmo',
  'mode.KaraokePerformance': 'Karaoke',
  'a11y.reduce_motion': 'Reducir movimiento',
  'a11y.high_contrast': 'Alto contraste',
  'privacy.redact_names': 'Ocultar nombres',
  'team.A': 'Equipo A',
  'team.B': 'Equipo B',
  'calibration.prompt': 'Toca con el clic para medir latencia',
  'error.room_full': 'La sala está llena',
  'error.auth_failed': 'Autorización fallida',
};

const JA: MessageCatalog = {
  ...EN,
  'app.title': 'ビートリンク パーティー',
  'phase.lobby': 'ロビー',
  'phase.calibrating': 'キャリブレーション',
  'phase.playing': 'プレイ中',
  'phase.results': '結果',
  'mode.BeatTap': 'ビートタップ',
  'mode.KaraokePerformance': 'カラオケ',
  'team.A': 'チームA',
  'team.B': 'チームB',
  'error.room_full': 'ルームがいっぱいです',
};

const PT: MessageCatalog = {
  ...EN,
  'app.title': 'BeatLink Festa',
  'phase.lobby': 'Lobby',
  'phase.calibrating': 'Calibrando',
  'phase.playing': 'Jogando',
  'phase.results': 'Resultados',
  'team.A': 'Time A',
  'team.B': 'Time B',
  'error.room_full': 'Sala cheia',
};

const CATALOGS: Record<LocaleId, MessageCatalog> = {
  en: EN,
  es: ES,
  ja: JA,
  pt: PT,
};

const STORAGE_KEY = 'beatlink_locale';

export function isLocaleId(value: string): value is LocaleId {
  return (SUPPORTED_LOCALES as string[]).includes(value);
}

export function resolveLocale(preferred?: string | null): LocaleId {
  if (preferred && isLocaleId(preferred)) return preferred;
  if (typeof navigator !== 'undefined' && navigator.language) {
    const short = navigator.language.slice(0, 2).toLowerCase();
    if (isLocaleId(short)) return short;
  }
  return DEFAULT_LOCALE;
}

export function loadLocale(): LocaleId {
  if (typeof localStorage === 'undefined') return DEFAULT_LOCALE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && isLocaleId(raw) ? raw : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function saveLocale(locale: LocaleId): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, locale);
}

export function t(
  key: string,
  locale: LocaleId = DEFAULT_LOCALE,
  vars?: Record<string, string | number>,
): string {
  const catalog = CATALOGS[locale] ?? EN;
  let text = catalog[key] ?? EN[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export function listMessageKeys(locale: LocaleId = DEFAULT_LOCALE): string[] {
  return Object.keys(CATALOGS[locale] ?? EN).sort();
}
