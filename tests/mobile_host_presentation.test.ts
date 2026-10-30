import { describe, it, expect } from 'vitest';
import {
  MOBILE_HOST_PRESENTATION_HONESTY,
  mobileHostPresentationBanner,
  planMobileHostPresentation,
  presentationTierForRole,
} from '../packages/game-engine/src/mobileHostPresentation.js';

describe('mobile host / presentation — CSS ≠ physical device', () => {
  it('plans docked host + handheld player without physical claims', () => {
    const plan = planMobileHostPresentation();
    expect(plan.hostRoleId).toBe('docked');
    expect(plan.playerRoleId).toBe('handheld_hybrid');
    expect(plan.hostTier).toBe('docked_tv');
    expect(plan.playerTier).toBe('handheld_player');
    expect(plan.physicalPhoneAccepted).toBe(false);
    expect(plan.physicalTvAccepted).toBe(false);
    expect(mobileHostPresentationBanner(plan)).toContain('physical_phone=false');
    expect(mobileHostPresentationBanner(plan)).toContain(MOBILE_HOST_PRESENTATION_HONESTY.slice(0, 24));
  });

  it('maps device-ux roles to presentation tiers', () => {
    expect(presentationTierForRole('docked')).toBe('docked_tv');
    expect(presentationTierForRole('handheld_hybrid')).toBe('handheld_player');
    expect(presentationTierForRole('student_14_5')).toBe('browser_host');
  });
});
