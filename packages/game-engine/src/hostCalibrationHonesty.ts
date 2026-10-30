/**
 * Host calibration honesty — digital tap samples ≠ physical LAN timing pass.
 */

import type { CalibrationResult } from './calibration.js';
import { PROPOSED_PARTY_TIMING_BUDGET } from './partyTimingBudget.js';

export interface HostCalibrationHonestyReport {
  calibrationAccepted: boolean;
  offsetMs: number;
  timingBudgetClaimedPassed: false;
  /** Always false — browser calibration ≠ physical multi-phone pass. */
  physicalLanTimingAccepted: false;
  honestyBanner: string;
}

export const HOST_CALIBRATION_HONESTY =
  'Digital host calibration offset ≠ physical LAN multi-phone timing acceptance; claimedPassed stays false.';

export function assessHostCalibrationHonesty(
  calibration: Pick<CalibrationResult, 'accepted' | 'offsetMs'>,
): HostCalibrationHonestyReport {
  return {
    calibrationAccepted: calibration.accepted === true,
    offsetMs: calibration.offsetMs,
    timingBudgetClaimedPassed: false,
    physicalLanTimingAccepted: false,
    honestyBanner: `HOST_CALIBRATION accepted=${calibration.accepted === true} offsetMs=${calibration.offsetMs} timing_claimedPassed=${PROPOSED_PARTY_TIMING_BUDGET.claimedPassed} · physical_lan_timing=false · ${HOST_CALIBRATION_HONESTY}`,
  };
}
