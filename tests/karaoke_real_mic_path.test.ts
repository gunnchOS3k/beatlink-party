import { describe, it, expect } from 'vitest';
import {
  LiveGetUserMediaAdapter,
  applyMicMatrixAction,
  createMicMatrixState,
  createSyntheticMediaStream,
  evaluateMicMatrix,
  micMatrixBanner,
  microphonePitchAnalysisClaim,
  openLiveMicPipeline,
  synthesizeKaraokeTone,
} from '../packages/game-engine/src/index.js';

/**
 * Karaoke real-mic *path* (adapter + matrix + honesty).
 * Synthetic MediaStream stubs exercise the path — NOT a physical phone claim.
 */
describe('karaoke real-mic path — deny/grant/revoke (path, not physical phone)', () => {
  it('defaults no-recording; grant alone does not authorize pitch', async () => {
    const pipeline = openLiveMicPipeline({ preferNoRecording: true });
    expect(await pipeline.start()).toBe('no_recording');
    expect(
      microphonePitchAnalysisClaim({ micConsent: 'no_recording', continuousLive: false }),
    ).toBe(false);

    let state = createMicMatrixState();
    state = applyMicMatrixAction(state, 'grant');
    expect(state.microphonePitchAnalysis).toBe(false);
    expect(state.a11yFallbackActive).toBe(true);
  });

  it('mocked getUserMedia deny → a11y fallback; grant+live+voiced → claim; revoke drops', async () => {
    const denied = new LiveGetUserMediaAdapter({
      getUserMedia: async () => {
        const err = new Error('Permission denied');
        err.name = 'NotAllowedError';
        throw err;
      },
    });
    denied.allowEphemeralCapture();
    expect(await denied.request()).toBe('denied');
    let state = applyMicMatrixAction(createMicMatrixState(), 'deny');
    expect(state.microphonePitchAnalysis).toBe(false);
    expect(state.a11yFallbackActive).toBe(true);
    expect(micMatrixBanner(state)).toContain('MICROPHONE_PITCH_ANALYSIS=false');

    const stream = createSyntheticMediaStream();
    const granted = new LiveGetUserMediaAdapter({
      getUserMedia: async () => stream,
    });
    granted.allowEphemeralCapture();
    expect(await granted.request()).toBe('granted');
    expect(granted.getStream()).toBe(stream);

    const tone = synthesizeKaraokeTone({
      durationMs: 120,
      sampleRate: 48000,
      pitchHz: 220,
      phraseWindowsMs: [{ startMs: 0, endMs: 120 }],
    });
    state = applyMicMatrixAction(createMicMatrixState(), 'grant');
    const live = evaluateMicMatrix(state, {
      permission: 'granted',
      continuousLive: true,
      realVocalStream: true,
      pcm: tone,
      sampleRate: 48000,
      targetPitchHz: 220,
      latencyMs: 40,
    });
    expect(live.state.microphonePitchAnalysis).toBe(true);
    expect(live.state.signalKind).toBe('real_vocal_ephemeral');

    // Silence on real stream still refuses pitch claim.
    const silence = evaluateMicMatrix(state, {
      permission: 'granted',
      continuousLive: true,
      realVocalStream: true,
      pcm: new Float32Array(48000 * 0.08),
      sampleRate: 48000,
      latencyMs: 40,
    });
    expect(silence.state.microphonePitchAnalysis).toBe(false);
    expect(silence.state.signalKind).toBe('silence');

    state = applyMicMatrixAction(live.state, 'revoke');
    expect(state.microphonePitchAnalysis).toBe(false);
    expect(state.a11yFallbackActive).toBe(true);

    granted.stopTracks();
    expect(stream.getAudioTracks()[0]?.readyState).toBe('ended');
  });

  it('never claims physical phone from synthetic path', () => {
    expect(microphonePitchAnalysisClaim({ micConsent: 'granted', continuousLive: false })).toBe(
      false,
    );
    // Honesty: this suite uses MediaStream stubs — physical_lan_review remains unexecuted.
    expect(true).toBe(true);
  });
});
