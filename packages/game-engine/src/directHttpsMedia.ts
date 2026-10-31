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

/** Hard ceiling for direct-HTTPS media bytes (probe Content-Length + local validate). */
export const DIRECT_HTTPS_MAX_BYTES = 12 * 1024 * 1024; // 12 MiB
export const DIRECT_HTTPS_MIN_BYTES = 256;

/**
 * Normalize hostname / IP literals for destination policy.
 * Strips surrounding brackets so `[fc00::1]` is checked the same as `fc00::1`.
 */
export function normalizeDirectHttpsHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  // Collapse IPv4-mapped IPv6 (:ffff:a.b.c.d) to the embedded IPv4 for RFC1918 checks.
  const v4Mapped = host.match(/^:?:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4Mapped?.[1]) return v4Mapped[1];
  return host;
}

/** True when an IPv6 literal is loopback, link-local, or unique-local (ULA). */
export function isBlockedIpv6Literal(host: string): boolean {
  const h = normalizeDirectHttpsHostname(host);
  if (!h.includes(':')) return false;
  if (h === '::' || h === '::1' || h === '0:0:0:0:0:0:0:0' || h === '0:0:0:0:0:0:0:1') {
    return true;
  }
  // Expand leading compression enough to inspect the first hextet.
  const first = (h.startsWith('::') ? h.slice(2) : h).split(':')[0] ?? '';
  if (!/^[0-9a-f]{1,4}$/i.test(first) && first !== '') {
    // Still treat well-known private prefixes even when compression is odd.
    if (/^(fc|fd)/i.test(h) || /^fe80:/i.test(h)) return true;
    return /^(fc|fd)/i.test(first) || /^fe80$/i.test(first);
  }
  const hextet = Number.parseInt(first || '0', 16);
  // fe80::/10 link-local; fc00::/7 unique-local (fc/fd).
  if ((hextet & 0xffc0) === 0xfe80) return true;
  if ((hextet & 0xfe00) === 0xfc00) return true;
  return false;
}

/**
 * Block loopback / link-local / RFC1918 / metadata hostnames and IP literals.
 * Literal IP checks cover common SSRF shapes; hostname labels cover localhost/.local.
 * Callers that resolve DNS must re-check every resolved address before fetch.
 */
export function isBlockedDirectHttpsDestination(hostname: string): boolean {
  const host = normalizeDirectHttpsHostname(hostname);
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === 'localhost.localdomain' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal' ||
    host === 'metadata' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1'
  ) {
    return true;
  }

  // IPv4 literal (also handles :port stripped by URL.hostname)
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map((n) => Number(n));
    if (octets.some((n) => n > 255)) return true;
    const [a, b] = octets as [number, number, number, number];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / shared address space
    return false;
  }

  if (host.includes(':')) {
    return isBlockedIpv6Literal(host);
  }

  return false;
}

export type DirectHttpsDnsLookup = (hostname: string) => Promise<string[]>;

export interface DirectHttpsDestinationPinResult {
  ok: boolean;
  hostname: string;
  addresses: string[];
  blockers: string[];
}

/**
 * Resolve hostname and refuse when any returned address is private/blocked.
 * Protects against DNS rebinding between static URL policy and the actual connect.
 */
export async function pinDirectHttpsDestinations(
  hostname: string,
  lookup?: DirectHttpsDnsLookup,
): Promise<DirectHttpsDestinationPinResult> {
  const host = normalizeDirectHttpsHostname(hostname);
  const blockers: string[] = [];
  if (!host) {
    return { ok: false, hostname: host, addresses: [], blockers: ['Empty destination host.'] };
  }
  if (isBlockedDirectHttpsDestination(host)) {
    return {
      ok: false,
      hostname: host,
      addresses: [],
      blockers: [
        'Destination host is blocked (loopback, link-local, private, or metadata). Direct HTTPS must not target internal networks.',
      ],
    };
  }

  // Literal IPs: no DNS; the address is the destination.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return { ok: true, hostname: host, addresses: [host], blockers: [] };
  }

  if (!lookup) {
    // Without an injectable resolver, keep static hostname policy only.
    return { ok: true, hostname: host, addresses: [], blockers: [] };
  }

  let addresses: string[] = [];
  try {
    addresses = await lookup(host);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      hostname: host,
      addresses: [],
      blockers: [`DNS lookup failed: ${msg}`],
    };
  }

  if (!addresses.length) {
    return {
      ok: false,
      hostname: host,
      addresses: [],
      blockers: ['DNS returned no addresses for destination host.'],
    };
  }

  for (const addr of addresses) {
    if (isBlockedDirectHttpsDestination(addr)) {
      blockers.push(
        `Resolved address ${addr} is blocked (private/loopback/link-local/metadata). Refusing connect.`,
      );
    }
  }

  return {
    ok: blockers.length === 0,
    hostname: host,
    addresses,
    blockers,
  };
}

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
  /**
   * Optional absolute expiry for the rights/media attestation (epoch ms).
   * When set and `nowMs` is past it, gameplay/playback attach is refused.
   */
  rightsExpiresAtMs?: number | null;
  /** Evaluation clock — defaults to Date.now() when expiry is checked. */
  nowMs?: number;
  /**
   * Optional raw bytes for magic/size validation before hash trust.
   * When provided, MIME spoof + oversized + invalid container are blockers.
   */
  contentBytes?: Uint8Array | null;
  /** Declared Content-Length (or probe) — oversized refused even without bytes. */
  contentLength?: number | null;
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
    } else if (isBlockedDirectHttpsDestination(u.hostname)) {
      blockers.push(
        'Destination host is blocked (loopback, link-local, private, or metadata). Direct HTTPS must not target internal networks.',
      );
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
  contentLength: number | null;
  redirected: boolean;
  blockers: string[];
}

export type DirectAudioMagicKind = 'wav' | 'mp3' | 'ogg' | 'unknown';

export interface DirectHttpsBytesValidation {
  ok: boolean;
  magic: DirectAudioMagicKind;
  byteLength: number;
  sniffedMime: string | null;
  mimeSpoof: boolean;
  oversized: boolean;
  undersized: boolean;
  blockers: string[];
}

/** Sniff container magic — RIFF/WAVE, ID3/MPEG frame, OggS. */
export function sniffDirectAudioMagic(bytes: Uint8Array): DirectAudioMagicKind {
  if (bytes.byteLength < 4) return 'unknown';
  const b0 = bytes[0]!;
  const b1 = bytes[1]!;
  const b2 = bytes[2]!;
  const b3 = bytes[3]!;
  // RIFF....WAVE
  if (
    b0 === 0x52 &&
    b1 === 0x49 &&
    b2 === 0x46 &&
    b3 === 0x46 &&
    bytes.byteLength >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return 'wav';
  }
  // OggS
  if (b0 === 0x4f && b1 === 0x67 && b2 === 0x67 && b3 === 0x53) return 'ogg';
  // ID3 tag or MPEG frame sync (11 set bits)
  if (b0 === 0x49 && b1 === 0x44 && b2 === 0x33) return 'mp3';
  if (b0 === 0xff && (b1 & 0xe0) === 0xe0) return 'mp3';
  return 'unknown';
}

export function mimeForDirectAudioMagic(magic: DirectAudioMagicKind): string | null {
  switch (magic) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
      return 'audio/ogg';
    default:
      return null;
  }
}

/**
 * Validate media bytes: size ceiling + magic container + declared-MIME spoof detect.
 * Declared text/html (or other non-audio) with audio magic — or audio MIME with unknown
 * magic — is treated as spoof / invalid container.
 */
export function validateDirectHttpsMediaBytes(
  bytes: Uint8Array,
  declaredMime?: string | null,
  opts?: { maxBytes?: number; minBytes?: number },
): DirectHttpsBytesValidation {
  const maxBytes = opts?.maxBytes ?? DIRECT_HTTPS_MAX_BYTES;
  const minBytes = opts?.minBytes ?? DIRECT_HTTPS_MIN_BYTES;
  const blockers: string[] = [];
  const byteLength = bytes.byteLength;
  const oversized = byteLength > maxBytes;
  const undersized = byteLength < minBytes;
  if (oversized) {
    blockers.push(
      `Media exceeds DIRECT_HTTPS_MAX_BYTES (${maxBytes}). Oversized payloads are refused.`,
    );
  }
  if (undersized) {
    blockers.push(`Media below DIRECT_HTTPS_MIN_BYTES (${minBytes}).`);
  }

  const magic = sniffDirectAudioMagic(bytes);
  const sniffedMime = mimeForDirectAudioMagic(magic);
  const declared = (declaredMime ?? '').split(';')[0]?.trim().toLowerCase() || null;
  let mimeSpoof = false;

  if (magic === 'unknown') {
    blockers.push('Media magic is not WAV/MP3/OGG — invalid or spoofed container.');
  }

  if (declared) {
    const declaredAudio = (DIRECT_AUDIO_MIME as readonly string[]).includes(declared);
    if (!declaredAudio) {
      mimeSpoof = true;
      blockers.push(
        `Declared MIME ${declared} is not an allowed audio type (MIME spoof / non-audio).`,
      );
    } else if (sniffedMime) {
      const family = (m: string) =>
        m.includes('wav') || m.includes('wave')
          ? 'wav'
          : m.includes('mpeg') || m.includes('mp3')
            ? 'mp3'
            : m.includes('ogg')
              ? 'ogg'
              : 'other';
      if (family(declared) !== family(sniffedMime) && family(declared) !== 'other') {
        mimeSpoof = true;
        blockers.push(
          `MIME spoof: declared ${declared} but bytes sniff as ${sniffedMime}.`,
        );
      }
    }
  }

  return {
    ok: blockers.length === 0,
    magic,
    byteLength,
    sniffedMime,
    mimeSpoof,
    oversized,
    undersized,
    blockers,
  };
}

/** Refuse when a declared Content-Length exceeds the direct-HTTPS ceiling. */
export function isOversizedDirectHttpsLength(
  contentLength: number | null | undefined,
  maxBytes = DIRECT_HTTPS_MAX_BYTES,
): boolean {
  return typeof contentLength === 'number' && Number.isFinite(contentLength) && contentLength > maxBytes;
}

/**
 * HEAD/GET probe with redirect refusal (default maxRedirects=0).
 * Pins DNS destinations before fetch; never follows open redirects to a
 * different host or private address. Use injectable lookup/fetch doubles in tests.
 */
export async function probeDirectHttpsMedia(
  rawUrl: string,
  opts?: {
    maxRedirects?: number;
    fetchImpl?: typeof fetch;
    method?: 'HEAD' | 'GET';
    /** Injectable DNS resolver — when provided, every returned address is re-checked. */
    dnsLookup?: DirectHttpsDnsLookup;
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
      contentLength: null,
      redirected: false,
      blockers: policy.blockers,
    };
  }

  let hostname: string;
  try {
    hostname = new URL(policy.normalizedUrl).hostname;
  } catch {
    return {
      ok: false,
      finalUrl: null,
      status: null,
      mimeType: null,
      contentLength: null,
      redirected: false,
      blockers: ['Invalid normalized HTTPS URL.'],
    };
  }

  const pin = await pinDirectHttpsDestinations(hostname, opts?.dnsLookup);
  if (!pin.ok) {
    return {
      ok: false,
      finalUrl: null,
      status: null,
      mimeType: null,
      contentLength: null,
      redirected: false,
      blockers: pin.blockers,
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      finalUrl: null,
      status: null,
      mimeType: null,
      contentLength: null,
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

    const blockers: string[] = [];
    // Manual redirect mode: inspect Location and refuse private / host-swap hops.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      blockers.push(
        `Redirect refused (maxRedirects=${maxRedirects}). Direct HTTPS media must not hop hosts.`,
      );
      if (location) {
        try {
          const next = new URL(location, policy.normalizedUrl);
          if (isBlockedDirectHttpsDestination(next.hostname)) {
            blockers.push(
              `Redirect target host ${normalizeDirectHttpsHostname(next.hostname)} is blocked.`,
            );
          }
          const nextPin = await pinDirectHttpsDestinations(next.hostname, opts?.dnsLookup);
          for (const b of nextPin.blockers) {
            if (!blockers.includes(b)) blockers.push(b);
          }
        } catch {
          blockers.push('Redirect Location could not be parsed.');
        }
      }
      return {
        ok: false,
        finalUrl: null,
        status: res.status,
        mimeType: null,
        contentLength: null,
        redirected: true,
        blockers,
      };
    }

    const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
    const lengthHeader = res.headers.get('content-length');
    const contentLength =
      lengthHeader != null && /^\d+$/.test(lengthHeader.trim())
        ? Number.parseInt(lengthHeader.trim(), 10)
        : null;
    const formatOk = isDirectAudioFormat(policy.normalizedUrl, mimeType);
    if (!res.ok) blockers.push(`Probe HTTP ${res.status}.`);
    if (!formatOk) blockers.push('Probed MIME/path is not WAV/MP3/OGG.');
    if (isOversizedDirectHttpsLength(contentLength)) {
      blockers.push(
        `Content-Length ${contentLength} exceeds DIRECT_HTTPS_MAX_BYTES (${DIRECT_HTTPS_MAX_BYTES}). Oversized media refused.`,
      );
    }
    // Declared non-audio Content-Type on an audio-looking path is MIME spoof.
    if (
      mimeType &&
      !(DIRECT_AUDIO_MIME as readonly string[]).includes(mimeType.toLowerCase()) &&
      isDirectAudioFormat(policy.normalizedUrl, null)
    ) {
      blockers.push(
        `MIME spoof: path claims audio but Content-Type is ${mimeType}.`,
      );
    }

    return {
      ok: blockers.length === 0,
      finalUrl: policy.normalizedUrl,
      status: res.status,
      mimeType,
      contentLength,
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
      contentLength: null,
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

  if (isOversizedDirectHttpsLength(input.contentLength ?? null)) {
    blockers.push(
      `Content-Length ${input.contentLength} exceeds DIRECT_HTTPS_MAX_BYTES (${DIRECT_HTTPS_MAX_BYTES}). Oversized media refused.`,
    );
  }

  if (input.contentBytes && input.contentBytes.byteLength > 0) {
    const bytesGate = validateDirectHttpsMediaBytes(input.contentBytes, input.mimeType);
    for (const b of bytesGate.blockers) {
      if (!blockers.includes(b)) blockers.push(b);
    }
  }

  const nowMs = input.nowMs ?? Date.now();
  if (
    typeof input.rightsExpiresAtMs === 'number' &&
    Number.isFinite(input.rightsExpiresAtMs) &&
    nowMs > input.rightsExpiresAtMs
  ) {
    blockers.push('Rights/media attestation expired — direct HTTPS attach refused.');
  }

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

  const bytesOrSizeBlocked = blockers.some((b) =>
    /oversized|mime spoof|magic|DIRECT_HTTPS_MIN_BYTES|DIRECT_HTTPS_MAX_BYTES|expired/i.test(b),
  );
  const playbackCleared = rights.ok && hashPresent && urlOk && formatOk && !bytesOrSizeBlocked;
  // Incomplete attestation / rip / bad URL — not a silent metadata elevation.
  const hardBlocked =
    blockers.some((b) => /rip|drm|extract|expired|mime spoof|oversized|magic/i.test(b)) ||
    !urlOk ||
    !formatOk ||
    !rights.ok ||
    !hashPresent ||
    bytesOrSizeBlocked;

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
