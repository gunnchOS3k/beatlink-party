/**
 * Karaoke digital path — mic permission abstraction + no-recording default.
 * CI uses synthetic signals only; never captures or stores real audio.
 */

export type MicPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable' | 'no_recording';

export interface MicPermissionAdapter {
  readonly id: string;
  query(): Promise<MicPermissionState> | MicPermissionState;
  /** Request permission — must not start recording buffers. */
  request(): Promise<MicPermissionState>;
  /** Explicitly refuse capture (default party-safe path). */
  enableNoRecordingMode(): MicPermissionState;
}

export interface KaraokeMicSession {
  permission: MicPermissionState;
  recordingEnabled: boolean;
  /** When true, score from timing/prompts only — no PCM retention. */
  noRecording: boolean;
  signalSource: 'none' | 'synthetic' | 'live_ephemeral';
}

/** Deterministic synthetic amplitude envelope for CI karaoke scoring tests. */
export function synthesizeKaraokeEnvelope(options: {
  durationMs: number;
  sampleRate?: number;
  phrasePeaksMs: number[];
}): Float32Array {
  const sampleRate = options.sampleRate ?? 16000;
  const n = Math.floor((options.durationMs / 1000) * sampleRate);
  const out = new Float32Array(n);
  for (const peakMs of options.phrasePeaksMs) {
    const center = Math.floor((peakMs / 1000) * sampleRate);
    const width = Math.floor(0.08 * sampleRate);
    for (let i = -width; i <= width; i++) {
      const idx = center + i;
      if (idx < 0 || idx >= n) continue;
      const env = 1 - Math.abs(i) / width;
      out[idx] = Math.max(out[idx]!, env);
    }
  }
  return out;
}

export function scoreSyntheticKaraokeSignal(
  envelope: Float32Array,
  promptCenterMs: number,
  sampleRate = 16000,
  windowMs = 400,
): { energy: number; inWindow: boolean; gradeHint: 'perfect' | 'great' | 'good' | 'miss' } {
  const center = Math.floor((promptCenterMs / 1000) * sampleRate);
  const half = Math.floor((windowMs / 2000) * sampleRate);
  let peak = 0;
  let energy = 0;
  let count = 0;
  for (let i = center - half; i <= center + half; i++) {
    if (i < 0 || i >= envelope.length) continue;
    const v = envelope[i]!;
    peak = Math.max(peak, v);
    energy += v;
    count += 1;
  }
  const avg = count === 0 ? 0 : energy / count;
  // Peak dominates grading — wide windows dilute averages around short phrase bursts.
  const score = Math.max(peak, avg * 2);
  const inWindow = score >= 0.35;
  let gradeHint: 'perfect' | 'great' | 'good' | 'miss' = 'miss';
  if (score >= 0.85) gradeHint = 'perfect';
  else if (score >= 0.6) gradeHint = 'great';
  else if (score >= 0.35) gradeHint = 'good';
  return { energy: score, inWindow, gradeHint };
}

/** In-memory adapter for Node/CI — never touches getUserMedia. */
export class SyntheticMicPermissionAdapter implements MicPermissionAdapter {
  readonly id = 'synthetic_ci';
  private state: MicPermissionState = 'prompt';
  private noRecording = true;

  query(): MicPermissionState {
    return this.noRecording ? 'no_recording' : this.state;
  }

  async request(): Promise<MicPermissionState> {
    if (this.noRecording) {
      this.state = 'no_recording';
      return this.state;
    }
    this.state = 'granted';
    return this.state;
  }

  enableNoRecordingMode(): MicPermissionState {
    this.noRecording = true;
    this.state = 'no_recording';
    return this.state;
  }

  /** Test helper — simulate user denying mic while staying no-recording safe. */
  simulateDenied(): MicPermissionState {
    this.noRecording = false;
    this.state = 'denied';
    return this.state;
  }

  disableNoRecordingForTests(): void {
    this.noRecording = false;
    this.state = 'prompt';
  }
}

/** Browser adapter stub — queries Permissions API when present; never records. */
export class BrowserMicPermissionAdapter implements MicPermissionAdapter {
  readonly id = 'browser';
  private noRecording = true;
  private cached: MicPermissionState = 'prompt';

  enableNoRecordingMode(): MicPermissionState {
    this.noRecording = true;
    this.cached = 'no_recording';
    return this.cached;
  }

  async query(): Promise<MicPermissionState> {
    if (this.noRecording) return 'no_recording';
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return 'unavailable';
    }
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      this.cached =
        result.state === 'granted' ? 'granted' : result.state === 'denied' ? 'denied' : 'prompt';
      return this.cached;
    } catch {
      return 'unavailable';
    }
  }

  async request(): Promise<MicPermissionState> {
    if (this.noRecording) return 'no_recording';
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.cached = 'unavailable';
      return this.cached;
    }
    try {
      // Ephemeral permission probe — tracks stopped immediately; no MediaRecorder.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      for (const track of stream.getTracks()) track.stop();
      this.cached = 'granted';
      return this.cached;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      this.cached =
        name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'unavailable';
      return this.cached;
    }
  }
}

export function openKaraokeMicSession(
  adapter: MicPermissionAdapter,
  options: { preferNoRecording?: boolean } = {},
): KaraokeMicSession {
  const preferNoRecording = options.preferNoRecording !== false;
  if (preferNoRecording) {
    adapter.enableNoRecordingMode();
  }
  const permission = adapter.query() as MicPermissionState;
  const noRecording = permission === 'no_recording' || preferNoRecording;
  return {
    permission: noRecording ? 'no_recording' : permission,
    recordingEnabled: false,
    noRecording,
    signalSource: noRecording ? 'synthetic' : 'none',
  };
}
