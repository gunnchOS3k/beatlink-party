/**
 * Karaoke DSP — pitch / RMS / ZCR from PCM.
 * Synthetic probes validate algorithms only; never authorize live-mic claims.
 * Never captures, stores, or uploads live microphone audio.
 */

export interface KaraokeDspFeatures {
  rms: number;
  peak: number;
  zeroCrossingRate: number;
  /** Crude pitch estimate in Hz (autocorrelation); 0 if unvoiced. */
  pitchHz: number;
  voiced: boolean;
}

export interface KaraokeDspScore {
  features: KaraokeDspFeatures;
  pitchMatch: number;
  energyMatch: number;
  gradeHint: 'perfect' | 'great' | 'good' | 'miss';
}

/** Minimum analysis window — required for stable autocorrelation at browser rates. */
export const KARAOKE_MIN_FRAME_MS = 50;

/** Deterministic synthetic voiced tone + noise floor (not copyrighted media). */
export function synthesizeKaraokeTone(options: {
  durationMs: number;
  sampleRate?: number;
  pitchHz: number;
  amplitude?: number;
  phraseWindowsMs?: Array<{ startMs: number; endMs: number }>;
}): Float32Array {
  const sampleRate = options.sampleRate ?? 16000;
  const amp = options.amplitude ?? 0.6;
  const n = Math.floor((options.durationMs / 1000) * sampleRate);
  const out = new Float32Array(n);
  const windows = options.phraseWindowsMs ?? [
    { startMs: 500, endMs: options.durationMs - 200 },
  ];

  for (let i = 0; i < n; i++) {
    const tMs = (i / sampleRate) * 1000;
    const active = windows.some((w) => tMs >= w.startMs && tMs <= w.endMs);
    if (!active) {
      out[i] = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 0.01;
      continue;
    }
    const t = i / sampleRate;
    out[i] = Math.sin(2 * Math.PI * options.pitchHz * t) * amp;
  }
  return out;
}

export function extractKaraokeDspFeatures(
  samples: Float32Array,
  sampleRate = 16000,
  window?: { startMs: number; endMs: number },
): KaraokeDspFeatures {
  let start = 0;
  let end = samples.length;
  if (window) {
    start = Math.max(0, Math.floor((window.startMs / 1000) * sampleRate));
    end = Math.min(samples.length, Math.floor((window.endMs / 1000) * sampleRate));
  }
  const len = Math.max(0, end - start);
  if (len === 0) {
    return { rms: 0, peak: 0, zeroCrossingRate: 0, pitchHz: 0, voiced: false };
  }

  let sumSq = 0;
  let peak = 0;
  let zc = 0;
  let prev = samples[start]!;
  for (let i = start; i < end; i++) {
    const v = samples[i]!;
    sumSq += v * v;
    peak = Math.max(peak, Math.abs(v));
    if ((prev >= 0 && v < 0) || (prev < 0 && v >= 0)) zc += 1;
    prev = v;
  }
  const rms = Math.sqrt(sumSq / len);
  const zeroCrossingRate = zc / len;
  const pitchHz = estimatePitchHz(samples, sampleRate, start, end);
  const voiced = rms >= 0.05 && pitchHz > 0;
  return { rms, peak, zeroCrossingRate, pitchHz, voiced };
}

function autocorrelationAt(
  samples: Float32Array,
  start: number,
  end: number,
  lag: number,
): number {
  let corr = 0;
  let norm = 0;
  for (let i = start; i + lag < end; i++) {
    const a = samples[i]!;
    const b = samples[i + lag]!;
    corr += a * b;
    norm += a * a;
  }
  return norm > 1e-9 ? corr / norm : 0;
}

/**
 * Autocorrelation pitch with octave-error correction.
 * Rejects frames shorter than KARAOKE_MIN_FRAME_MS at the given sample rate.
 */
export function estimatePitchHz(
  samples: Float32Array,
  sampleRate: number,
  start: number,
  end: number,
): number {
  const len = end - start;
  const minSamples = Math.ceil(sampleRate * (KARAOKE_MIN_FRAME_MS / 1000));
  if (len < minSamples) return 0;

  const minLag = Math.floor(sampleRate / 500); // 500 Hz
  const maxLag = Math.min(Math.floor(sampleRate / 80), len - 1); // 80 Hz
  if (maxLag <= minLag) return 0;

  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const score = autocorrelationAt(samples, start, end, lag);
    if (score > bestCorr) {
      bestCorr = score;
      bestLag = lag;
    }
  }
  if (bestCorr < 0.3 || bestLag === 0) return 0;

  // Prefer the shortest lag whose integer multiple ≈ bestLag — suppresses
  // octave/third-subharmonic picks that appear with longer analysis windows.
  let lag = bestLag;
  let shortened = true;
  while (shortened) {
    shortened = false;
    for (let divisor = 2; divisor <= 5; divisor++) {
      const candidate = Math.round(lag / divisor);
      if (candidate < minLag) continue;
      const candidateCorr = autocorrelationAt(samples, start, end, candidate);
      if (candidateCorr < bestCorr * 0.88) continue;
      const multiple = lag / candidate;
      if (Math.abs(multiple - Math.round(multiple)) > 0.08) continue;
      lag = candidate;
      bestCorr = Math.max(bestCorr, candidateCorr);
      shortened = true;
      break;
    }
  }

  // Parabolic interpolation around the chosen lag for sub-bin accuracy.
  const c0 = lag > minLag ? autocorrelationAt(samples, start, end, lag - 1) : bestCorr;
  const c1 = bestCorr;
  const c2 = lag < maxLag ? autocorrelationAt(samples, start, end, lag + 1) : bestCorr;
  const denom = 2 * (2 * c1 - c0 - c2);
  const delta = Math.abs(denom) > 1e-9 ? ((c0 - c2) / denom) : 0;
  const refinedLag = lag + Math.max(-0.5, Math.min(0.5, delta));
  if (refinedLag <= 0) return 0;
  return Math.round(sampleRate / refinedLag);
}

/** Octave-aware pitch match in [0,1] — treats ±1 octave as near-match for singers. */
export function pitchMatchScore(estimatedHz: number, targetHz: number): number {
  if (!(estimatedHz > 0) || !(targetHz > 0)) return 0;
  const ratio = estimatedHz / targetHz;
  // Fold into [0.5, 2] then measure distance from 1 in log2 space.
  let r = ratio;
  while (r > 2) r /= 2;
  while (r < 0.5) r *= 2;
  const cents = Math.abs(1200 * Math.log2(r));
  // 0 cents → 1.0; 100 cents (semitone) → ~0.5; ≥400 cents → 0
  return Math.max(0, 1 - cents / 400);
}

export function scoreKaraokeDsp(
  samples: Float32Array,
  options: {
    sampleRate?: number;
    targetPitchHz: number;
    window: { startMs: number; endMs: number };
  },
): KaraokeDspScore {
  const sampleRate = options.sampleRate ?? 16000;
  const features = extractKaraokeDspFeatures(samples, sampleRate, options.window);
  const pitchMatch = features.voiced
    ? pitchMatchScore(features.pitchHz, options.targetPitchHz)
    : 0;
  const energyMatch = Math.min(1, features.rms / 0.35);

  let gradeHint: KaraokeDspScore['gradeHint'] = 'miss';
  const combined = pitchMatch * 0.6 + energyMatch * 0.4;
  if (features.voiced && combined >= 0.85) gradeHint = 'perfect';
  else if (features.voiced && combined >= 0.65) gradeHint = 'great';
  else if (features.voiced && combined >= 0.4) gradeHint = 'good';

  return { features, pitchMatch, energyMatch, gradeHint };
}

export interface PhrasePitchCoverage {
  /** Fraction of scored frames that were voiced. */
  voicedCoverage: number;
  /** Mean pitch match across voiced frames (0 if none). */
  meanPitchMatch: number;
  /** Combined phrase score used for client→server pitchMatch. */
  phrasePitchMatch: number;
  frames: number;
  voicedFrames: number;
}

/**
 * Score a phrase from a sequence of live DSP frames — requires voiced coverage,
 * not a single cached frame or silence-as-match.
 */
export function scorePhrasePitchCoverage(
  frames: Array<{ pitched: boolean; pitchMatch: number }>,
  options: { minVoicedCoverage?: number } = {},
): PhrasePitchCoverage {
  const minCov = options.minVoicedCoverage ?? 0.25;
  const framesN = frames.length;
  if (framesN === 0) {
    return {
      voicedCoverage: 0,
      meanPitchMatch: 0,
      phrasePitchMatch: 0,
      frames: 0,
      voicedFrames: 0,
    };
  }
  const voiced = frames.filter((f) => f.pitched && f.pitchMatch > 0);
  const voicedCoverage = voiced.length / framesN;
  const meanPitchMatch =
    voiced.length > 0
      ? voiced.reduce((s, f) => s + f.pitchMatch, 0) / voiced.length
      : 0;
  const phrasePitchMatch =
    voicedCoverage >= minCov ? meanPitchMatch * Math.min(1, voicedCoverage / 0.5) : 0;
  return {
    voicedCoverage,
    meanPitchMatch,
    phrasePitchMatch: Math.min(1, Math.max(0, phrasePitchMatch)),
    frames: framesN,
    voicedFrames: voiced.length,
  };
}
