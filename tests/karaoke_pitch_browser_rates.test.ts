import { describe, it, expect } from 'vitest';
import {
  estimatePitchHz,
  scoreKaraokeDsp,
  scorePhrasePitchCoverage,
  synthesizeKaraokeTone,
  KARAOKE_MIN_FRAME_MS,
} from '../packages/game-engine/src/karaokeDsp.js';

function frameFor(sampleRate: number, pitchHz: number, durationMs = 80): Float32Array {
  return synthesizeKaraokeTone({
    durationMs,
    sampleRate,
    pitchHz,
    phraseWindowsMs: [{ startMs: 0, endMs: durationMs }],
  });
}

describe('karaoke pitch at browser sample rates', () => {
  it('rejects undersized frames below the 50ms minimum', () => {
    for (const sr of [44100, 48000]) {
      const shortMs = 40;
      const pcm = frameFor(sr, 220, shortMs);
      expect(pcm.length).toBeLessThan(sr * (KARAOKE_MIN_FRAME_MS / 1000));
      expect(estimatePitchHz(pcm, sr, 0, pcm.length)).toBe(0);
    }
  });

  it('detects 220 Hz at 16/44.1/48 kHz with ≥50ms frames (not octave-down)', () => {
    for (const sr of [16000, 44100, 48000]) {
      const pcm = frameFor(sr, 220, 80);
      const hz = estimatePitchHz(pcm, sr, 0, pcm.length);
      expect(hz).toBeGreaterThan(200);
      expect(hz).toBeLessThan(240);
    }
  });

  it('detects several voice pitches without collapsing to silence', () => {
    const targets = [110, 196, 220, 294, 440];
    for (const sr of [44100, 48000]) {
      for (const target of targets) {
        const pcm = frameFor(sr, target, 90);
        const hz = estimatePitchHz(pcm, sr, 0, pcm.length);
        expect(hz).toBeGreaterThan(0);
        // Allow ±1 semitone (~6%) after octave correction.
        expect(Math.abs(hz - target) / target).toBeLessThan(0.08);
      }
    }
  });

  it('treats silence / noise as unvoiced miss', () => {
    const sr = 48000;
    const silence = new Float32Array(Math.ceil(sr * 0.08));
    const noise = Float32Array.from(silence, (_, i) => ((i * 17) % 100) / 5000 - 0.01);
    expect(estimatePitchHz(silence, sr, 0, silence.length)).toBe(0);
    const noisy = scoreKaraokeDsp(noise, {
      sampleRate: sr,
      targetPitchHz: 220,
      window: { startMs: 0, endMs: 80 },
    });
    expect(noisy.features.voiced).toBe(false);
    expect(noisy.gradeHint).toBe('miss');
  });

  it('phrase coverage requires voiced frames — silence is not a match', () => {
    const silent = scorePhrasePitchCoverage([
      { pitched: false, pitchMatch: 0 },
      { pitched: false, pitchMatch: 0 },
      { pitched: false, pitchMatch: 0 },
    ]);
    expect(silent.phrasePitchMatch).toBe(0);

    const mixed = scorePhrasePitchCoverage([
      { pitched: true, pitchMatch: 0.9 },
      { pitched: true, pitchMatch: 0.85 },
      { pitched: false, pitchMatch: 0 },
      { pitched: true, pitchMatch: 0.8 },
    ]);
    expect(mixed.voicedCoverage).toBeGreaterThan(0.5);
    expect(mixed.phrasePitchMatch).toBeGreaterThan(0.5);
  });
});
