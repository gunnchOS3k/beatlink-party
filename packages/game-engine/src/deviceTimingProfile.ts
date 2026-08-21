/**
 * Per-device timing profile — Wave007 GAME-BEATLINK-005.
 * Calibration offsets are seat-scoped and applied when scoring inputs.
 * Unmeasured fields stay null / UNKNOWN — never fabricate audio output latency in headless CI.
 */

import {
  CALIBRATION_DEFAULT_CLICKS,
  CALIBRATION_MAX_MS,
  CALIBRATION_MIN_MS,
  clampCalibrationOffset,
  computeCalibrationOffset,
  type CalibrationSample,
  type CalibrationResult,
} from './calibration.js';

export type CalibrationMethod =
  | 'tap_samples'
  | 'host_room'
  | 'deterministic_fixture'
  | 'UNKNOWN';

export type TimingProvenance = 'player_device' | 'host_room' | 'e2e_fixture' | 'UNKNOWN';

export interface DeviceTimingProfile {
  device_id: string;
  player_id: string | null;
  /** @deprecated use device_id — kept for existing call sites */
  deviceId: string;
  /** @deprecated use player_id */
  playerId: string | null;
  input_latency_ms: number;
  audio_output_latency_ms: number | null;
  network_offset_ms: number | null;
  estimated_clock_offset_ms: number;
  effective_scoring_offset_ms: number;
  jitter_ms: number;
  calibration_method: CalibrationMethod;
  sample_count: number;
  confidence: number;
  created_at: number | null;
  expires_at: number | null;
  accepted: boolean;
  provenance: TimingProvenance;
  /** Legacy aliases used by RoomManager / clients */
  offsetMs: number;
  sampleCount: number;
  stdDevMs: number;
  calibratedAtMs: number | null;
}

const PROFILE_TTL_MS = 30 * 60 * 1000;

export function createDefaultDeviceTimingProfile(
  deviceId: string,
  playerId: string | null = null,
): DeviceTimingProfile {
  return {
    device_id: deviceId,
    player_id: playerId,
    deviceId,
    playerId,
    input_latency_ms: 0,
    audio_output_latency_ms: null,
    network_offset_ms: null,
    estimated_clock_offset_ms: 0,
    effective_scoring_offset_ms: 0,
    jitter_ms: 0,
    calibration_method: 'UNKNOWN',
    sample_count: 0,
    confidence: 0,
    created_at: null,
    expires_at: null,
    accepted: false,
    provenance: 'UNKNOWN',
    offsetMs: 0,
    sampleCount: 0,
    stdDevMs: 0,
    calibratedAtMs: null,
  };
}

export function buildDeviceTimingProfile(args: {
  deviceId: string;
  playerId?: string | null;
  samples: CalibrationSample[];
  nowMs?: number;
  networkOffsetMs?: number | null;
  audioOutputLatencyMs?: number | null;
  calibrationMethod?: CalibrationMethod;
  provenance?: TimingProvenance;
}): DeviceTimingProfile {
  const result: CalibrationResult = computeCalibrationOffset(args.samples);
  const now = args.nowMs ?? Date.now();
  const network = args.networkOffsetMs ?? null;
  const audioOut = args.audioOutputLatencyMs ?? null; // null in headless — do not fabricate
  const inputLatency = result.offsetMs;
  const estimatedClock = inputLatency + (network ?? 0);
  const effective = clampCalibrationOffset(estimatedClock);

  return {
    device_id: args.deviceId,
    player_id: args.playerId ?? null,
    deviceId: args.deviceId,
    playerId: args.playerId ?? null,
    input_latency_ms: inputLatency,
    audio_output_latency_ms: audioOut,
    network_offset_ms: network,
    estimated_clock_offset_ms: estimatedClock,
    effective_scoring_offset_ms: effective,
    jitter_ms: result.stdDevMs,
    calibration_method: args.calibrationMethod ?? 'tap_samples',
    sample_count: result.sampleCount,
    confidence: result.confidence,
    created_at: now,
    expires_at: now + PROFILE_TTL_MS,
    accepted: result.accepted,
    provenance: args.provenance ?? 'player_device',
    offsetMs: effective,
    sampleCount: result.sampleCount,
    stdDevMs: result.stdDevMs,
    calibratedAtMs: now,
  };
}

/** Effective game time for a seat = raw server clock adjusted by device profile. */
export function applyDeviceTimingProfile(
  rawGameTimeMs: number,
  profile: DeviceTimingProfile | null | undefined,
  roomFallbackOffsetMs = 0,
): number {
  const offset =
    profile && Number.isFinite(profile.effective_scoring_offset_ms ?? profile.offsetMs)
      ? clampCalibrationOffset(profile.effective_scoring_offset_ms ?? profile.offsetMs)
      : clampCalibrationOffset(roomFallbackOffsetMs);
  return rawGameTimeMs - offset;
}

/** Profiles with different offsets must change scoring windows (behavioral proof). */
export function profilesAffectScoringWindows(
  profileA: DeviceTimingProfile,
  profileB: DeviceTimingProfile,
): boolean {
  const a = clampCalibrationOffset(profileA.effective_scoring_offset_ms ?? profileA.offsetMs);
  const b = clampCalibrationOffset(profileB.effective_scoring_offset_ms ?? profileB.offsetMs);
  return a !== b;
}

export const DEVICE_TIMING_BOUNDS = {
  minMs: CALIBRATION_MIN_MS,
  maxMs: CALIBRATION_MAX_MS,
  defaultClicks: CALIBRATION_DEFAULT_CLICKS,
} as const;
