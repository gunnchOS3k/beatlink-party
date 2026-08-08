/**
 * Offline legal launch catalog gates — PD / original / CC / creator-owned.
 * Never platform ripping or DRM bypass.
 * Browser-safe: callers load JSON (tests/server); this module only asserts.
 */

import {
  GAME_MODE_IDS,
  type CatalogLicense,
  type DifficultyId,
  type GameModeId,
  type SongCatalogEntry,
} from '@beatlink/shared';
import { resolveContentPath, assertAnalysisKaraokeEligible } from './contentPaths.js';
import { assertModesBetaDepth } from './modes/index.js';

const LAUNCH_LICENSES: CatalogLicense[] = [
  'public_domain',
  'synthetic_original',
  'creative_commons',
  'creator_owned',
];

const ALL_DIFFICULTIES: DifficultyId[] = ['beginner', 'casual', 'pro', 'nightmare'];

export const OFFLINE_LAUNCH_CATALOG_RELATIVE = 'content/songs/offline-launch-catalog.json';

export function assertOfflineLaunchCatalogComplete(songs: SongCatalogEntry[]): {
  complete: boolean;
  failures: string[];
  modesCovered: GameModeId[];
  licensesPresent: CatalogLicense[];
  token: 'BEATLINK_BETA_CONTENT_COMPLETE_DIGITAL' | 'BEATLINK_BETA_CONTENT_INCOMPLETE';
} {
  const failures: string[] = [];
  const modesCovered = new Set<GameModeId>();
  const licensesPresent = new Set<CatalogLicense>();

  if (songs.length === 0) failures.push('catalog_empty');

  for (const song of songs) {
    if (!song.launchEligible) failures.push(`${song.id}:not_launch_eligible`);
    if (!LAUNCH_LICENSES.includes(song.license)) {
      failures.push(`${song.id}:license_not_launch_legal:${song.license}`);
    }
    licensesPresent.add(song.license);
    if (!song.rights?.ripForbidden || !song.rights?.drmBypassForbidden) {
      failures.push(`${song.id}:missing_rights_forbidden_flags`);
    }
    if (!song.rights?.attribution) failures.push(`${song.id}:missing_attribution`);
    if (!song.chart?.beatmapId) failures.push(`${song.id}:missing_chart`);
    if (!song.karaokeMeta?.noRecording) failures.push(`${song.id}:karaoke_must_no_record`);
    if (!song.karaokeMeta?.prompts?.length) failures.push(`${song.id}:karaoke_prompts`);
    if (song.analysisEligible !== true) failures.push(`${song.id}:analysis_not_eligible`);

    const diffs = song.difficulties ?? song.chart?.difficulties ?? [];
    for (const d of ALL_DIFFICULTIES) {
      if (!diffs.includes(d)) failures.push(`${song.id}:missing_difficulty_${d}`);
    }

    const modes = song.modes ?? [];
    if (modes.length === 0) failures.push(`${song.id}:no_modes`);
    for (const m of modes) modesCovered.add(m);

    const decision = resolveContentPath({ catalogEntry: song });
    if (!decision.ok) failures.push(`${song.id}:content_path_blocked`);
    const karaoke = assertAnalysisKaraokeEligible(decision);
    if (!karaoke.ok) failures.push(`${song.id}:karaoke_ineligible`);

    const rip = resolveContentPath({
      catalogEntry: song,
      claimedRipUrl: 'https://youtube.com/watch?v=rip',
    });
    if (rip.ok || rip.path !== 'blocked_rip_attempt') {
      failures.push(`${song.id}:rip_not_blocked`);
    }
  }

  for (const mode of GAME_MODE_IDS) {
    if (!modesCovered.has(mode)) failures.push(`mode_uncovered:${mode}`);
  }

  for (const required of [
    'public_domain',
    'synthetic_original',
    'creative_commons',
    'creator_owned',
  ] as const) {
    if (![...licensesPresent].includes(required)) {
      failures.push(`license_family_missing:${required}`);
    }
  }

  const modeDepth = assertModesBetaDepth();
  if (!modeDepth.complete) {
    for (const f of modeDepth.failures) failures.push(`mode_depth:${f}`);
  }

  const complete = failures.length === 0;
  return {
    complete,
    failures,
    modesCovered: [...modesCovered],
    licensesPresent: [...licensesPresent],
    token: complete
      ? 'BEATLINK_BETA_CONTENT_COMPLETE_DIGITAL'
      : 'BEATLINK_BETA_CONTENT_INCOMPLETE',
  };
}
