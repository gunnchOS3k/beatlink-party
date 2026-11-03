/**
 * Live getUserMedia karaoke mic pipeline.
 * Ephemeral analysis only — never records, uploads, or retains PCM buffers.
 */

import {
  extractKaraokeDspFeatures,
  scoreKaraokeDsp,
  type KaraokeDspFeatures,
  type KaraokeDspScore,
} from './karaokeDsp.js';
import type { MicPermissionAdapter, MicPermissionState, KaraokeMicSession } from './karaokeMic.js';

export type MicStreamFactory = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

export interface LiveMicPipelineOptions {
  /** Target pitch for scoring (Hz). */
  targetPitchHz?: number;
  sampleRate?: number;
  /** When true (default), refuse capture and stay privacy-safe. */
  preferNoRecording?: boolean;
  getUserMedia?: MicStreamFactory;
}

export interface LiveMicFrame {
  features: KaraokeDspFeatures;
  score: KaraokeDspScore;
  /** Always false — pipeline never enables MediaRecorder / file capture. */
  recording: false;
  /** PCM was analyzed then discarded. */
  pcmRetained: false;
}

export interface LiveMicPipeline {
  readonly id: 'live_getUserMedia';
  permission: MicPermissionState;
  session: KaraokeMicSession;
  start(): Promise<MicPermissionState>;
  /** Pull one analysis frame from the live (or synthetic) stream; discards samples. */
  analyzeFrame(pcm: Float32Array, window?: { startMs: number; endMs: number }): LiveMicFrame;
  stop(): void;
  /** Test/CI: inject synthetic MediaStream-like PCM without browser APIs. */
  ingestSyntheticPcm(pcm: Float32Array): LiveMicFrame;
}

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('getUserMedia unavailable'));
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * Browser live mic adapter — calls real getUserMedia when opted in.
 * Default party path remains no-recording.
 */
export class LiveGetUserMediaAdapter implements MicPermissionAdapter {
  readonly id = 'live_getUserMedia';
  private noRecording = true;
  private cached: MicPermissionState = 'prompt';
  private stream: MediaStream | null = null;
  private getUserMedia: MicStreamFactory;

  constructor(options: { getUserMedia?: MicStreamFactory } = {}) {
    this.getUserMedia = options.getUserMedia ?? defaultGetUserMedia;
  }

  enableNoRecordingMode(): MicPermissionState {
    this.noRecording = true;
    this.cached = 'no_recording';
    this.stopTracks();
    return this.cached;
  }

  /** Opt-in ephemeral capture (still no recording buffers retained by Beat Link). */
  allowEphemeralCapture(): void {
    this.noRecording = false;
    if (this.cached === 'no_recording') this.cached = 'prompt';
  }

  async query(): Promise<MicPermissionState> {
    if (this.noRecording) return 'no_recording';
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return this.cached === 'granted' ? 'granted' : 'unavailable';
    }
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      this.cached =
        result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'prompt';
      return this.cached;
    } catch {
      return this.cached;
    }
  }

  async request(): Promise<MicPermissionState> {
    if (this.noRecording) {
      this.cached = 'no_recording';
      return this.cached;
    }
    try {
      this.stopTracks();
      this.stream = await this.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.cached = 'granted';
      return this.cached;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      this.cached =
        name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'unavailable';
      this.stream = null;
      return this.cached;
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stopTracks(): void {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
    this.stream = null;
  }
}

export function openLiveMicPipeline(
  options: LiveMicPipelineOptions = {},
): LiveMicPipeline {
  const preferNoRecording = options.preferNoRecording !== false;
  const adapter = new LiveGetUserMediaAdapter({ getUserMedia: options.getUserMedia });
  if (preferNoRecording) {
    adapter.enableNoRecordingMode();
  } else {
    adapter.allowEphemeralCapture();
  }

  const targetPitchHz = options.targetPitchHz ?? 220;
  let permission: MicPermissionState = preferNoRecording ? 'no_recording' : 'prompt';

  const analyze = (pcm: Float32Array, window?: { startMs: number; endMs: number }): LiveMicFrame => {
    const score = scoreKaraokeDsp(pcm, {
      targetPitchHz,
      sampleRate: options.sampleRate ?? 16000,
      window: window ?? { startMs: 0, endMs: (pcm.length / (options.sampleRate ?? 16000)) * 1000 },
    });
    // Intentionally drop references — no MediaRecorder, no upload, no ring buffer retention API.
    return {
      features: score.features,
      score,
      recording: false,
      pcmRetained: false,
    };
  };

  return {
    id: 'live_getUserMedia',
    get permission() {
      return permission;
    },
    get session(): KaraokeMicSession {
      const noRecording = permission === 'no_recording' || preferNoRecording;
      return {
        permission,
        recordingEnabled: false,
        noRecording,
        signalSource: noRecording
          ? 'synthetic'
          : permission === 'granted'
            ? 'live_ephemeral'
            : 'none',
      };
    },
    async start() {
      permission = await adapter.request();
      return permission;
    },
    analyzeFrame: analyze,
    ingestSyntheticPcm: analyze,
    stop() {
      adapter.stopTracks();
      if (!preferNoRecording && permission === 'granted') {
        permission = 'prompt';
      }
    },
  };
}

/** Detect simple onset (energy jump) for calibration taps — ephemeral PCM only. */
export function detectOnset(
  pcm: Float32Array,
  options: { threshold?: number; sampleRate?: number } = {},
): { onset: boolean; rms: number; peak: number } {
  const features = extractKaraokeDspFeatures(pcm, options.sampleRate ?? 16000);
  const threshold = options.threshold ?? 0.12;
  return {
    onset: features.rms >= threshold || features.peak >= threshold * 1.5,
    rms: features.rms,
    peak: features.peak,
  };
}

export interface LiveMicContinuousOptions {
  /** Static target, or getter so phrase targets can track the active vocal prompt. */
  targetPitchHz?: number | (() => number);
  intervalMs?: number;
  /** Analysis window in ms (default 80). Must be ≥50ms at browser sample rates. */
  frameDurationMs?: number;
  onFrame: (frame: LiveMicFrame) => void;
  /** Fired when stream ends, mutes, or AudioContext leaves running — claim must drop. */
  onLifecycleEnd?: (reason: 'ended' | 'muted' | 'suspended' | 'unavailable') => void;
}

export interface LiveMicContinuousHandle {
  /**
   * True only while a live MediaStream is feeding DSP with a running AudioContext
   * (never synthetic tone). Becomes false after stop / track end / suspend.
   */
  readonly live: boolean;
  /** Update target pitch mid-session (active phrase change). */
  setTargetPitchHz(hz: number): void;
  stop(): void;
}

/**
 * Continuous consented mic path: MediaStream PCM → AnalyserNode → ring buffer → DSP.
 * Accumulates ≥50ms of samples so 44.1/48 kHz browsers are not rejected by the
 * pitch estimator (a single fftSize=2048 frame is only ~42–46ms at those rates).
 * Never records, uploads, or retains PCM beyond the current analysis tick.
 * Returns null when Web Audio is unavailable — callers must keep pitch claims false.
 */
export function startLiveMicContinuousAnalysis(
  stream: MediaStream,
  options: LiveMicContinuousOptions,
): LiveMicContinuousHandle | null {
  const AudioCtx =
    typeof globalThis !== 'undefined'
      ? (globalThis as typeof globalThis & {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        }).AudioContext ??
        (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AudioCtx) return null;

  const tracks = stream.getAudioTracks();
  if (!tracks.length || tracks.every((t) => t.readyState === 'ended')) return null;

  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  // 2048 is fine for hops; we accumulate into a longer ring for pitch.
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.15;
  source.connect(analyser);

  let targetPitchHz =
    typeof options.targetPitchHz === 'function'
      ? options.targetPitchHz()
      : (options.targetPitchHz ?? 220);
  const resolveTarget = () =>
    typeof options.targetPitchHz === 'function' ? options.targetPitchHz() : targetPitchHz;

  const intervalMs = Math.max(40, options.intervalMs ?? 80);
  const frameDurationMs = Math.max(50, options.frameDurationMs ?? 80);
  const hop = new Float32Array(analyser.fftSize);
  const sampleRate = () => ctx.sampleRate || 48000;
  const ringCapacity = Math.ceil(sampleRate() * (frameDurationMs / 1000) * 1.25);
  const ring = new Float32Array(Math.max(ringCapacity, analyser.fftSize * 2));
  let ringWrite = 0;
  let ringFilled = 0;
  let stopped = false;
  let live = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const appendHop = (chunk: Float32Array) => {
    for (let i = 0; i < chunk.length; i++) {
      ring[ringWrite] = chunk[i]!;
      ringWrite = (ringWrite + 1) % ring.length;
      ringFilled = Math.min(ring.length, ringFilled + 1);
    }
  };

  const snapshotWindow = (needed: number): Float32Array | null => {
    if (ringFilled < needed) return null;
    const out = new Float32Array(needed);
    let idx = (ringWrite - needed + ring.length) % ring.length;
    for (let i = 0; i < needed; i++) {
      out[i] = ring[idx]!;
      idx = (idx + 1) % ring.length;
    }
    return out;
  };

  const endLifecycle = (reason: 'ended' | 'muted' | 'suspended' | 'unavailable') => {
    if (stopped) return;
    live = false;
    options.onLifecycleEnd?.(reason);
    // Stop analysis but leave track cleanup to caller stop() / adapter.
    stopped = true;
    if (timer != null) clearInterval(timer);
    timer = null;
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {
      /* already torn down */
    }
    void ctx.close().catch(() => undefined);
  };

  const onTrackEnded = () => endLifecycle('ended');
  const onTrackMute = () => {
    // Mute alone does not always end the track; drop the live claim.
    live = false;
    options.onLifecycleEnd?.('muted');
  };

  for (const track of tracks) {
    track.addEventListener('ended', onTrackEnded);
    track.addEventListener('mute', onTrackMute);
  }

  const tick = () => {
    if (stopped) return;
    if (ctx.state === 'closed') {
      endLifecycle('unavailable');
      return;
    }
    if (ctx.state === 'suspended') {
      live = false;
      options.onLifecycleEnd?.('suspended');
      void ctx.resume().catch(() => undefined);
      return;
    }
    if (tracks.every((t) => t.readyState === 'ended')) {
      endLifecycle('ended');
      return;
    }
    if (tracks.every((t) => t.muted)) {
      live = false;
      options.onLifecycleEnd?.('muted');
      return;
    }

    analyser.getFloatTimeDomainData(hop);
    appendHop(hop);

    const sr = sampleRate();
    const needed = Math.ceil(sr * (frameDurationMs / 1000));
    const pcm = snapshotWindow(needed);
    if (!pcm) return;

    const hz = resolveTarget();
    const score = scoreKaraokeDsp(pcm, {
      targetPitchHz: hz,
      sampleRate: sr,
      window: { startMs: 0, endMs: (pcm.length / sr) * 1000 },
    });
    live = true;
    options.onFrame({
      features: score.features,
      score,
      recording: false,
      pcmRetained: false,
    });
  };

  timer = setInterval(tick, intervalMs);

  // Only mark live after AudioContext actually reaches running.
  void ctx
    .resume()
    .then(() => {
      if (stopped) return;
      if (ctx.state === 'running') {
        live = true;
        tick();
      } else {
        live = false;
        options.onLifecycleEnd?.('suspended');
      }
    })
    .catch(() => {
      live = false;
      options.onLifecycleEnd?.('unavailable');
    });

  return {
    get live() {
      return live && !stopped;
    },
    setTargetPitchHz(hz: number) {
      targetPitchHz = hz;
    },
    stop() {
      stopped = true;
      live = false;
      if (timer != null) clearInterval(timer);
      timer = null;
      for (const track of tracks) {
        track.removeEventListener('ended', onTrackEnded);
        track.removeEventListener('mute', onTrackMute);
      }
      try {
        source.disconnect();
        analyser.disconnect();
      } catch {
        /* already torn down */
      }
      void ctx.close().catch(() => undefined);
    },
  };
}

/**
 * Honesty helper: synthetic PCM probes never authorize a MICROPHONE_PITCH_ANALYSIS claim.
 * Pitch is active only while continuous live analysis is running on a consented stream.
 */
export function microphonePitchAnalysisClaim(opts: {
  micConsent: MicPermissionState;
  continuousLive: boolean;
}): boolean {
  return opts.micConsent === 'granted' && opts.continuousLive === true;
}

/**
 * Build a synthetic MediaStream-like stub for Node/CI tests.
 * Does not require browser getUserMedia; tracks are stoppable no-ops.
 */
export function createSyntheticMediaStream(): MediaStream {
  const trackState = { readyState: 'live' as MediaStreamTrackState };
  const track = {
    kind: 'audio',
    id: 'synthetic-audio',
    label: 'beatlink-synthetic',
    enabled: true,
    muted: false,
    get readyState() {
      return trackState.readyState;
    },
    stop() {
      trackState.readyState = 'ended';
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
    clone() {
      return this as unknown as MediaStreamTrack;
    },
    getConstraints() {
      return {};
    },
    getSettings() {
      return {};
    },
    getCapabilities() {
      return {};
    },
    applyConstraints() {
      return Promise.resolve();
    },
    contentHint: '',
    onended: null,
    onmute: null,
    onunmute: null,
  } as unknown as MediaStreamTrack;

  return {
    id: 'synthetic-stream',
    active: true,
    getAudioTracks() {
      return [track];
    },
    getVideoTracks() {
      return [];
    },
    getTracks() {
      return [track];
    },
    getTrackById() {
      return track;
    },
    addTrack() {},
    removeTrack() {},
    clone() {
      return createSyntheticMediaStream();
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
    onaddtrack: null,
    onremovetrack: null,
  } as unknown as MediaStream;
}
