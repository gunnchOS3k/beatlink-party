/**
 * Karaoke DSP synthetic path — Alpha digital.
 * Pitch / RMS / ZCR features from synthetic PCM only.
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

function estimatePitchHz(
  samples: Float32Array,
  sampleRate: number,
  start: number,
  end: number,
): number {
  const len = end - start;
  if (len < sampleRate * 0.05) return 0;
  const minLag = Math.floor(sampleRate / 500); // 500 Hz
  const maxLag = Math.floor(sampleRate / 80); // 80 Hz
  if (maxLag >= len) return 0;

  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    let norm = 0;
    for (let i = start; i + lag < end; i++) {
      const a = samples[i]!;
      const b = samples[i + lag]!;
      corr += a * b;
      norm += a * a;
    }
    const score = norm > 1e-9 ? corr / norm : 0;
    if (score > bestCorr) {
      bestCorr = score;
      bestLag = lag;
    }
  }
  if (bestCorr < 0.3 || bestLag === 0) return 0;
  return Math.round(sampleRate / bestLag);
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
  const pitchDelta = features.pitchHz
    ? Math.abs(features.pitchHz - options.targetPitchHz) / options.targetPitchHz
    : 1;
  const pitchMatch = Math.max(0, 1 - pitchDelta);
  const energyMatch = Math.min(1, features.rms / 0.35);

  let gradeHint: KaraokeDspScore['gradeHint'] = 'miss';
  const combined = pitchMatch * 0.6 + energyMatch * 0.4;
  if (features.voiced && combined >= 0.85) gradeHint = 'perfect';
  else if (features.voiced && combined >= 0.65) gradeHint = 'great';
  else if (features.voiced && combined >= 0.4) gradeHint = 'good';

  return { features, pitchMatch, energyMatch, gradeHint };
}
