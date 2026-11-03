import { describe, it, expect } from 'vitest';
import {
  HOST_KARAOKE_STAGE_HONESTY,
  assessHostKaraokeStage,
} from '../packages/game-engine/src/hostKaraokeStage.js';

describe('host karaoke stage — phrases without host pitch claim', () => {
  it('shows prompts when karaoke + phrases; never claims host/physical mic', () => {
    const empty = assessHostKaraokeStage({
      modeIsKaraoke: true,
      phraseCount: 0,
      anyPlayerPitchClaim: false,
      secureOriginHost: true,
    });
    expect(empty.promptsVisible).toBe(false);

    const stage = assessHostKaraokeStage({
      modeIsKaraoke: true,
      phraseCount: 4,
      anyPlayerPitchClaim: true,
      secureOriginHost: true,
    });
    expect(stage.promptsVisible).toBe(true);
    expect(stage.hostPitchClaimed).toBe(false);
    expect(stage.playerPitchObserved).toBe(true);
    expect(stage.physicalMicAccepted).toBe(false);
    expect(stage.a11yTapFallbackAvailable).toBe(true);
    expect(stage.honestyBanner).toContain('host_pitch=false');
    expect(stage.honestyBanner).toContain(HOST_KARAOKE_STAGE_HONESTY.slice(0, 24));
  });
});
