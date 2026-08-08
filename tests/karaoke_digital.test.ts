import { describe, it, expect } from 'vitest';
import {
  BrowserMicPermissionAdapter,
  openKaraokeMicSession,
  scoreSyntheticKaraokeSignal,
  synthesizeKaraokeEnvelope,
  SyntheticMicPermissionAdapter,
} from '../packages/game-engine/src/karaokeMic.js';
import { buildKaraokePromptState, canSubmitVocalPhrase } from '../packages/game-engine/src/karaoke.js';

describe('karaoke digital path', () => {
  it('defaults to no-recording mode without capturing audio', async () => {
    const adapter = new SyntheticMicPermissionAdapter();
    const session = openKaraokeMicSession(adapter, { preferNoRecording: true });
    expect(session.noRecording).toBe(true);
    expect(session.recordingEnabled).toBe(false);
    expect(session.permission).toBe('no_recording');
    expect(session.signalSource).toBe('synthetic');
    expect(await adapter.request()).toBe('no_recording');
  });

  it('scores synthetic phrase peaks in CI without live mic', () => {
    const envelope = synthesizeKaraokeEnvelope({
      durationMs: 5000,
      sampleRate: 16000,
      phrasePeaksMs: [1000, 2500, 4000],
    });
    const hit = scoreSyntheticKaraokeSignal(envelope, 1000, 16000);
    const miss = scoreSyntheticKaraokeSignal(envelope, 1800, 16000);
    expect(hit.inWindow).toBe(true);
    expect(hit.gradeHint).not.toBe('miss');
    expect(miss.inWindow).toBe(false);
    expect(miss.gradeHint).toBe('miss');
  });

  it('keeps prompt timing path usable when mic is denied', () => {
    const adapter = new SyntheticMicPermissionAdapter();
    adapter.disableNoRecordingForTests();
    adapter.simulateDenied();
    expect(adapter.query()).toBe('denied');

    const prompts = [
      { id: 'v1', timeMs: 2000, text: 'Echo the crowd!', durationMs: 2000 },
    ];
    const state = buildKaraokePromptState(prompts, 2100);
    expect(canSubmitVocalPhrase(state)).toBe(true);
  });

  it('browser adapter stays no-recording and never enables capture', async () => {
    const adapter = new BrowserMicPermissionAdapter();
    expect(adapter.enableNoRecordingMode()).toBe('no_recording');
    expect(await adapter.query()).toBe('no_recording');
    expect(await adapter.request()).toBe('no_recording');
  });
});
