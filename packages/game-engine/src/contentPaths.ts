/**
 * Legal content paths — Beta digital.
 * Royalty-free / public-domain / synthetic / licensed pack / creator attestation /
 * link→catalog matching. Never platform ripping or DRM bypass.
 */

import type {
  CatalogLicense,
  ContentPathKind,
  LinkResolveResult,
  PlaybackStatus,
  RightsAttestation,
  SongCatalogEntry,
} from '@beatlink/shared';
import { emitTelemetry } from '@beatlink/shared';
import {
  createRightsAttestation,
  gateMusicSource,
  playbackStatusForAttestation,
  refreshAttestationStatus,
  UnsupportedSourceError,
} from './rights.js';

export interface ContentPathDecision {
  path: ContentPathKind;
  ok: boolean;
  playbackStatus: PlaybackStatus;
  analysisEligible: boolean;
  karaokeEligible: boolean;
  message: string;
  matchedCatalogId: string | null;
  attestation: RightsAttestation | null;
}

const ANALYSIS_OK_LICENSES: CatalogLicense[] = [
  'royalty_free',
  'public_domain',
  'synthetic_original',
  'demo_generated',
  'licensed_pack',
  'creative_commons',
  'creator_owned',
];

export function contentPathFromLicense(license: CatalogLicense): ContentPathKind {
  switch (license) {
    case 'royalty_free':
      return 'royalty_free';
    case 'public_domain':
      return 'public_domain';
    case 'synthetic_original':
      return 'synthetic_original';
    case 'demo_generated':
      return 'demo_generated';
    case 'licensed_pack':
      return 'licensed_pack';
    case 'creative_commons':
      return 'creative_commons';
    case 'creator_owned':
      return 'creator_owned';
    default:
      return 'blocked_rip_attempt';
  }
}

/**
 * Resolve a legal playback/analysis path.
 * claimedRipUrl always blocks — no ripping / DRM bypass.
 */
export function resolveContentPath(input: {
  catalogEntry?: SongCatalogEntry | null;
  attestation?: RightsAttestation | null;
  linkResolve?: LinkResolveResult | null;
  /** Creator upload attestation request. */
  creatorUpload?: {
    trackId: string;
    attestorId: string;
    ownsOrLicensed: boolean;
    nowMs?: number;
    ttlMs?: number | null;
  };
  claimedRipUrl?: string | null;
  nowMs?: number;
}): ContentPathDecision {
  if (input.claimedRipUrl) {
    const decision: ContentPathDecision = {
      path: 'blocked_rip_attempt',
      ok: false,
      playbackStatus: 'UNSUPPORTED',
      analysisEligible: false,
      karaokeEligible: false,
      message: 'Platform ripping and DRM bypass are never allowed.',
      matchedCatalogId: null,
      attestation: null,
    };
    emitTelemetry('content_path', 'RIGHTS', {
      path: decision.path,
      ok: false,
    });
    return decision;
  }

  if (input.creatorUpload) {
    const att = createRightsAttestation({
      trackId: input.creatorUpload.trackId,
      attestorId: input.creatorUpload.attestorId,
      ownsOrLicensed: input.creatorUpload.ownsOrLicensed,
      sourceKind: 'user_upload',
      ttlMs: input.creatorUpload.ttlMs,
      nowMs: input.creatorUpload.nowMs ?? input.nowMs,
      notes: 'Creator upload attestation — Beta digital',
    });
    const status = refreshAttestationStatus(att.trackId, input.nowMs ?? Date.now());
    const ok = status === 'attested';
    const decision: ContentPathDecision = {
      path: 'creator_upload_attested',
      ok,
      playbackStatus: playbackStatusForAttestation(status),
      analysisEligible: ok,
      karaokeEligible: ok,
      message: ok
        ? 'Creator-attested upload eligible for analysis/karaoke (no platform rip).'
        : `Creator attestation not playable (${status}).`,
      matchedCatalogId: null,
      attestation: att,
    };
    emitTelemetry('content_path', 'RIGHTS', { path: decision.path, ok });
    emitTelemetry('rights_attestation', 'RIGHTS', { status, ok });
    return decision;
  }

  if (input.linkResolve?.matchedCatalogId && input.catalogEntry) {
    const gated = gateMusicSource({
      catalogEntry: input.catalogEntry,
      nowMs: input.nowMs,
    });
    const path: ContentPathKind = 'link_catalog_match';
    const decision: ContentPathDecision = {
      path,
      ok: gated.ok,
      playbackStatus: gated.playbackStatus,
      analysisEligible: gated.ok && ANALYSIS_OK_LICENSES.includes(input.catalogEntry.license),
      karaokeEligible: gated.ok,
      message: gated.ok
        ? `Link matched catalog ${input.catalogEntry.id} — play approved catalog audio only.`
        : 'Link matched catalog but gate rejected source.',
      matchedCatalogId: input.catalogEntry.id,
      attestation: null,
    };
    emitTelemetry('content_path', 'RIGHTS', { path, ok: decision.ok });
    return decision;
  }

  if (input.linkResolve && !input.linkResolve.matchedCatalogId) {
    const decision: ContentPathDecision = {
      path: 'blocked_rip_attempt',
      ok: false,
      playbackStatus: input.linkResolve.playbackStatus ?? 'METADATA_ONLY',
      analysisEligible: false,
      karaokeEligible: false,
      message:
        'Metadata-only link — no playback without catalog match, licensed pack, or attested upload.',
      matchedCatalogId: null,
      attestation: null,
    };
    emitTelemetry('content_path', 'RIGHTS', { path: decision.path, ok: false });
    return decision;
  }

  if (input.catalogEntry) {
    const gated = gateMusicSource({
      catalogEntry: input.catalogEntry,
      attestation: input.attestation,
      nowMs: input.nowMs,
    });
    const path = contentPathFromLicense(input.catalogEntry.license);
    const decision: ContentPathDecision = {
      path,
      ok: gated.ok,
      playbackStatus: gated.playbackStatus,
      analysisEligible: gated.ok && ANALYSIS_OK_LICENSES.includes(input.catalogEntry.license),
      karaokeEligible: gated.ok,
      message: gated.ok
        ? `Catalog path ${path} eligible.`
        : gated.ok === false
          ? gated.error.message
          : 'Catalog gate failed',
      matchedCatalogId: input.catalogEntry.id,
      attestation: input.attestation ?? null,
    };
    emitTelemetry('content_path', 'RIGHTS', { path, ok: decision.ok });
    return decision;
  }

  if (input.attestation) {
    const gated = gateMusicSource({
      attestation: input.attestation,
      nowMs: input.nowMs,
    });
    const decision: ContentPathDecision = {
      path: 'creator_upload_attested',
      ok: gated.ok,
      playbackStatus: gated.playbackStatus,
      analysisEligible: gated.ok,
      karaokeEligible: gated.ok,
      message: gated.ok ? 'Attested upload eligible.' : 'Attestation not playable.',
      matchedCatalogId: null,
      attestation: input.attestation,
    };
    emitTelemetry('content_path', 'RIGHTS', { path: decision.path, ok: decision.ok });
    return decision;
  }

  const error = new UnsupportedSourceError('No legal content path resolved.');
  return {
    path: 'blocked_rip_attempt',
    ok: false,
    playbackStatus: error.playbackStatus,
    analysisEligible: false,
    karaokeEligible: false,
    message: error.message,
    matchedCatalogId: null,
    attestation: null,
  };
}

/** Gate analysis/karaoke callers — only synthetic/PD/RF/licensed/attested. */
export function assertAnalysisKaraokeEligible(decision: ContentPathDecision): {
  ok: boolean;
  reason: string;
} {
  if (!decision.ok) return { ok: false, reason: decision.message };
  if (!decision.analysisEligible) {
    return { ok: false, reason: 'Analysis not eligible for this content path.' };
  }
  if (decision.path === 'blocked_rip_attempt') {
    return { ok: false, reason: 'Rip attempts cannot enter analysis/karaoke.' };
  }
  return { ok: true, reason: 'Eligible rights-cleared path.' };
}

/**
 * Source eligibility router letters A–F (MUSIC_COMPLIANCE).
 * Link recognition alone is never full gameplay — unsupported links get catalog alternatives.
 */
export type SourceEligibilityLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface SourceEligibilityAlternative {
  songId: string;
  title: string;
  reason: string;
}

export interface SourceEligibilityRoute {
  letter: SourceEligibilityLetter;
  label: string;
  ok: boolean;
  /** True only when catalog / attested audio can drive a real performance. */
  playable: boolean;
  decision: ContentPathDecision;
  alternatives: SourceEligibilityAlternative[];
  message: string;
}

const LETTER_LABEL: Record<SourceEligibilityLetter, string> = {
  A: 'Approved catalog (PD / RF / synthetic / demo / CC)',
  B: 'Creator-attested upload',
  C: 'Licensed music pack',
  D: 'Link matched to approved catalog (play catalog audio only)',
  E: 'Platform metadata / official embed reference (not gameplay stream)',
  F: 'Unsupported or blocked — offer lawful catalog alternatives',
};

function letterForPath(path: ContentPathKind, playbackStatus: PlaybackStatus): SourceEligibilityLetter {
  switch (path) {
    case 'royalty_free':
    case 'public_domain':
    case 'synthetic_original':
    case 'demo_generated':
    case 'creative_commons':
      return 'A';
    case 'creator_owned':
    case 'creator_upload_attested':
      return 'B';
    case 'licensed_pack':
      return 'C';
    case 'link_catalog_match':
      return 'D';
    case 'blocked_rip_attempt':
      return playbackStatus === 'METADATA_ONLY' || playbackStatus === 'NEEDS_LICENSE'
        ? 'E'
        : 'F';
    default:
      return 'F';
  }
}

export function resolveSourceEligibilityRouter(input: {
  catalogEntry?: SongCatalogEntry | null;
  attestation?: RightsAttestation | null;
  linkResolve?: LinkResolveResult | null;
  creatorUpload?: {
    trackId: string;
    attestorId: string;
    ownsOrLicensed: boolean;
    nowMs?: number;
    ttlMs?: number | null;
  };
  claimedRipUrl?: string | null;
  nowMs?: number;
  /** Lawful catalog alternatives when the selected path is not playable. */
  catalogAlternatives?: SongCatalogEntry[];
}): SourceEligibilityRoute {
  const decision = resolveContentPath(input);
  let letter = letterForPath(decision.path, decision.playbackStatus);
  // METADATA_ONLY platform links without a catalog match are path E, not playable.
  if (
    input.linkResolve &&
    !input.linkResolve.matchedCatalogId &&
    (input.linkResolve.playbackStatus === 'METADATA_ONLY' ||
      input.linkResolve.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM')
  ) {
    letter = 'E';
  }
  const playable =
    decision.ok &&
    (decision.playbackStatus === 'PLAYABLE_APPROVED' ||
      decision.playbackStatus === 'PLAYABLE_AUTHORIZED_PLATFORM') &&
    letter !== 'E' &&
    letter !== 'F';
  const alternatives: SourceEligibilityAlternative[] = [];
  if (!playable && input.catalogAlternatives?.length) {
    for (const song of input.catalogAlternatives.slice(0, 5)) {
      if (
        song.license === 'demo_generated' ||
        song.license === 'synthetic_original' ||
        song.license === 'public_domain' ||
        song.license === 'royalty_free' ||
        song.license === 'creative_commons'
      ) {
        alternatives.push({
          songId: song.id,
          title: song.title,
          reason: 'Lawful approved-catalog alternative — not a rip of the pasted link.',
        });
      }
    }
  }
  if (!playable && letter !== 'E') {
    letter = letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D' ? letter : 'F';
  }
  const route: SourceEligibilityRoute = {
    letter,
    label: LETTER_LABEL[letter],
    ok: decision.ok,
    playable,
    decision,
    alternatives,
    message: playable
      ? decision.message
      : `${decision.message} Link recognition alone is not gameplay — choose a catalog alternative.`,
  };
  emitTelemetry('source_eligibility_router', 'RIGHTS', {
    letter: route.letter,
    playable: route.playable,
    altCount: route.alternatives.length,
  });
  return route;
}
