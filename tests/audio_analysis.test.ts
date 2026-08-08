import { describe, it, expect } from 'vitest';
import {
  analyzeAudio,
  generateChartFromAnalysis,
  synthesizeClickTrack,
} from '../packages/game-engine/src/audioAnalysis.js';

/** Frozen baseline for 120 BPM synthetic click train (deterministic). */
const BASELINE_120 = {
  bpm: 120,
  minOnsets: 8,
  minConfidence: 0.45,
  minBeats: 8,
  minNotes: 4,
};

describe('audio analysis + chart generation', () => {
  it('estimates tempo/onsets/beat grid from synthetic 120 BPM clicks', () => {
    const samples = synthesizeClickTrack({
      bpm: 120,
      durationMs: 8000,
      sampleRate: 22050,
    });
    const analysis = analyzeAudio(samples, {
      sampleRate: 22050,
      bpmHint: 120,
    });

    expect(analysis.tempo.bpm).toBe(BASELINE_120.bpm);
    expect(analysis.onsets.length).toBeGreaterThanOrEqual(BASELINE_120.minOnsets);
    expect(analysis.beatGrid.beats.length).toBeGreaterThanOrEqual(BASELINE_120.minBeats);
    expect(analysis.confidence).toBeGreaterThanOrEqual(BASELINE_120.minConfidence);
    expect(analysis.beatGrid.bpm).toBe(120);
  });

  it('is deterministic for identical synthetic input', () => {
    const a = synthesizeClickTrack({ bpm: 140, durationMs: 5000, sampleRate: 16000 });
    const b = synthesizeClickTrack({ bpm: 140, durationMs: 5000, sampleRate: 16000 });
    expect([...a]).toEqual([...b]);

    const analysisA = analyzeAudio(a, { sampleRate: 16000, bpmHint: 140 });
    const analysisB = analyzeAudio(b, { sampleRate: 16000, bpmHint: 140 });
    expect(analysisA.tempo.bpm).toBe(analysisB.tempo.bpm);
    expect(analysisA.beatGrid.beats).toEqual(analysisB.beatGrid.beats);
    expect(analysisA.onsets.map((o) => o.timeMs)).toEqual(
      analysisB.onsets.map((o) => o.timeMs),
    );
  });

  it('generates chart notes aligned to the beat grid baseline', () => {
    const samples = synthesizeClickTrack({ bpm: 120, durationMs: 6000, sampleRate: 22050 });
    const analysis = analyzeAudio(samples, { sampleRate: 22050, bpmHint: 120 });
    const chart = generateChartFromAnalysis(analysis, 1);

    expect(chart.bpm).toBe(120);
    expect(chart.notes.length).toBeGreaterThanOrEqual(BASELINE_120.minNotes);
    expect(chart.source).toBe('beat_grid');
    expect(chart.confidence).toBeGreaterThanOrEqual(BASELINE_120.minConfidence);

    const sparser = generateChartFromAnalysis(analysis, 0.5);
    expect(chart.notes.length).toBeGreaterThanOrEqual(sparser.notes.length);
  });

  it('matches frozen 100 BPM baseline comparison', () => {
    const samples = synthesizeClickTrack({ bpm: 100, durationMs: 6000, sampleRate: 22050 });
    const analysis = analyzeAudio(samples, { sampleRate: 22050, bpmHint: 100 });
    expect(analysis.tempo.bpm).toBe(100);
    expect(analysis.beatGrid.beats[0]).toBeGreaterThanOrEqual(0);
    const interval =
      analysis.beatGrid.beats[1]! - analysis.beatGrid.beats[0]!;
    expect(interval).toBeGreaterThanOrEqual(590);
    expect(interval).toBeLessThanOrEqual(610);
  });
});
