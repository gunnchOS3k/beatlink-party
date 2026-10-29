/** Host-device Web Audio helpers — synthesized clicks only, never platform audio. */

let sharedCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

export function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') return ctx.resume();
  return Promise.resolve();
}

/** Short click / blip for metronome and calibration. */
export function playClick(time?: number, frequency = 880, duration = 0.05): void {
  const ctx = getAudioContext();
  const t = time ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.01);
}

export interface MetronomeHandle {
  stop: () => void;
}

/**
 * Schedule host-device rhythm playback from beatmap BPM.
 * Applies calibrationOffsetMs so clicks align with measured host latency.
 */
export function startHostMetronome(opts: {
  bpm: number;
  offsetMs: number;
  durationMs: number;
  startedAtMs: number;
}): MetronomeHandle {
  const ctx = getAudioContext();
  void resumeAudioContext();
  const beatIntervalMs = 60_000 / Math.max(1, opts.bpm);
  const timers: number[] = [];

  const schedule = () => {
    const elapsed = Date.now() - opts.startedAtMs + opts.offsetMs;
    if (elapsed > opts.durationMs + beatIntervalMs) return;

    // Align to next beat boundary
    const beatIndex = Math.max(0, Math.ceil(elapsed / beatIntervalMs));
    const nextBeatMs = beatIndex * beatIntervalMs;
    const waitMs = Math.max(0, nextBeatMs - elapsed);

    const id = window.setTimeout(() => {
      playClick(undefined, beatIndex % 4 === 0 ? 1100 : 880);
      schedule();
    }, waitMs);
    timers.push(id);
  };

  schedule();

  return {
    stop: () => {
      for (const id of timers) window.clearTimeout(id);
      void ctx;
    },
  };
}

/**
 * Note-synced procedural song bed for approved catalog / original / PD / CC paths.
 * Schedules pitched blips on chart note times — richer than metronome-only, still
 * synthesized on-device (never a ripped commercial stem).
 */
export function startHostSongBed(opts: {
  bpm: number;
  offsetMs: number;
  durationMs: number;
  startedAtMs: number;
  /** Chart note times in ms from song start. */
  noteTimesMs?: number[];
}): MetronomeHandle {
  const ctx = getAudioContext();
  void resumeAudioContext();
  const timers: number[] = [];
  const noteTimes = [...(opts.noteTimesMs ?? [])].sort((a, b) => a - b);

  if (noteTimes.length === 0) {
    // Fall back to metronome bed when chart notes are unavailable.
    return startHostMetronome(opts);
  }

  for (let i = 0; i < noteTimes.length; i++) {
    const noteMs = noteTimes[i]!;
    const waitMs = Math.max(
      0,
      noteMs - (Date.now() - opts.startedAtMs) - opts.offsetMs,
    );
    if (noteMs > opts.durationMs + 500) continue;
    const id = window.setTimeout(() => {
      // Alternating root / fifth / octave — original synthetic bed, not a stem.
      const freqs = [220, 330, 440, 550];
      playClick(undefined, freqs[i % freqs.length], 0.07);
    }, waitMs);
    timers.push(id);
  }

  // Soft downbeat pulse under the song bed for stage energy.
  const pulse = startHostMetronome({
    ...opts,
    // Lower prominence: reuse metronome scheduler but host already hears note blips.
  });

  return {
    stop: () => {
      for (const id of timers) window.clearTimeout(id);
      pulse.stop();
      void ctx;
    },
  };
}

/**
 * Calibration click loop — returns expected beat timestamps for offset sampling.
 */
export function startCalibrationClicks(
  bpm: number,
  onBeat: (expectedAtMs: number) => void,
): MetronomeHandle {
  const beatIntervalMs = 60_000 / Math.max(1, bpm);
  let beatCount = 0;
  let timer: number | null = null;

  const tick = () => {
    const expectedAtMs = Date.now();
    playClick(undefined, beatCount % 4 === 0 ? 1200 : 900);
    onBeat(expectedAtMs);
    beatCount += 1;
    timer = window.setTimeout(tick, beatIntervalMs);
  };

  void resumeAudioContext().then(() => {
    tick();
  });

  return {
    stop: () => {
      if (timer !== null) window.clearTimeout(timer);
    },
  };
}
