import { describe, it, expect } from 'vitest';
import { computeCalibrationOffset } from '../packages/game-engine/src/calibration.js';
import {
  HOST_CALIBRATION_HONESTY,
  assessHostCalibrationHonesty,
} from '../packages/game-engine/src/hostCalibrationHonesty.js';

describe('host calibration honesty — digital ≠ physical LAN', () => {
  it('accepts stable digital samples without physical timing claim', () => {
    const cal = computeCalibrationOffset([
      { expectedMs: 0, tappedMs: 40 },
      { expectedMs: 500, tappedMs: 545 },
      { expectedMs: 1000, tappedMs: 1035 },
      { expectedMs: 1500, tappedMs: 1540 },
    ]);
    expect(cal.accepted).toBe(true);
    const honesty = assessHostCalibrationHonesty(cal);
    expect(honesty.calibrationAccepted).toBe(true);
    expect(honesty.timingBudgetClaimedPassed).toBe(false);
    expect(honesty.physicalLanTimingAccepted).toBe(false);
    expect(honesty.honestyBanner).toContain('physical_lan_timing=false');
    expect(honesty.honestyBanner).toContain(HOST_CALIBRATION_HONESTY.slice(0, 20));
  });
});
