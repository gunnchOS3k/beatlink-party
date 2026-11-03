import { describe, it, expect } from 'vitest';
import {
  HOST_DIGITAL_STEPS,
  assessHostPauseResumeClock,
  buildHostDigitalWorkflow,
  hostDigitalCompletionPercent,
  hostDigitalHonestyBanner,
  inferHostDigitalDone,
} from '../packages/game-engine/src/hostDigitalWorkflow.js';

describe('host digital workflow — browser/loopback only', () => {
  it('tracks create→calibrate→play→results without physical phone claim', () => {
    const done = inferHostDigitalDone({
      hasRoom: true,
      playerCount: 2,
      readyCount: 2,
      hasSong: true,
      hasMode: true,
      phase: 'playing',
      calibrated: true,
      pausedOnce: true,
      resumedOnce: true,
    });
    const steps = buildHostDigitalWorkflow(done);
    expect(steps).toHaveLength(HOST_DIGITAL_STEPS.length);
    expect(hostDigitalCompletionPercent(steps)).toBeGreaterThanOrEqual(70);
    expect(hostDigitalHonestyBanner({ workflowPercent: 70, physicalPhoneClaimed: false })).toContain(
      'physical_phone=false',
    );
    expect(hostDigitalHonestyBanner({ workflowPercent: 70 }).toLowerCase()).toContain(
      'claimedpassed=false',
    );
  });

  it('pause/resume clock drift forces resync assessment', () => {
    const a = assessHostPauseResumeClock({
      clientGameTimeMs: 1000,
      serverGameTimeMs: 5000,
      wasPaused: true,
    });
    expect(a.requiresResync).toBe(true);
    expect(a.claimedPassed).toBe(false);
  });
});
