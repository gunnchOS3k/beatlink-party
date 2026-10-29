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
  targetPitchHz?: number;
  intervalMs?: number;
  onFrame: (frame: LiveMicFrame) => void;
}

export interface LiveMicContinuousHandle {
  /** True only while a live MediaStream is feeding DSP (never synthetic tone). */
  readonly live: true;
  stop(): void;
}

/**
 * Continuous consented mic path: MediaStream PCM → AnalyserNode → DSP features.
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
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  source.connect(analyser);

  const targetPitchHz = options.targetPitchHz ?? 220;
  const intervalMs = Math.max(50, options.intervalMs ?? 100);
  const buf = new Float32Array(analyser.fftSize);
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buf);
    // Copy then discard — do not retain analyser buffer beyond this frame.
    const pcm = Float32Array.from(buf);
    const score = scoreKaraokeDsp(pcm, {
      targetPitchHz,
      sampleRate: ctx.sampleRate || 48000,
      window: { startMs: 0, endMs: (pcm.length / (ctx.sampleRate || 48000)) * 1000 },
    });
    options.onFrame({
      features: score.features,
      score,
      recording: false,
      pcmRetained: false,
    });
  };

  void ctx.resume().catch(() => undefined);
  tick();
  const timer = setInterval(tick, intervalMs);

  return {
    live: true,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
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
