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
