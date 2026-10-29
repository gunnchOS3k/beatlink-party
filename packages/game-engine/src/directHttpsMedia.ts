/**
 * Authorized direct HTTPS media path — preferred full-gameplay route.
 * WAV / MP3 / OGG only. Requires rights eligibility, content hash, beat grid, charts.
 * GAMEPLAY_SYNC_AUTHORIZED requires rights.syncEligible (not rights.ok alone).
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

/** Default: refuse automatic redirects (open-redirect / host-swap abuse). */
export const DIRECT_HTTPS_MAX_REDIRECTS = 0;

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
  /** Composition + recording reproduction cleared (playback path). */
  rightsOk: boolean;
  /** Sync overlays authorized — required for GAMEPLAY_SYNC_AUTHORIZED. */
  syncEligible: boolean;
  capabilityState: LinkCapabilityState;
  mediaClassification: LinkMediaClassification;
  analysisEligible: boolean;
  message: string;
  blockers: string[];
}

export interface DirectHttpsUrlPolicyResult {
  ok: boolean;
  urlOk: boolean;
  formatOk: boolean;
  blockers: string[];
  normalizedUrl: string | null;
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
 * Static URL / redirect policy for direct HTTPS media.
 * Blocks credentials-in-URL, non-https, and non-audio path extensions.
 * Callers that fetch MUST use maxRedirects=0 (or probeDirectHttpsMedia).
 */
export function validateDirectHttpsUrlPolicy(
  raw: string,
  mimeType?: string | null,
): DirectHttpsUrlPolicyResult {
  const blockers: string[] = [];
  let normalizedUrl: string | null = null;
  let urlOk = false;
  let formatOk = false;

  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') {
      blockers.push('Only https:// media URLs are accepted (no http, no data:, no blob:).');
    } else if (u.username || u.password) {
      blockers.push('Credentials in URL are rejected.');
    } else if (u.hash) {
      blockers.push('URL fragments are not part of the media identity — strip #… before evaluate.');
    } else {
      urlOk = true;
      normalizedUrl = u.toString();
    }
    formatOk = isDirectAudioFormat(raw, mimeType);
    if (!formatOk) blockers.push('Format must be WAV, MP3, or OGG.');
  } catch {
    blockers.push('Only https:// media URLs are accepted (no http, no data:, no blob:).');
  }

  return { ok: urlOk && formatOk && blockers.length === 0, urlOk, formatOk, blockers, normalizedUrl };
}

export interface DirectHttpsProbeResult {
  ok: boolean;
  finalUrl: string | null;
  status: number | null;
  mimeType: string | null;
  redirected: boolean;
  blockers: string[];
}

/**
 * HEAD/GET probe with redirect refusal (default maxRedirects=0).
 * Never follows open redirects to a different host or non-audio path.
 */
export async function probeDirectHttpsMedia(
  rawUrl: string,
  opts?: {
    maxRedirects?: number;
    fetchImpl?: typeof fetch;
    method?: 'HEAD' | 'GET';
  },
): Promise<DirectHttpsProbeResult> {
  const maxRedirects = opts?.maxRedirects ?? DIRECT_HTTPS_MAX_REDIRECTS;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  const method = opts?.method ?? 'HEAD';
  const policy = validateDirectHttpsUrlPolicy(rawUrl);
  if (!policy.ok || !policy.normalizedUrl) {
    return {
      ok: false,
      finalUrl: null,
      status: null,
      mimeType: null,
      redirected: false,
      blockers: policy.blockers,
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      finalUrl: null,
      status: null,
      mimeType: null,
      redirected: false,
      blockers: ['fetch unavailable for direct HTTPS probe.'],
    };
  }

  try {
    const res = await fetchImpl(policy.normalizedUrl, {
      method,
      redirect: maxRedirects === 0 ? 'error' : 'manual',
      headers: { Accept: 'audio/*,application/ogg' },
    });

    const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
    const formatOk = isDirectAudioFormat(policy.normalizedUrl, mimeType);
    const blockers: string[] = [];
    if (!res.ok) blockers.push(`Probe HTTP ${res.status}.`);
    if (!formatOk) blockers.push('Probed MIME/path is not WAV/MP3/OGG.');

    return {
      ok: blockers.length === 0,
      finalUrl: policy.normalizedUrl,
      status: res.status,
      mimeType,
      redirected: false,
      blockers,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const redirected = /redirect/i.test(msg);
    return {
      ok: false,
      finalUrl: null,
      status: null,
      mimeType: null,
      redirected,
      blockers: [
        redirected
          ? `Redirect refused (maxRedirects=${maxRedirects}). Direct HTTPS media must not hop hosts.`
          : `Probe failed: ${msg}`,
      ],
    };
  }
}

/**
 * Evaluate a direct HTTPS media candidate for BeatLink gameplay eligibility.
 * Does not fetch or decode audio — rights + hash + grid/charts are caller-supplied.
 * Playback may be rights.ok; gameplay sync requires rights.syncEligible.
 */
export function evaluateDirectHttpsMedia(input: DirectHttpsMediaInput): DirectHttpsMediaDecision {
  const blockers: string[] = [];

  if (detectRipIntent(input.ripIntentSignals ?? [input.url])) {
    blockers.push('Rip / DRM / extract intent rejected.');
  }

  const policy = validateDirectHttpsUrlPolicy(input.url, input.mimeType);
  const urlOk = policy.urlOk;
  const formatOk = policy.formatOk;
  for (const b of policy.blockers) {
    if (!blockers.includes(b)) blockers.push(b);
  }

  const hashPresent = Boolean(input.contentSha256 && /^[a-f0-9]{64}$/i.test(input.contentSha256));
  if (!hashPresent) blockers.push('SHA-256 content hash required for integrity.');

  const rights = assessRightsLayers({
    composition: input.composition,
    soundRecording: input.soundRecording,
  });
  if (!rights.ok) {
    blockers.push(...rights.findings.filter((f) => f.severity === 'block').map((f) => f.message));
  }
  if (rights.ok && !rights.syncEligible) {
    blockers.push(
      'Playback rights cleared but syncEligible=false — composition sync/adaptation not authorized for gameplay.',
    );
  }

  const playbackCleared = rights.ok && hashPresent && urlOk && formatOk;
  // Incomplete attestation / rip / bad URL — not a silent metadata elevation.
  const hardBlocked =
    blockers.some((b) => /rip|drm|extract/i.test(b)) ||
    !urlOk ||
    !formatOk ||
    !rights.ok ||
    !hashPresent;

  // PRIORITY: GAMEPLAY_SYNC_AUTHORIZED requires syncEligible, not rights.ok alone.
  const gridAndCharts = input.beatGridReady && input.chartsReady;

  const capabilityState = resolveLinkCapability({
    platform: 'direct_https',
    hasMetadata: true,
    officialEmbedPossible: false,
    catalogMatched: false,
    directAudioRightsVerified: playbackCleared && !hardBlocked,
    beatGridAndChartsReady: gridAndCharts && rights.syncEligible,
    blocked: hardBlocked,
    unsupported: !urlOk,
  });

  // Belt-and-suspenders: never emit GAMEPLAY_SYNC without syncEligible.
  const finalState =
    capabilityState === 'GAMEPLAY_SYNC_AUTHORIZED' && !rights.syncEligible
      ? 'DIRECT_AUDIO_RIGHTS_VERIFIED'
      : capabilityState;

  const analysisEligible =
    finalState === 'GAMEPLAY_SYNC_AUTHORIZED' || finalState === 'DIRECT_AUDIO_RIGHTS_VERIFIED';

  let message: string;
  if (finalState === 'GAMEPLAY_SYNC_AUTHORIZED') {
    message =
      'Direct HTTPS media: syncEligible + hash + beat grid + charts — gameplay sync authorized.';
  } else if (finalState === 'DIRECT_AUDIO_RIGHTS_VERIFIED') {
    message = rights.syncEligible
      ? 'Direct HTTPS media: composition + sound-recording rights verified with hash. Provide beat grid and charts for gameplay sync.'
      : 'Direct HTTPS media: playback rights verified with hash, but syncEligible=false — gameplay sync denied until composition sync/adaptation is explicitly authorized.';
  } else {
    message = `Direct HTTPS media not gameplay-ready: ${blockers.join(' ') || 'incomplete eligibility.'}`;
  }

  return {
    ok: finalState === 'GAMEPLAY_SYNC_AUTHORIZED' || finalState === 'DIRECT_AUDIO_RIGHTS_VERIFIED',
    urlOk,
    formatOk,
    hashPresent,
    rightsOk: rights.ok,
    syncEligible: rights.syncEligible,
    capabilityState: finalState,
    mediaClassification:
      finalState === 'GAMEPLAY_SYNC_AUTHORIZED' || finalState === 'DIRECT_AUDIO_RIGHTS_VERIFIED'
        ? 'playable_audio'
        : finalState === 'BLOCKED_OR_UNSUPPORTED'
          ? 'blocked'
          : 'metadata_only',
    analysisEligible,
    message,
    blockers,
  };
}
