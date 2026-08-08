import type {
  PlaybackStatus,
  RightsAttestation,
  RightsAttestationStatus,
  SongCatalogEntry,
} from '@beatlink/shared';

export class UnsupportedSourceError extends Error {
  readonly code = 'UNSUPPORTED_SOURCE' as const;
  readonly playbackStatus: PlaybackStatus = 'UNSUPPORTED';

  constructor(message = 'Unsupported music source. Platform ripping is never allowed.') {
    super(message);
    this.name = 'UnsupportedSourceError';
  }
}

export class RightsExpiredError extends Error {
  readonly code = 'RIGHTS_EXPIRED' as const;
  readonly playbackStatus: PlaybackStatus = 'RIGHTS_EXPIRED';

  constructor(message = 'Rights attestation has expired for this track.') {
    super(message);
    this.name = 'RightsExpiredError';
  }
}

export class RightsTakedownError extends Error {
  readonly code = 'TAKEN_DOWN' as const;
  readonly playbackStatus: PlaybackStatus = 'TAKEN_DOWN';

  constructor(message = 'Track was taken down and cannot be used for playback.') {
    super(message);
    this.name = 'RightsTakedownError';
  }
}

export interface AttestationInput {
  trackId: string;
  attestorId: string;
  ownsOrLicensed: boolean;
  sourceKind: RightsAttestation['sourceKind'];
  /** TTL in ms; null = no expiry (catalog / public-domain). */
  ttlMs?: number | null;
  notes?: string;
  nowMs?: number;
}

const takedownRegistry = new Set<string>();
const attestationStore = new Map<string, RightsAttestation>();

export function resetRightsStateForTests(): void {
  takedownRegistry.clear();
  attestationStore.clear();
}

/**
 * Create a rights attestation for user-owned / synthetic / public-domain audio.
 * Never grants platform-rip rights.
 */
export function createRightsAttestation(input: AttestationInput): RightsAttestation {
  if (takedownRegistry.has(input.trackId)) {
    throw new RightsTakedownError();
  }
  if (!input.ownsOrLicensed && input.sourceKind === 'user_upload') {
    const rejected: RightsAttestation = {
      trackId: input.trackId,
      attestorId: input.attestorId,
      status: 'rejected',
      attestedAtMs: input.nowMs ?? Date.now(),
      expiresAtMs: null,
      ownsOrLicensed: false,
      sourceKind: input.sourceKind,
      notes: input.notes ?? 'Upload rejected — ownership not attested.',
    };
    attestationStore.set(input.trackId, rejected);
    return rejected;
  }

  const now = input.nowMs ?? Date.now();
  const ttl = input.ttlMs === undefined ? 30 * 24 * 60 * 60 * 1000 : input.ttlMs;
  const attestation: RightsAttestation = {
    trackId: input.trackId,
    attestorId: input.attestorId,
    status: 'attested',
    attestedAtMs: now,
    expiresAtMs: ttl == null ? null : now + ttl,
    ownsOrLicensed: input.ownsOrLicensed,
    sourceKind: input.sourceKind,
    notes: input.notes,
  };
  attestationStore.set(input.trackId, attestation);
  return attestation;
}

export function getAttestation(trackId: string): RightsAttestation | null {
  return attestationStore.get(trackId) ?? null;
}

export function markTakedown(trackId: string, nowMs = Date.now()): RightsAttestation {
  takedownRegistry.add(trackId);
  const existing = attestationStore.get(trackId);
  const updated: RightsAttestation = {
    trackId,
    attestorId: existing?.attestorId ?? 'system',
    status: 'taken_down',
    attestedAtMs: existing?.attestedAtMs ?? nowMs,
    expiresAtMs: nowMs,
    ownsOrLicensed: false,
    sourceKind: existing?.sourceKind ?? 'user_upload',
    notes: 'DMCA / policy takedown — playback blocked.',
  };
  attestationStore.set(trackId, updated);
  return updated;
}

export function refreshAttestationStatus(
  trackId: string,
  nowMs = Date.now(),
): RightsAttestationStatus {
  if (takedownRegistry.has(trackId)) return 'taken_down';
  const att = attestationStore.get(trackId);
  if (!att) return 'pending';
  if (att.status === 'rejected' || att.status === 'taken_down') return att.status;
  if (att.expiresAtMs != null && nowMs > att.expiresAtMs) {
    const expired: RightsAttestation = { ...att, status: 'expired' };
    attestationStore.set(trackId, expired);
    return 'expired';
  }
  return att.status;
}

export function playbackStatusForAttestation(
  status: RightsAttestationStatus,
): PlaybackStatus {
  switch (status) {
    case 'attested':
      return 'PLAYABLE_APPROVED';
    case 'pending':
      return 'NEEDS_USER_UPLOAD';
    case 'rejected':
      return 'NEEDS_LICENSE';
    case 'expired':
      return 'RIGHTS_EXPIRED';
    case 'taken_down':
      return 'TAKEN_DOWN';
    default:
      return 'UNSUPPORTED';
  }
}

/**
 * Gate a catalog or attested upload for analysis / playback.
 * Explicitly rejects unsupported external rip attempts.
 */
export function gateMusicSource(input: {
  catalogEntry?: SongCatalogEntry | null;
  attestation?: RightsAttestation | null;
  claimedRipUrl?: string | null;
  nowMs?: number;
}): { ok: true; playbackStatus: PlaybackStatus } | { ok: false; error: Error; playbackStatus: PlaybackStatus } {
  if (input.claimedRipUrl) {
    const error = new UnsupportedSourceError(
      'Cannot play ripped or downloaded platform audio. Use approved catalog or attested uploads only.',
    );
    return { ok: false, error, playbackStatus: error.playbackStatus };
  }

  if (input.catalogEntry) {
    const license = input.catalogEntry.license;
    if (
      license === 'demo_generated' ||
      license === 'synthetic_original' ||
      license === 'public_domain' ||
      license === 'royalty_free' ||
      license === 'licensed_pack' ||
      license === 'creative_commons' ||
      license === 'creator_owned'
    ) {
      return { ok: true, playbackStatus: 'PLAYABLE_APPROVED' };
    }
  }

  if (input.attestation) {
    const status = refreshAttestationStatus(input.attestation.trackId, input.nowMs);
    const playbackStatus = playbackStatusForAttestation(status);
    if (status === 'attested') {
      return { ok: true, playbackStatus };
    }
    if (status === 'expired') {
      return { ok: false, error: new RightsExpiredError(), playbackStatus };
    }
    if (status === 'taken_down') {
      return { ok: false, error: new RightsTakedownError(), playbackStatus };
    }
    return {
      ok: false,
      error: new UnsupportedSourceError(`Rights status: ${status}`),
      playbackStatus,
    };
  }

  return {
    ok: false,
    error: new UnsupportedSourceError('No approved catalog entry or valid attestation.'),
    playbackStatus: 'UNSUPPORTED',
  };
}
