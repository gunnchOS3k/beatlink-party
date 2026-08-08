/**
 * Deterministic audio analysis for synthetic / rights-cleared PCM buffers.
 * No platform ripping — operates only on Float32Array samples supplied by callers.
 */

export interface TempoEstimate {
  bpm: number;
  confidence: number;
}

export interface OnsetEvent {
  timeMs: number;
  strength: number;
}

export interface BeatGrid {
  bpm: number;
  offsetMs: number;
  beats: number[];
  confidence: number;
}

export interface AnalysisResult {
  tempo: TempoEstimate;
  onsets: OnsetEvent[];
  beatGrid: BeatGrid;
  confidence: number;
  sampleRate: number;
  durationMs: number;
}

export interface ChartNote {
  id: string;
  timeMs: number;
  type: 'tap' | 'hold';
  strength: number;
}

export interface GeneratedChart {
  bpm: number;
  offsetMs: number;
  notes: ChartNote[];
  confidence: number;
  source: 'beat_grid' | 'onset_fallback';
}

export interface AnalysisOptions {
  sampleRate?: number;
  /** Expected BPM hint for disambiguation (demo/synthetic). */
  bpmHint?: number;
  minBpm?: number;
  maxBpm?: number;
}

const DEFAULT_SAMPLE_RATE = 44100;

/** Generate a deterministic click track (synthetic — not copyrighted media). */
export function synthesizeClickTrack(options: {
  bpm: number;
  durationMs: number;
  sampleRate?: number;
  clickHz?: number;
}): Float32Array {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const totalSamples = Math.floor((options.durationMs / 1000) * sampleRate);
  const out = new Float32Array(totalSamples);
  const beatInterval = 60 / options.bpm;
  const clickHz = options.clickHz ?? 1000;
  const clickSamples = Math.floor(0.02 * sampleRate);

  let beatTime = 0;
  while (beatTime * 1000 < options.durationMs) {
    const start = Math.floor(beatTime * sampleRate);
    for (let i = 0; i < clickSamples && start + i < totalSamples; i++) {
      const env = 1 - i / clickSamples;
      out[start + i] = Math.sin((2 * Math.PI * clickHz * i) / sampleRate) * env;
    }
    beatTime += beatInterval;
  }
  return out;
}

function energyEnvelope(samples: Float32Array, hop: number, frame: number): number[] {
  const energies: number[] = [];
  for (let i = 0; i + frame <= samples.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < frame; j++) {
      const v = samples[i + j]!;
      sum += v * v;
    }
    energies.push(sum / frame);
  }
  return energies;
}

export function detectOnsets(
  samples: Float32Array,
  sampleRate = DEFAULT_SAMPLE_RATE,
): OnsetEvent[] {
  const hop = Math.floor(sampleRate * 0.01);
  const frame = Math.floor(sampleRate * 0.04);
  const energies = energyEnvelope(samples, hop, frame);
  if (energies.length < 3) return [];

  const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
  const threshold = mean * 1.8;
  const onsets: OnsetEvent[] = [];
  let lastOnsetHop = -999;

  for (let i = 1; i < energies.length; i++) {
    const prev = energies[i - 1]!;
    const cur = energies[i]!;
    if (cur > threshold && cur > prev * 1.15 && i - lastOnsetHop > 4) {
      const timeMs = Math.round((i * hop * 1000) / sampleRate);
      onsets.push({ timeMs, strength: cur / (mean || 1e-9) });
      lastOnsetHop = i;
    }
  }
  return onsets;
}

export function estimateTempo(
  onsets: OnsetEvent[],
  options: AnalysisOptions = {},
): TempoEstimate {
  const minBpm = options.minBpm ?? 70;
  const maxBpm = options.maxBpm ?? 180;
  if (onsets.length < 2) {
    return { bpm: options.bpmHint ?? 120, confidence: 0.1 };
  }

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const dt = onsets[i]!.timeMs - onsets[i - 1]!.timeMs;
    if (dt > 200 && dt < 2000) intervals.push(dt);
  }
  if (intervals.length === 0) {
    return { bpm: options.bpmHint ?? 120, confidence: 0.15 };
  }

  // Histogram of BPM candidates from inter-onset intervals
  const bins = new Map<number, number>();
  for (const dt of intervals) {
    let bpm = Math.round(60000 / dt);
    while (bpm < minBpm) bpm *= 2;
    while (bpm > maxBpm) bpm = Math.round(bpm / 2);
    if (bpm < minBpm || bpm > maxBpm) continue;
    bins.set(bpm, (bins.get(bpm) ?? 0) + 1);
  }

  let bestBpm = options.bpmHint ?? 120;
  let bestCount = 0;
  for (const [bpm, count] of bins) {
    const hintBoost = options.bpmHint != null && Math.abs(bpm - options.bpmHint) <= 2 ? 2 : 0;
    const score = count + hintBoost;
    if (score > bestCount) {
      bestCount = score;
      bestBpm = bpm;
    }
  }

  const confidence = Math.min(0.99, 0.35 + bestCount / Math.max(1, intervals.length));
  return { bpm: bestBpm, confidence };
}

export function buildBeatGrid(
  onsets: OnsetEvent[],
  tempo: TempoEstimate,
  durationMs: number,
): BeatGrid {
  const beatMs = 60000 / tempo.bpm;
  const firstOnset = onsets[0]?.timeMs ?? 0;
  // Snap offset to nearest onset within half a beat of a grid origin at 0
  let offsetMs = firstOnset % beatMs;
  if (offsetMs > beatMs / 2) offsetMs -= beatMs;
  offsetMs = Math.round(offsetMs);

  const beats: number[] = [];
  let t = offsetMs;
  if (t < 0) t += beatMs;
  while (t <= durationMs) {
    beats.push(Math.round(t));
    t += beatMs;
  }

  // Confidence from how many beats align with onsets
  let hits = 0;
  for (const beat of beats) {
    if (onsets.some((o) => Math.abs(o.timeMs - beat) <= beatMs * 0.15)) hits += 1;
  }
  const alignment = beats.length === 0 ? 0 : hits / beats.length;
  const confidence = Math.min(0.99, tempo.confidence * 0.5 + alignment * 0.5);

  return {
    bpm: tempo.bpm,
    offsetMs,
    beats,
    confidence,
  };
}

export function analyzeAudio(
  samples: Float32Array,
  options: AnalysisOptions = {},
): AnalysisResult {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const durationMs = Math.round((samples.length / sampleRate) * 1000);
  const onsets = detectOnsets(samples, sampleRate);
  const tempo = estimateTempo(onsets, options);
  const beatGrid = buildBeatGrid(onsets, tempo, durationMs);
  const confidence = Math.min(tempo.confidence, beatGrid.confidence);

  return {
    tempo,
    onsets,
    beatGrid,
    confidence,
    sampleRate,
    durationMs,
  };
}

export function generateChartFromAnalysis(
  analysis: AnalysisResult,
  density = 1,
): GeneratedChart {
  const step = Math.max(1, Math.round(1 / Math.max(0.25, density)));
  const notes: ChartNote[] = [];
  let i = 0;
  for (let b = 0; b < analysis.beatGrid.beats.length; b += step) {
    const timeMs = analysis.beatGrid.beats[b]!;
    const nearOnset = analysis.onsets.find((o) => Math.abs(o.timeMs - timeMs) < 40);
    notes.push({
      id: `chart-${i}`,
      timeMs,
      type: i % 8 === 0 ? 'hold' : 'tap',
      strength: nearOnset?.strength ?? 1,
    });
    i += 1;
  }

  return {
    bpm: analysis.beatGrid.bpm,
    offsetMs: analysis.beatGrid.offsetMs,
    notes,
    confidence: analysis.confidence,
    source: analysis.onsets.length > 0 ? 'beat_grid' : 'onset_fallback',
  };
}
