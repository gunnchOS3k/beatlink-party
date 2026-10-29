/**
 * Authorized direct HTTPS media path — preferred full-gameplay route.
 * WAV / MP3 / OGG only. Requires rights eligibility, content hash, beat grid, charts.
 * Never treats platform rip URLs or DRM streams as eligible.
 */

import type { LinkCapabilityState, LinkMediaClassification } from '@beatlink/shared';
import { detectRipIntent } from './songSource.js';
import {
  assessRightsLayers,
  type CompositionRightsClaim,
  type SoundRecordingRightsClaim,
} from './rightsLayers.js';
import { resolveLinkCapability } from './linkCapability.js';

export const DIRECT_AUDIO_EXTENSIONS = ['.wav', '.wave', '.mp3', '.ogg', '.oga'] as const;
export const DIRECT_AUDIO_MIME = [
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'application/ogg',
] as const;

export interface DirectHttpsMediaInput {
  url: string;
  /** Declared MIME when known (upload / HEAD). */
  mimeType?: string | null;
  /** SHA-256 hex of audio bytes (required for rights-verified). */
  contentSha256?: string | null;
  composition: CompositionRightsClaim;
  soundRecording: SoundRecordingRightsClaim;
  /** Beat grid present (offsets / BPM markers). */
  beatGridReady: boolean;
  /** Chart / beatmap version present for scoring. */
  chartsReady: boolean;
  /** Signals that look like rip / DRM / lyric scrape intents. */
  ripIntentSignals?: string[];
}

export interface DirectHttpsMediaDecision {
  ok: boolean;
  urlOk: boolean;
  formatOk: boolean;
  hashPresent: boolean;
  rightsOk: boolean;
  capabilityState: LinkCapabilityState;
  mediaClassification: LinkMediaClassification;
  analysisEligible: boolean;
  message: string;
  blockers: string[];
}

function isHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function extensionOf(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const m = path.match(/(\.[a-z0-9]+)$/);
    return m?.[1] ?? '';
  } catch {
    return '';
  }
}

export function isDirectAudioFormat(url: string, mimeType?: string | null): boolean {
  const ext = extensionOf(url);
  if ((DIRECT_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return true;
  if (mimeType && (DIRECT_AUDIO_MIME as readonly string[]).includes(mimeType.toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * Evaluate a direct HTTPS media candidate for BeatLink gameplay eligibility.
 * Does not fetch or decode audio — rights + hash + grid/charts are caller-supplied.
 */
export function evaluateDirectHttpsMedia(input: DirectHttpsMediaInput): DirectHttpsMediaDecision {
  const blockers: string[] = [];

  if (detectRipIntent(input.ripIntentSignals ?? [input.url])) {
    blockers.push('Rip / DRM / extract intent rejected.');
  }

  const urlOk = isHttpsUrl(input.url);
  if (!urlOk) blockers.push('Only https:// media URLs are accepted (no http, no data:, no blob:).');

  const formatOk = isDirectAudioFormat(input.url, input.mimeType);
  if (!formatOk) blockers.push('Format must be WAV, MP3, or OGG.');

  const hashPresent = Boolean(input.contentSha256 && /^[a-f0-9]{64}$/i.test(input.contentSha256));
  if (!hashPresent) blockers.push('SHA-256 content hash required for integrity.');

  const rights = assessRightsLayers({
    composition: input.composition,
    soundRecording: input.soundRecording,
  });
  if (!rights.ok) {
    blockers.push(...rights.findings.map((f) => f.message));
  }

  const rightsOk = rights.ok && hashPresent && urlOk && formatOk;
  // Incomplete attestation / rip / bad URL — not a silent metadata elevation.
  const hardBlocked =
    blockers.some((b) => /rip|drm|extract/i.test(b)) ||
    !urlOk ||
    !formatOk ||
    !rights.ok ||
    !hashPresent;

  const capabilityState = resolveLinkCapability({
    platform: 'direct_https',
    hasMetadata: true,
    officialEmbedPossible: false,
    catalogMatched: false,
    directAudioRightsVerified: rightsOk && !hardBlocked,
    beatGridAndChartsReady: input.beatGridReady && input.chartsReady,
    blocked: hardBlocked,
    unsupported: !urlOk,
  });

  const analysisEligible =
    capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED' ||
    capabilityState === 'DIRECT_AUDIO_RIGHTS_VERIFIED';

  let message: string;
  if (capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED') {
    message =
      'Direct HTTPS media: rights verified + hash + beat grid + charts — gameplay sync authorized.';
  } else if (capabilityState === 'DIRECT_AUDIO_RIGHTS_VERIFIED') {
    message =
      'Direct HTTPS media: composition + sound-recording rights verified with hash. Provide beat grid and charts for gameplay sync.';
  } else {
    message = `Direct HTTPS media not gameplay-ready: ${blockers.join(' ') || 'incomplete eligibility.'}`;
  }

  return {
    ok: capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED' || capabilityState === 'DIRECT_AUDIO_RIGHTS_VERIFIED',
    urlOk,
    formatOk,
    hashPresent,
    rightsOk: rights.ok,
    capabilityState,
    mediaClassification:
      capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED' || capabilityState === 'DIRECT_AUDIO_RIGHTS_VERIFIED'
        ? 'playable_audio'
        : capabilityState === 'BLOCKED_OR_UNSUPPORTED'
          ? 'blocked'
          : 'metadata_only',
    analysisEligible,
    message,
    blockers,
  };
}
