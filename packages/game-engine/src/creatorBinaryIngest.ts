/**
 * Creator-owned local binary ingest — validation, hash, BPM, chart editor path.
 * Never auto-publishes. Rejects platform URLs / rip / DRM. No lyric scrape.
 */

import type { CatalogLicense, RightsAttestation, SongCatalogEntry } from '@beatlink/shared';
import { analyzeAudio, generateChartFromAnalysis, synthesizeClickTrack } from './audioAnalysis.js';
import {
  canPublishChart,
  openChartEditor,
  type ChartEditorState,
} from './chartEditor.js';
import {
  ingestCreatorOwnedStub,
  type CreatorIngestStubRequest,
  type CreatorIngestStubResult,
} from './creatorIngest.js';
import { detectRipIntent, isAllowlistedProviderUrl } from './songSource.js';

/** Browser-safe SHA-256 (sync) — avoids node:crypto in the shared game-engine package. */
function sha256Hex(bytes: Uint8Array): string {
  // FIPS-180 style compact implementation for asset integrity records.
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const withPad = new Uint8Array(((bytes.length + 9 + 63) & ~63));
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 4, bitLen >>> 0, false);
  view.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000), false);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < withPad.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15]!, 7) ^ rotr(w[j - 15]!, 18) ^ (w[j - 15]! >>> 3);
      const s1 = rotr(w[j - 2]!, 17) ^ rotr(w[j - 2]!, 19) ^ (w[j - 2]! >>> 10);
      w[j] = (w[j - 16]! + s0 + w[j - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e!, 6) ^ rotr(e!, 11) ^ rotr(e!, 25);
      const ch = (e! & f!) ^ (~e! & g!);
      const t1 = (h! + S1 + ch + K[j]! + w[j]!) >>> 0;
      const S0 = rotr(a!, 2) ^ rotr(a!, 13) ^ rotr(a!, 22);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a!) >>> 0;
    H[1] = (H[1]! + b!) >>> 0;
    H[2] = (H[2]! + c!) >>> 0;
    H[3] = (H[3]! + d!) >>> 0;
    H[4] = (H[4]! + e!) >>> 0;
    H[5] = (H[5]! + f!) >>> 0;
    H[6] = (H[6]! + g!) >>> 0;
    H[7] = (H[7]! + h!) >>> 0;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}

export const CREATOR_BINARY_MAX_BYTES = 12 * 1024 * 1024; // 12 MiB local cap
export const CREATOR_BINARY_MIN_BYTES = 256;
/** WAV PCM16 mono/stereo only for v1 local path. */
export const CREATOR_ALLOWED_MIME = ['audio/wav', 'audio/wave', 'audio/x-wav'] as const;

export interface CreatorBinaryIngestRequest extends CreatorIngestStubRequest {
  /** Raw WAV bytes the creator owns. Never a platform download. */
  audioBytes: Uint8Array;
  mimeType?: string;
  /** Explicit ack that binary must not auto-publish to the launch catalog. */
  acknowledgeNoAutoPublish: boolean;
}

export interface ParsedWavPcm {
  sampleRate: number;
  channels: number;
  samples: Float32Array;
  durationMs: number;
}

export interface CreatorBinaryIngestResult {
  ok: boolean;
  status:
    | 'binary_validated'
    | 'rejected_ownership'
    | 'rejected_rip'
    | 'rejected_drm'
    | 'rejected_false_license'
    | 'rejected_format'
    | 'rejected_size'
    | 'rejected_auto_publish'
    | 'review_required'
    | 'taken_down';
  attestation: RightsAttestation | null;
  catalogDraft: SongCatalogEntry | null;
  /** Chart editor state — publish only after explicit review ack. */
  chartEditor: ChartEditorState | null;
  sha256: string | null;
  bpmEstimate: number | null;
  message: string;
  honesty: {
    ripPerformed: false;
    lyricsScraped: false;
    drmCircumvented: false;
    commercialLicenseClaimed: false;
    /** True only when local owned bytes were accepted into a draft (not launch-published). */
    audioBinaryStored: boolean;
    autoPublished: false;
  };
  /** Attestation-only fallback when binary path is declined. */
  stubFallback?: CreatorIngestStubResult;
}

/**
 * Minimal RIFF/WAVE PCM parser — rejects compressed / exotic containers.
 */
export function parseWavPcm(bytes: Uint8Array): ParsedWavPcm | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const wave = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff !== 'RIFF' || wave !== 'WAVE') return null;

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    const size = view.getUint32(offset + 4, true);
    const next = offset + 8 + size;
    if (id === 'fmt ' && size >= 16) {
      audioFormat = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset = next + (size % 2); // word align
  }

  if (audioFormat !== 1 || dataOffset < 0) return null; // PCM only
  if (![1, 2].includes(channels) || ![16].includes(bitsPerSample)) return null;
  if (sampleRate < 8000 || sampleRate > 96000) return null;

  const frameBytes = channels * (bitsPerSample / 8);
  const frameCount = Math.floor(dataSize / frameBytes);
  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const sampleOffset = dataOffset + i * frameBytes + c * 2;
      if (sampleOffset + 1 >= bytes.length) break;
      sum += view.getInt16(sampleOffset, true) / 32768;
    }
    mono[i] = sum / channels;
  }

  return {
    sampleRate,
    channels,
    samples: mono,
    durationMs: Math.round((frameCount / sampleRate) * 1000),
  };
}

/** Encode a mono Float32 PCM buffer to a minimal 16-bit WAV (for tests / local drafts). */
export function encodeMonoWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(o, Math.round(clamped * 32767), true);
    o += 2;
  }
  return new Uint8Array(buffer);
}

/**
 * Secure local binary ingest: validate → hash → BPM/chart editor draft.
 * Does not write to the launch catalog. Platform URLs are rejected.
 */
export function ingestCreatorOwnedBinary(
  req: CreatorBinaryIngestRequest,
): CreatorBinaryIngestResult {
  const honestyBase = {
    ripPerformed: false as const,
    lyricsScraped: false as const,
    drmCircumvented: false as const,
    commercialLicenseClaimed: false as const,
    audioBinaryStored: false,
    autoPublished: false as const,
  };

  if (!req.acknowledgeNoAutoPublish) {
    return {
      ok: false,
      status: 'rejected_auto_publish',
      attestation: null,
      catalogDraft: null,
      chartEditor: null,
      sha256: null,
      bpmEstimate: null,
      message:
        'Creator binary ingest requires acknowledgeNoAutoPublish=true — drafts never auto-publish to launch.',
      honesty: honestyBase,
    };
  }

  const signals = [
    ...(req.ripIntentSignals ?? []),
    req.claimedSourceUrl ?? '',
    req.title,
    req.artist,
    req.mimeType ?? '',
  ].filter(Boolean);

  if (detectRipIntent(signals) || /drm|widevine|fairplay|bypass/i.test(signals.join(' '))) {
    return {
      ok: false,
      status: /drm|widevine|fairplay|bypass/i.test(signals.join(' '))
        ? 'rejected_drm'
        : 'rejected_rip',
      attestation: null,
      catalogDraft: null,
      chartEditor: null,
      sha256: null,
      bpmEstimate: null,
      message:
        'Rejected: BeatLink never rips streaming platforms, scrapes lyrics, or circumvents DRM.',
      honesty: honestyBase,
    };
  }

  if (req.claimedSourceUrl) {
    if (
      isAllowlistedProviderUrl(req.claimedSourceUrl) ||
      /spotify|apple.?music|youtube|tidal|deezer|amazon.?music/i.test(req.claimedSourceUrl)
    ) {
      return {
        ok: false,
        status: 'rejected_rip',
        attestation: null,
        catalogDraft: null,
        chartEditor: null,
        sha256: null,
        bpmEstimate: null,
        message:
          'Rejected: platform URLs are metadata/reference only. Upload owned WAV bytes; do not paste stream links as audio.',
        honesty: honestyBase,
      };
    }
  }

  if (!req.ownsOrLicensed) {
    const stub = ingestCreatorOwnedStub(req);
    return {
      ok: false,
      status: 'rejected_ownership',
      attestation: stub.attestation,
      catalogDraft: null,
      chartEditor: null,
      sha256: null,
      bpmEstimate: null,
      message: 'Creator must attest ownership or a lawful license before binary ingest.',
      honesty: honestyBase,
      stubFallback: stub,
    };
  }

  const bytes = req.audioBytes;
  if (bytes.byteLength < CREATOR_BINARY_MIN_BYTES || bytes.byteLength > CREATOR_BINARY_MAX_BYTES) {
    return {
      ok: false,
      status: 'rejected_size',
      attestation: null,
      catalogDraft: null,
      chartEditor: null,
      sha256: null,
      bpmEstimate: null,
      message: `Rejected size: local WAV must be ${CREATOR_BINARY_MIN_BYTES}–${CREATOR_BINARY_MAX_BYTES} bytes.`,
      honesty: honestyBase,
    };
  }

  const mime = (req.mimeType ?? 'audio/wav').toLowerCase();
  if (
    !CREATOR_ALLOWED_MIME.includes(mime as (typeof CREATOR_ALLOWED_MIME)[number]) &&
    mime !== 'application/octet-stream'
  ) {
    return {
      ok: false,
      status: 'rejected_format',
      attestation: null,
      catalogDraft: null,
      chartEditor: null,
      sha256: null,
      bpmEstimate: null,
      message: 'Rejected format: local creator path accepts PCM WAV only (no platform containers).',
      honesty: honestyBase,
    };
  }

  const parsed = parseWavPcm(bytes);
  if (!parsed) {
    return {
      ok: false,
      status: 'rejected_format',
      attestation: null,
      catalogDraft: null,
      chartEditor: null,
      sha256: null,
      bpmEstimate: null,
      message: 'Rejected: WAV must be PCM16 mono/stereo; compressed or non-WAV containers are blocked.',
      honesty: honestyBase,
    };
  }

  const hash = sha256Hex(bytes);
  const analysis = analyzeAudio(parsed.samples, {
    sampleRate: parsed.sampleRate,
    bpmHint: req.bpm,
  });
  const editor = openChartEditor(analysis, 1);
  const publishGate = canPublishChart(editor, { forceReviewAck: false });

  const stub = ingestCreatorOwnedStub({
    ...req,
    durationMs: req.durationMs ?? parsed.durationMs,
    bpm: req.bpm ?? analysis.tempo.bpm,
  });

  if (!stub.ok || !stub.catalogStub || !stub.attestation) {
    return {
      ok: false,
      status: (stub.status as CreatorBinaryIngestResult['status']) || 'rejected_ownership',
      attestation: stub.attestation,
      catalogDraft: null,
      chartEditor: null,
      sha256: hash,
      bpmEstimate: analysis.tempo.bpm,
      message: stub.message,
      honesty: honestyBase,
      stubFallback: stub,
    };
  }

  const license: CatalogLicense = stub.catalogStub.license;
  const catalogDraft: SongCatalogEntry = {
    ...stub.catalogStub,
    durationMs: parsed.durationMs,
    bpm: req.bpm ?? analysis.tempo.bpm,
    launchEligible: false,
    analysisEligible: true,
    description:
      'Creator-owned local WAV draft — validated + hashed; chart review required; not auto-published.',
    assetSha256: hash,
    audioAssetPath: null,
    compositionSha256: hash,
    rights: {
      ...stub.catalogStub.rights!,
      license,
      ownershipEvidence: `Local WAV sha256=${hash.slice(0, 16)}… attestor=${req.attestorId}`,
      author: req.artist,
      licenseVersion: license === 'creative_commons' ? 'CC0-1.0' : null,
    },
  };

  const needsReview =
    !publishGate.ok || editor.confidenceGate === 'review_required' || editor.confidenceGate === 'blocked';

  return {
    ok: true,
    status: needsReview ? 'review_required' : 'binary_validated',
    attestation: stub.attestation,
    catalogDraft,
    chartEditor: editor,
    sha256: hash,
    bpmEstimate: analysis.tempo.bpm,
    message: needsReview
      ? 'Binary validated and hashed. Chart confidence requires manual review — not launch-published.'
      : 'Binary validated and hashed. Chart draft ready — still not auto-published to launch catalog.',
    honesty: {
      ...honestyBase,
      audioBinaryStored: true,
    },
    stubFallback: stub,
  };
}

/** Test helper: build a rights-cleared synthetic WAV for ingest unit tests. */
export function synthesizeCreatorTestWav(options: {
  bpm?: number;
  durationMs?: number;
  sampleRate?: number;
}): Uint8Array {
  const pcm = synthesizeClickTrack({
    bpm: options.bpm ?? 120,
    durationMs: options.durationMs ?? 4000,
    sampleRate: options.sampleRate ?? 22050,
  });
  return encodeMonoWav(pcm, options.sampleRate ?? 22050);
}

// Re-export chart helpers used by callers after ingest.
export { generateChartFromAnalysis, canPublishChart };
