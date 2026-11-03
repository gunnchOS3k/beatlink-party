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

/** Soft sustained tone for original / PD / CC phrase beds — still synthesized locally. */
function playSustain(frequency: number, durationSec = 0.28, gain = 0.08): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, durationSec));
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + durationSec + 0.02);
}

/** Concert-stage pad layer under the note bed. */
function playStagePad(frequency: number, durationSec: number, gain = 0.035): void {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(2400, frequency * 4);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.08);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.2, durationSec));
  osc.connect(filter);
  filter.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + durationSec + 0.05);
}

/**
 * Prefer rights-cleared catalog WAV when present; fall back to note-synced synth bed.
 * Never fetches platform streams / DRM / lyric scrapes.
 */
export async function startHostCatalogAudio(opts: {
  bpm: number;
  offsetMs: number;
  durationMs: number;
  startedAtMs: number;
  noteTimesMs?: number[];
  phraseWindowsMs?: Array<{ startMs: number; durationMs: number; targetPitchHz?: number }>;
  /** Public URL for content/songs/audio/*.wav when served. */
  audioUrl?: string | null;
}): Promise<MetronomeHandle> {
  if (opts.audioUrl) {
    try {
      const ctx = getAudioContext();
      await resumeAudioContext();
      const res = await fetch(opts.audioUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf.slice(0));
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = audio;
        gain.gain.value = 0.55;
        source.connect(gain);
        gain.connect(ctx.destination);
        const elapsedSec = Math.max(0, (Date.now() - opts.startedAtMs + opts.offsetMs) / 1000);
        const startAt = ctx.currentTime + 0.02;
        source.start(startAt, Math.min(elapsedSec, Math.max(0, audio.duration - 0.05)));
        // Layer sparse note accents on top of the WAV for stage punch.
        const accents = startHostSongBed({
          ...opts,
          // Quiet accent path — WAV carries the bed.
          noteTimesMs: (opts.noteTimesMs ?? []).filter((_, i) => i % 4 === 0),
        });
        return {
          stop: () => {
            try {
              source.stop();
            } catch {
              /* already stopped */
            }
            accents.stop();
          },
        };
      }
    } catch {
      // Fall through to procedural bed.
    }
  }
  return startHostSongBed(opts);
}

/**
 * Note-synced original song bed for approved catalog / original / PD / CC paths.
 * Schedules pitched note attacks + optional phrase sustains from vocal prompt windows.
 * Synthesized on-device only — never a ripped commercial stem / DRM / lyric scrape.
 */
export function startHostSongBed(opts: {
  bpm: number;
  offsetMs: number;
  durationMs: number;
  startedAtMs: number;
  /** Chart note times in ms from song start. */
  noteTimesMs?: number[];
  /** Optional karaoke phrase windows for soft sustained pads (rights-cleared prompts only). */
  phraseWindowsMs?: Array<{ startMs: number; durationMs: number; targetPitchHz?: number }>;
}): MetronomeHandle {
  const ctx = getAudioContext();
  void resumeAudioContext();
  const timers: number[] = [];
  const noteTimes = [...(opts.noteTimesMs ?? [])].sort((a, b) => a - b);
  const phrases = [...(opts.phraseWindowsMs ?? [])].sort((a, b) => a.startMs - b.startMs);

  if (noteTimes.length === 0 && phrases.length === 0) {
    // Fall back to metronome bed when chart notes are unavailable.
    return startHostMetronome(opts);
  }

  // Original triad motif across the chart — not a commercial melody rip.
  const motif = [196, 247, 294, 330, 392, 330, 294, 247];

  for (let i = 0; i < noteTimes.length; i++) {
    const noteMs = noteTimes[i]!;
    const waitMs = Math.max(
      0,
      noteMs - (Date.now() - opts.startedAtMs) - opts.offsetMs,
    );
    if (noteMs > opts.durationMs + 500) continue;
    const id = window.setTimeout(() => {
      playClick(undefined, motif[i % motif.length], 0.06);
      // Light fifth harmony — original arrangement depth beyond single-click beds.
      if (i % 2 === 0) playClick(undefined, motif[i % motif.length]! * 1.5, 0.04);
      if (i % 8 === 0) playStagePad(motif[i % motif.length]! / 2, 0.55, 0.03);
    }, waitMs);
    timers.push(id);
  }

  for (let i = 0; i < phrases.length; i++) {
    const phrase = phrases[i]!;
    const waitMs = Math.max(
      0,
      phrase.startMs - (Date.now() - opts.startedAtMs) - opts.offsetMs,
    );
    if (phrase.startMs > opts.durationMs + 500) continue;
    const id = window.setTimeout(() => {
      const root =
        phrase.targetPitchHz && phrase.targetPitchHz > 0
          ? phrase.targetPitchHz
          : motif[i % motif.length]!;
      const dur = Math.min(1.4, Math.max(0.22, phrase.durationMs / 1000));
      playSustain(root, dur, 0.08);
      playSustain(root * 1.25, dur * 0.85, 0.05);
      playStagePad(root * 0.5, dur * 1.1, 0.04);
    }, waitMs);
    timers.push(id);
  }

  // Soft downbeat pulse under the song bed for stage energy.
  const pulse = startHostMetronome({
    ...opts,
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
