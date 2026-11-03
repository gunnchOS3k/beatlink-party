/**
 * Karaoke mic permission matrix — deny / grant / revoke, sample-rate honesty,
 * silence/noise rejection, latency budget, real vocal vs synthetic separation.
 * Default MICROPHONE_PITCH_ANALYSIS remains false. A11y tap fallback always available.
 */

import type { MicPermissionState } from './karaokeMic.js';
import {
  estimatePitchHz,
  extractKaraokeDspFeatures,
  scoreKaraokeDsp,
  type KaraokeDspScore,
} from './karaokeDsp.js';
import { microphonePitchAnalysisClaim } from './liveMicPipeline.js';

/** Supported analysis rates — browser native 44.1/48 plus CI 16/22.05. */
export const KARAOKE_SUPPORTED_SAMPLE_RATES = [16000, 22050, 44100, 48000] as const;
export type KaraokeSampleRate = (typeof KARAOKE_SUPPORTED_SAMPLE_RATES)[number];

/** Soft latency budget for live pitch frames (ms). Above = degraded, not claimed perfect. */
export const KARAOKE_LATENCY_BUDGET_MS = 80;

export type MicMatrixAction = 'deny' | 'grant' | 'revoke' | 'a11y_fallback';

export type VocalSignalKind = 'none' | 'synthetic' | 'real_vocal_ephemeral' | 'silence' | 'noise';

export interface MicMatrixState {
  permission: MicPermissionState;
  /** Always false until grant + continuous live DSP on real vocal. */
  microphonePitchAnalysis: boolean;
  signalKind: VocalSignalKind;
  sampleRate: KaraokeSampleRate | null;
  lastLatencyMs: number | null;
  withinLatencyBudget: boolean;
  a11yFallbackActive: boolean;
  /** Revoke / deny always drop pitch claim. */
  history: Array<{ atMs: number; action: MicMatrixAction; pitchClaim: boolean }>;
}

export interface MicMatrixEvaluateInput {
  permission: MicPermissionState;
  continuousLive: boolean;
  /** true only for consented getUserMedia path — never for tone probes. */
  realVocalStream: boolean;
  pcm?: Float32Array | null;
  sampleRate?: number;
  targetPitchHz?: number;
  /** Measured frame latency (capture→score). */
  latencyMs?: number | null;
  nowMs?: number;
}

export function normalizeKaraokeSampleRate(rate: number | null | undefined): KaraokeSampleRate | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  const nearest = KARAOKE_SUPPORTED_SAMPLE_RATES.reduce((best, r) =>
    Math.abs(r - rate) < Math.abs(best - rate) ? r : best,
  );
  return Math.abs(nearest - rate) <= 100 ? nearest : null;
}

export function classifyVocalSignal(
  pcm: Float32Array | null | undefined,
  sampleRate: number,
  opts: { synthetic?: boolean; realVocalStream?: boolean } = {},
): VocalSignalKind {
  if (opts.synthetic) return 'synthetic';
  if (!pcm || pcm.length === 0) return 'none';
  const features = extractKaraokeDspFeatures(pcm, sampleRate);
  if (features.rms < 0.02 && features.peak < 0.04) return 'silence';
  const pitch = estimatePitchHz(pcm, sampleRate, 0, pcm.length);
  // Broadband noise: energy without stable pitch
  if (pitch <= 0 && features.rms >= 0.02) return 'noise';
  if (opts.realVocalStream) return 'real_vocal_ephemeral';
  return 'synthetic';
}

export function createMicMatrixState(): MicMatrixState {
  return {
    permission: 'prompt',
    microphonePitchAnalysis: false,
    signalKind: 'none',
    sampleRate: null,
    lastLatencyMs: null,
    withinLatencyBudget: true,
    a11yFallbackActive: true,
    history: [],
  };
}

/**
 * Apply deny / grant / revoke. Pitch claim never sticks across revoke/deny.
 * A11y tap fallback stays available whenever pitch claim is false.
 */
export function applyMicMatrixAction(
  state: MicMatrixState,
  action: MicMatrixAction,
  nowMs = Date.now(),
): MicMatrixState {
  let permission: MicPermissionState = state.permission;
  let microphonePitchAnalysis = false;
  let a11yFallbackActive = true;
  let signalKind: VocalSignalKind = state.signalKind;

  switch (action) {
    case 'deny':
      permission = 'denied';
      microphonePitchAnalysis = false;
      signalKind = 'none';
      a11yFallbackActive = true;
      break;
    case 'grant':
      permission = 'granted';
      // Grant alone is insufficient — continuous live real vocal required.
      microphonePitchAnalysis = false;
      a11yFallbackActive = true;
      break;
    case 'revoke':
      permission = 'prompt';
      microphonePitchAnalysis = false;
      signalKind = 'none';
      a11yFallbackActive = true;
      break;
    case 'a11y_fallback':
      microphonePitchAnalysis = false;
      a11yFallbackActive = true;
      break;
  }

  return {
    ...state,
    permission,
    microphonePitchAnalysis,
    signalKind,
    a11yFallbackActive,
    history: [
      ...state.history,
      { atMs: nowMs, action, pitchClaim: microphonePitchAnalysis },
    ].slice(-32),
  };
}

/**
 * Recompute pitch claim from live conditions. Synthetic / silence / noise never authorize.
 */
export function evaluateMicMatrix(
  state: MicMatrixState,
  input: MicMatrixEvaluateInput,
): { state: MicMatrixState; score: KaraokeDspScore | null } {
  const sr = normalizeKaraokeSampleRate(input.sampleRate) ?? state.sampleRate;
  const signalKind = classifyVocalSignal(input.pcm, input.sampleRate ?? 48000, {
    synthetic: !input.realVocalStream,
    realVocalStream: input.realVocalStream,
  });

  const latencyMs = input.latencyMs ?? state.lastLatencyMs;
  const withinLatencyBudget =
    latencyMs == null ? true : latencyMs <= KARAOKE_LATENCY_BUDGET_MS;

  const continuousOk =
    input.permission === 'granted' &&
    input.continuousLive &&
    input.realVocalStream &&
    signalKind === 'real_vocal_ephemeral';

  const pitchClaim = microphonePitchAnalysisClaim({
    micConsent: input.permission,
    continuousLive: continuousOk && withinLatencyBudget,
  });

  // Harden: silence/noise/synthetic force false even if caller mis-set continuousLive.
  const microphonePitchAnalysis =
    pitchClaim && signalKind === 'real_vocal_ephemeral' && input.permission === 'granted';

  let score: KaraokeDspScore | null = null;
  if (input.pcm && input.pcm.length > 0 && (input.sampleRate ?? 0) > 0) {
    const sr = input.sampleRate ?? 48000;
    score = scoreKaraokeDsp(input.pcm, {
      targetPitchHz: input.targetPitchHz ?? 220,
      sampleRate: sr,
      window: { startMs: 0, endMs: (input.pcm.length / sr) * 1000 },
    });
  }

  return {
    state: {
      ...state,
      permission: input.permission,
      microphonePitchAnalysis,
      signalKind,
      sampleRate: sr,
      lastLatencyMs: latencyMs,
      withinLatencyBudget,
      a11yFallbackActive: !microphonePitchAnalysis,
    },
    score,
  };
}

/** Honesty banner helper for Wave007 / UI. */
export function micMatrixBanner(state: MicMatrixState): string {
  if (state.microphonePitchAnalysis) {
    return `MICROPHONE_PITCH_ANALYSIS=true · live real vocal · ${state.sampleRate ?? '?'} Hz · latency=${state.lastLatencyMs ?? '?'}ms`;
  }
  return `MICROPHONE_PITCH_ANALYSIS=false · mic=${state.permission} · signal=${state.signalKind} · a11y_tap_fallback=${state.a11yFallbackActive}`;
}
