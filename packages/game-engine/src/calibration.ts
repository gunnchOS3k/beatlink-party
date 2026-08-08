/**
 * Latency calibration helpers — Alpha digital.
 * Hosts tap with metronome clicks; offset is clamped and applied to beat timeline.
 */

export const CALIBRATION_MIN_MS = -250;
export const CALIBRATION_MAX_MS = 250;
export const CALIBRATION_DEFAULT_CLICKS = 4;
export const CALIBRATION_CLICK_INTERVAL_MS = 500;

export interface CalibrationSample {
  expectedMs: number;
  tappedMs: number;
}

export interface CalibrationResult {
  offsetMs: number;
  sampleCount: number;
  stdDevMs: number;
  confidence: number;
  accepted: boolean;
  reason?: string;
}

export function clampCalibrationOffset(offsetMs: number): number {
  return Math.max(CALIBRATION_MIN_MS, Math.min(CALIBRATION_MAX_MS, Math.round(offsetMs)));
}

export function computeCalibrationOffset(samples: CalibrationSample[]): CalibrationResult {
  if (samples.length === 0) {
    return {
      offsetMs: 0,
      sampleCount: 0,
      stdDevMs: 0,
      confidence: 0,
      accepted: false,
      reason: 'no_samples',
    };
  }

  const deltas = samples.map((s) => s.tappedMs - s.expectedMs);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance =
    deltas.reduce((acc, d) => acc + (d - mean) ** 2, 0) / Math.max(1, deltas.length);
  const stdDevMs = Math.sqrt(variance);
  const offsetMs = clampCalibrationOffset(mean);

  // Confidence drops with high variance or few samples.
  const sampleFactor = Math.min(1, samples.length / CALIBRATION_DEFAULT_CLICKS);
  const stability = Math.max(0, 1 - stdDevMs / 80);
  const confidence = Math.min(0.99, sampleFactor * 0.5 + stability * 0.5);

  if (samples.length < 2) {
    return {
      offsetMs,
      sampleCount: samples.length,
      stdDevMs,
      confidence,
      accepted: false,
      reason: 'insufficient_samples',
    };
  }
  if (stdDevMs > 120) {
    return {
      offsetMs,
      sampleCount: samples.length,
      stdDevMs,
      confidence,
      accepted: false,
      reason: 'unstable',
    };
  }

  return {
    offsetMs,
    sampleCount: samples.length,
    stdDevMs,
    confidence,
    accepted: true,
  };
}

/** Expected click times for a calibration session starting at t0. */
export function calibrationClickSchedule(
  startMs: number,
  clicks = CALIBRATION_DEFAULT_CLICKS,
  intervalMs = CALIBRATION_CLICK_INTERVAL_MS,
): number[] {
  return Array.from({ length: clicks }, (_, i) => startMs + i * intervalMs);
}
