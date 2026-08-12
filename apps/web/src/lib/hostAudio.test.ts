/**
 * WP-014 AUDIO_HOOK_PASS — exercises the real Web Audio hook (hostAudio.ts)
 * against a minimal AudioContext double that mirrors the real API surface
 * (createOscillator/createGain/connect/start/stop), not a fake "it played"
 * flag. No jsdom needed — the module only touches globalThis.AudioContext
 * and window.setTimeout, both stubbed directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeGainNode {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
}

class FakeOscillatorNode {
  type = 'sine';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  createOscillator = vi.fn(() => new FakeOscillatorNode());
  createGain = vi.fn(() => new FakeGainNode());
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
}

describe('WP-014 Beat Link AUDIO_HOOK_PASS', () => {
  let ctxInstances: FakeAudioContext[] = [];

  beforeEach(() => {
    vi.resetModules();
    ctxInstances = [];
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        const ctx = new FakeAudioContext();
        ctxInstances.push(ctx);
        return ctx;
      }),
    );
    vi.stubGlobal('window', {
      setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args) as unknown as number,
      clearTimeout: (id: number) => clearTimeout(id as unknown as NodeJS.Timeout),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('playClick drives a real oscillator+gain chain to ctx.destination', async () => {
    const { playClick, getAudioContext } = await import('./hostAudio');
    playClick(undefined, 880, 0.05);
    const ctx = ctxInstances[0];
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
    const osc = ctx.createOscillator.mock.results[0]!.value as FakeOscillatorNode;
    const gain = ctx.createGain.mock.results[0]!.value as FakeGainNode;
    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
    expect(getAudioContext()).toBe(ctx);
  });

  it('resumeAudioContext resumes a suspended context (autoplay-policy path)', async () => {
    const { resumeAudioContext, getAudioContext } = await import('./hostAudio');
    const ctx = getAudioContext() as unknown as FakeAudioContext;
    ctx.state = 'suspended';
    await resumeAudioContext();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('startHostMetronome schedules real clicks and stop() cancels pending timers', async () => {
    vi.useFakeTimers();
    const { startHostMetronome } = await import('./hostAudio');
    const handle = startHostMetronome({ bpm: 120, offsetMs: 0, durationMs: 2000, startedAtMs: Date.now() });
    await vi.advanceTimersByTimeAsync(1000);
    const ctx = ctxInstances[0];
    const clicksScheduled = ctx.createOscillator.mock.calls.length;
    expect(clicksScheduled).toBeGreaterThan(0);
    handle.stop();
    const countAtStop = ctx.createOscillator.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(ctx.createOscillator.mock.calls.length).toBe(countAtStop);
    vi.useRealTimers();
  });
});
