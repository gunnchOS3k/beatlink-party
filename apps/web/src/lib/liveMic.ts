/** Browser helper — opt-in ephemeral live mic (never records). */
import {
  openLiveMicPipeline,
  type LiveMicPipeline,
  type LiveMicPipelineOptions,
} from '@beatlink/game-engine';

export function createHostLiveMic(options: LiveMicPipelineOptions = {}): LiveMicPipeline {
  return openLiveMicPipeline({
    preferNoRecording: options.preferNoRecording ?? true,
    ...options,
  });
}
