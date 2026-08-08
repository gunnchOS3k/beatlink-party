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
