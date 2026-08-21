/**
 * Per-device timing profile — Wave007 GAME-BEATLINK-005.
 * Calibration offsets are seat-scoped and applied when scoring inputs.
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

export interface DeviceTimingProfile {
  deviceId: string;
  playerId: string | null;
  offsetMs: number;
  sampleCount: number;
  stdDevMs: number;
  confidence: number;
  calibratedAtMs: number | null;
  accepted: boolean;
}

export function createDefaultDeviceTimingProfile(
  deviceId: string,
  playerId: string | null = null,
): DeviceTimingProfile {
  return {
    deviceId,
    playerId,
    offsetMs: 0,
    sampleCount: 0,
    stdDevMs: 0,
    confidence: 0,
    calibratedAtMs: null,
    accepted: false,
  };
}

export function buildDeviceTimingProfile(args: {
  deviceId: string;
  playerId?: string | null;
  samples: CalibrationSample[];
  nowMs?: number;
}): DeviceTimingProfile {
  const result: CalibrationResult = computeCalibrationOffset(args.samples);
  return {
    deviceId: args.deviceId,
    playerId: args.playerId ?? null,
    offsetMs: result.offsetMs,
    sampleCount: result.sampleCount,
    stdDevMs: result.stdDevMs,
    confidence: result.confidence,
    calibratedAtMs: args.nowMs ?? Date.now(),
    accepted: result.accepted,
  };
}

/** Effective game time for a seat = raw server clock adjusted by device profile. */
export function applyDeviceTimingProfile(
  rawGameTimeMs: number,
  profile: DeviceTimingProfile | null | undefined,
  roomFallbackOffsetMs = 0,
): number {
  const offset =
    profile && Number.isFinite(profile.offsetMs)
      ? clampCalibrationOffset(profile.offsetMs)
      : clampCalibrationOffset(roomFallbackOffsetMs);
  return rawGameTimeMs - offset;
}

/** Profiles with different offsets must change scoring windows (behavioral proof). */
export function profilesAffectScoringWindows(
  profileA: DeviceTimingProfile,
  profileB: DeviceTimingProfile,
): boolean {
  return clampCalibrationOffset(profileA.offsetMs) !== clampCalibrationOffset(profileB.offsetMs);
}

export const DEVICE_TIMING_BOUNDS = {
  minMs: CALIBRATION_MIN_MS,
  maxMs: CALIBRATION_MAX_MS,
  defaultClicks: CALIBRATION_DEFAULT_CLICKS,
} as const;
