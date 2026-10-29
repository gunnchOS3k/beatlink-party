/**
 * Creator-owned ingestion stubs + rights checks.
 * Accepts metadata + attestation only — never fetches/rips streaming platforms,
 * never scrapes lyrics, never bypasses DRM, never claims a false license.
 */

import type { CatalogLicense, RightsAttestation, SongCatalogEntry } from '@beatlink/shared';
import {
  createRightsAttestation,
  gateMusicSource,
  markTakedown,
  refreshAttestationStatus,
  UnsupportedSourceError,
} from './rights.js';
import { detectRipIntent, isAllowlistedProviderUrl } from './songSource.js';
import { resolveContentPath, type ContentPathDecision } from './contentPaths.js';

export interface CreatorIngestStubRequest {
  trackId: string;
  title: string;
  artist: string;
  attestorId: string;
  /** Creator must explicitly attest ownership/license. */
  ownsOrLicensed: boolean;
  durationMs?: number;
  bpm?: number;
  /** Optional pitch hint for karaoke DSP — never implies licensed commercial lyrics. */
  pitchHintHz?: number | null;
  /** Forbidden: streaming rip URLs, ytdl paths, DRM bypass signals. */
  claimedSourceUrl?: string | null;
  ripIntentSignals?: string[];
  /** Declared license family — stub rejects commercial false claims. */
  declaredLicense?: CatalogLicense;
  nowMs?: number;
  ttlMs?: number | null;
}

export interface CreatorIngestStubResult {
  ok: boolean;
  status:
    | 'attested_stub'
    | 'rejected_ownership'
    | 'rejected_rip'
    | 'rejected_false_license'
    | 'rejected_drm'
    | 'taken_down';
  decision: ContentPathDecision | null;
  attestation: RightsAttestation | null;
  catalogStub: SongCatalogEntry | null;
  message: string;
  /** Explicit honesty flags for product UI / gates. */
  honesty: {
    ripPerformed: false;
    lyricsScraped: false;
    drmCircumvented: false;
    commercialLicenseClaimed: false;
    audioBinaryStored: false;
  };
}

const FALSE_COMMERCIAL_CLAIM = /spotify|apple.?music|youtube.?music|tidal|deezer|amazon.?music/i;

/**
 * Ingest a creator-attested track stub.
 * Does not download, transcode, or cache third-party audio binaries.
 */
export function ingestCreatorOwnedStub(req: CreatorIngestStubRequest): CreatorIngestStubResult {
  const honesty = {
    ripPerformed: false as const,
    lyricsScraped: false as const,
    drmCircumvented: false as const,
    commercialLicenseClaimed: false as const,
    audioBinaryStored: false as const,
  };

  const signals = [
    ...(req.ripIntentSignals ?? []),
    req.claimedSourceUrl ?? '',
    req.title,
    req.artist,
  ].filter(Boolean);

  if (detectRipIntent(signals) || /drm|widevine|fairplay|bypass/i.test(signals.join(' '))) {
    return {
      ok: false,
      status: /drm|widevine|fairplay|bypass/i.test(signals.join(' '))
        ? 'rejected_drm'
        : 'rejected_rip',
      decision: null,
      attestation: null,
      catalogStub: null,
      message:
        'Rejected: BeatLink never rips streaming platforms, scrapes lyrics, or circumvents DRM.',
      honesty,
    };
  }

  if (req.claimedSourceUrl) {
    // Even allowlisted provider URLs are reference-only — never ingested as binaries.
    if (isAllowlistedProviderUrl(req.claimedSourceUrl) || FALSE_COMMERCIAL_CLAIM.test(req.claimedSourceUrl)) {
      return {
        ok: false,
        status: 'rejected_rip',
        decision: null,
        attestation: null,
        catalogStub: null,
        message:
          'Rejected: platform URLs are metadata/reference only. Upload rights you own; do not paste stream rips.',
        honesty,
      };
    }
    const gated = gateMusicSource({ claimedRipUrl: req.claimedSourceUrl, nowMs: req.nowMs });
    if (!gated.ok) {
      return {
        ok: false,
        status: 'rejected_rip',
        decision: null,
        attestation: null,
        catalogStub: null,
        message: gated.error.message,
        honesty,
      };
    }
  }

  if (
    req.declaredLicense === 'licensed_pack' &&
    !req.ownsOrLicensed
  ) {
    return {
      ok: false,
      status: 'rejected_false_license',
      decision: null,
      attestation: null,
      catalogStub: null,
      message: 'Rejected false license claim — licensed_pack requires ownsOrLicensed attestation.',
      honesty,
    };
  }

  if (FALSE_COMMERCIAL_CLAIM.test(`${req.title} ${req.artist}`) && !req.ownsOrLicensed) {
    return {
      ok: false,
      status: 'rejected_false_license',
      decision: null,
      attestation: null,
      catalogStub: null,
      message:
        'Rejected: titles that look like commercial catalog claims require explicit ownsOrLicensed attestation (still no rip).',
      honesty,
    };
  }

  if (!req.ownsOrLicensed) {
    const decision = resolveContentPath({
      creatorUpload: {
        trackId: req.trackId,
        attestorId: req.attestorId,
        ownsOrLicensed: false,
        nowMs: req.nowMs,
        ttlMs: req.ttlMs,
      },
    });
    return {
      ok: false,
      status: 'rejected_ownership',
      decision,
      attestation: decision.attestation,
      catalogStub: null,
      message: 'Creator must attest ownership or a lawful license before the stub is playable.',
      honesty,
    };
  }

  const decision = resolveContentPath({
    creatorUpload: {
      trackId: req.trackId,
      attestorId: req.attestorId,
      ownsOrLicensed: true,
      nowMs: req.nowMs,
      ttlMs: req.ttlMs ?? 30 * 24 * 60 * 60 * 1000,
    },
  });

  if (!decision.ok || !decision.attestation) {
    return {
      ok: false,
      status: 'rejected_ownership',
      decision,
      attestation: decision.attestation,
      catalogStub: null,
      message: decision.message,
      honesty,
    };
  }

  const license: CatalogLicense = req.declaredLicense === 'creative_commons'
    ? 'creative_commons'
    : req.declaredLicense === 'public_domain'
      ? 'public_domain'
      : 'creator_owned';

  const catalogStub: SongCatalogEntry = {
    id: req.trackId,
    title: req.title,
    artist: req.artist,
    durationMs: req.durationMs ?? 40_000,
    bpm: req.bpm ?? 120,
    beatmapId: `creator-stub-${req.trackId}`,
    license,
    description:
      'Creator-attested ingest stub — metadata + rights only; no third-party audio binary stored.',
    modes: [
      'BeatTap',
      'CallAndResponse',
      'KaraokePerformance',
      'BandRoles',
      'PredictionTrivia',
    ],
    difficulties: ['beginner', 'casual', 'pro', 'nightmare'],
    analysisEligible: true,
    launchEligible: false,
    karaokeMeta: {
      prompts: ['Creator cue!', 'Your phrase!', 'Attested vocal!'],
      noRecording: true,
      pitchHintHz: req.pitchHintHz ?? null,
      language: 'en',
    },
    rights: {
      license,
      attribution: `${req.artist} — creator-attested (attestor ${req.attestorId})`,
      ripForbidden: true,
      drmBypassForbidden: true,
      sourceKind: 'creator_owned',
      ccDeedUrl: license === 'creative_commons' ? 'https://creativecommons.org/publicdomain/zero/1.0/' : null,
    },
  };

  return {
    ok: true,
    status: 'attested_stub',
    decision,
    attestation: decision.attestation,
    catalogStub,
    message:
      'Creator-owned ingest stub accepted. Metadata + attestation only — no streaming rip, no lyric scrape, no DRM bypass, no commercial license claim.',
    honesty,
  };
}

/** Test/admin helper — takedown removes a previously attested stub. */
export function takedownCreatorStub(trackId: string, nowMs = Date.now()): RightsAttestation {
  return markTakedown(trackId, nowMs);
}

export function creatorStubPlaybackAllowed(trackId: string, nowMs = Date.now()): boolean {
  return refreshAttestationStatus(trackId, nowMs) === 'attested';
}

/** Re-export for callers that need a fresh attestation without full ingest. */
export function attestCreatorOwnership(input: {
  trackId: string;
  attestorId: string;
  ownsOrLicensed: boolean;
  nowMs?: number;
}): RightsAttestation {
  if (!input.ownsOrLicensed) {
    throw new UnsupportedSourceError('Ownership not attested.');
  }
  return createRightsAttestation({
    trackId: input.trackId,
    attestorId: input.attestorId,
    ownsOrLicensed: true,
    sourceKind: 'user_upload',
    nowMs: input.nowMs,
    notes: 'Creator ownership attestation stub',
  });
}
