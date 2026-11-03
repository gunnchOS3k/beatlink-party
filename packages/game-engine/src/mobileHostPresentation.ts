/**
 * Mobile host / presentation pairing — docked TV host + handheld player roles.
 * CSS presentation tiers and browser viewports are NOT physical phone/TV acceptance.
 */

export type PresentationTier = 'browser_host' | 'docked_tv' | 'handheld_player' | 'unknown';

export interface MobileHostPresentationPlan {
  hostRoleId: 'docked';
  playerRoleId: 'handheld_hybrid';
  hostTier: PresentationTier;
  playerTier: PresentationTier;
  /** Always false — viewport/CSS ≠ physical device pass. */
  physicalPhoneAccepted: false;
  /** Always false — docked CSS ≠ physical TV acceptance. */
  physicalTvAccepted: false;
  honestyBanner: string;
}

export const MOBILE_HOST_PRESENTATION_HONESTY =
  'Presentation CSS / browser viewport ≠ physical phone or TV acceptance. PHYSICAL_LAN_REVIEW_PACKET required for device pass.';

/** Canonical digital pairing for host stage + phone-shaped controller. */
export function planMobileHostPresentation(opts?: {
  hostRoleId?: string;
  playerRoleId?: string;
}): MobileHostPresentationPlan {
  const hostRoleId = 'docked' as const;
  const playerRoleId = 'handheld_hybrid' as const;
  const hostTier: PresentationTier =
    opts?.hostRoleId === 'docked' || !opts?.hostRoleId ? 'docked_tv' : 'browser_host';
  const playerTier: PresentationTier =
    opts?.playerRoleId === 'handheld_hybrid' || !opts?.playerRoleId
      ? 'handheld_player'
      : 'unknown';
  return {
    hostRoleId,
    playerRoleId,
    hostTier,
    playerTier,
    physicalPhoneAccepted: false,
    physicalTvAccepted: false,
    honestyBanner: `MOBILE_HOST_PRESENTATION host=${hostTier} player=${playerTier} · physical_phone=false · physical_tv=false · ${MOBILE_HOST_PRESENTATION_HONESTY}`,
  };
}

export function mobileHostPresentationBanner(plan: MobileHostPresentationPlan = planMobileHostPresentation()): string {
  return plan.honestyBanner;
}

/** Infer presentation tier from device-ux role id without claiming hardware. */
export function presentationTierForRole(roleId: string | null | undefined): PresentationTier {
  if (roleId === 'docked') return 'docked_tv';
  if (roleId === 'handheld_hybrid') return 'handheld_player';
  if (roleId === 'student_14_5' || roleId === 'ds_xl_coder') return 'browser_host';
  return 'unknown';
}
