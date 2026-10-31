/**
 * Rights honesty — composition ≠ sound recording.
 * CC sync / adaptation caveats; never rip / DRM / lyric scrape.
 */

export type RightsLayerKind = 'composition' | 'sound_recording' | 'sync' | 'adaptation' | 'lyrics';

export type CompositionRightsBasis =
  | 'first_party_original'
  | 'creator_attested'
  | 'creative_commons'
  | 'verified_public_domain'
  | 'licensed'
  | 'none';

export type SoundRecordingRightsBasis =
  | 'first_party_original'
  | 'creator_attested'
  | 'creative_commons'
  | 'verified_public_domain'
  | 'licensed'
  | 'none';

export interface CompositionRightsClaim {
  basis: CompositionRightsBasis;
  /** CC deed / license version when basis is creative_commons. */
  ccDeedUrl?: string | null;
  licenseVersion?: string | null;
  /**
   * Sync right for interactive gameplay timing overlays.
   * CC licenses often require separate evaluation — default false unless explicit.
   */
  syncAuthorized: boolean;
  /**
   * Adaptation / derivative charting (beatmaps as adaptations of the composition).
   * Many CC licenses allow adaptation with attribution; still must be explicit.
   */
  adaptationAuthorized: boolean;
  attributionText?: string | null;
}

export interface SoundRecordingRightsClaim {
  basis: SoundRecordingRightsBasis;
  ccDeedUrl?: string | null;
  licenseVersion?: string | null;
  /** Right to reproduce/play the master in-session (not a platform stream rip). */
  reproductionAuthorized: boolean;
  attributionText?: string | null;
}

export interface RightsLayerFinding {
  layer: RightsLayerKind;
  severity: 'info' | 'warn' | 'block';
  code: string;
  message: string;
}

export interface RightsLayersAssessment {
  ok: boolean;
  /** Both layers cleared for direct audio playback path. */
  directAudioEligible: boolean;
  /** Sync overlays for scoring (composition sync + recording reproduction). */
  syncEligible: boolean;
  findings: RightsLayerFinding[];
  caveats: string[];
}

const CC_SYNC_CAVEAT =
  'Creative Commons: "sync" for interactive rhythm gameplay is not automatic — confirm the deed allows public performance / adaptation for this use, keep attribution, and do not assume commercial sync clearance.';

const CC_ADAPTATION_CAVEAT =
  'Creative Commons adaptation (beatmaps / charts as derivatives) requires following ShareAlike / attribution terms when present. No lyric scrape.';

const COMPOSITION_VS_RECORDING =
  'Composition rights (songwriting) are distinct from sound-recording (master) rights. Clearing one does not clear the other.';

/**
 * Assess composition + sound-recording claims for direct HTTPS / catalog paths.
 */
export function assessRightsLayers(input: {
  composition: CompositionRightsClaim;
  soundRecording: SoundRecordingRightsClaim;
  /** If true, reject any path that looks like lyric scrape intent. */
  lyricScrapeAttempted?: boolean;
  drmBypassAttempted?: boolean;
  ripAttempted?: boolean;
}): RightsLayersAssessment {
  const findings: RightsLayerFinding[] = [];
  const caveats: string[] = [COMPOSITION_VS_RECORDING];

  if (input.ripAttempted) {
    findings.push({
      layer: 'sound_recording',
      severity: 'block',
      code: 'rip_forbidden',
      message: 'Platform ripping is never allowed.',
    });
  }
  if (input.drmBypassAttempted) {
    findings.push({
      layer: 'sound_recording',
      severity: 'block',
      code: 'drm_bypass_forbidden',
      message: 'DRM bypass is never allowed.',
    });
  }
  if (input.lyricScrapeAttempted) {
    findings.push({
      layer: 'lyrics',
      severity: 'block',
      code: 'lyric_scrape_forbidden',
      message: 'Lyric scrape is never allowed. Use creator-provided or licensed lyrics only.',
    });
  }

  if (input.composition.basis === 'none') {
    findings.push({
      layer: 'composition',
      severity: 'block',
      code: 'composition_missing',
      message: 'Composition rights not attested.',
    });
  }
  if (input.soundRecording.basis === 'none') {
    findings.push({
      layer: 'sound_recording',
      severity: 'block',
      code: 'recording_missing',
      message: 'Sound-recording (master) rights not attested.',
    });
  }

  if (input.composition.basis === 'creative_commons') {
    caveats.push(CC_SYNC_CAVEAT);
    caveats.push(CC_ADAPTATION_CAVEAT);
    if (!input.composition.ccDeedUrl && !input.composition.licenseVersion) {
      findings.push({
        layer: 'composition',
        severity: 'block',
        code: 'cc_deed_missing',
        message: 'CC composition claim requires deed URL or license version.',
      });
    }
    if (!input.composition.syncAuthorized) {
      findings.push({
        layer: 'sync',
        severity: 'warn',
        code: 'cc_sync_not_explicit',
        message: 'CC composition present but syncAuthorized=false — gameplay sync not granted.',
      });
    }
    if (!input.composition.adaptationAuthorized) {
      findings.push({
        layer: 'adaptation',
        severity: 'warn',
        code: 'cc_adaptation_not_explicit',
        message: 'CC adaptation/charting not explicitly authorized.',
      });
    }
  }

  if (input.soundRecording.basis === 'creative_commons') {
    caveats.push(CC_SYNC_CAVEAT);
    if (!input.soundRecording.reproductionAuthorized) {
      findings.push({
        layer: 'sound_recording',
        severity: 'block',
        code: 'cc_recording_no_reproduction',
        message: 'CC sound recording lacks reproductionAuthorized for in-session playback.',
      });
    }
  }

  if (
    input.composition.basis !== 'none' &&
    input.soundRecording.basis !== 'none' &&
    !input.soundRecording.reproductionAuthorized
  ) {
    findings.push({
      layer: 'sound_recording',
      severity: 'block',
      code: 'reproduction_not_authorized',
      message: 'Sound-recording reproduction not authorized for direct playback.',
    });
  }

  const hasBlock = findings.some((f) => f.severity === 'block');
  const compositionOk = input.composition.basis !== 'none';
  const recordingOk =
    input.soundRecording.basis !== 'none' && input.soundRecording.reproductionAuthorized;
  const syncEligible =
    !hasBlock &&
    compositionOk &&
    recordingOk &&
    input.composition.syncAuthorized &&
    input.composition.adaptationAuthorized;

  const directAudioEligible = !hasBlock && compositionOk && recordingOk;

  return {
    ok: directAudioEligible,
    directAudioEligible,
    syncEligible,
    findings,
    caveats,
  };
}

/** First-party / creator launch catalog helper — both layers original, sync+adaptation on. */
export function firstPartyOriginalRightsLayers(): {
  composition: CompositionRightsClaim;
  soundRecording: SoundRecordingRightsClaim;
} {
  return {
    composition: {
      basis: 'first_party_original',
      syncAuthorized: true,
      adaptationAuthorized: true,
      attributionText: 'BeatLink first-party original composition',
    },
    soundRecording: {
      basis: 'first_party_original',
      reproductionAuthorized: true,
      attributionText: 'BeatLink first-party original sound recording',
    },
  };
}

/**
 * Honesty boundary: assessRightsLayers / syncEligible are gameplay-gate assertions
 * from attested inputs — never verified legal clearance or commercial license review.
 */
export const RIGHTS_ASSERTION_NOT_LEGAL_CLEARANCE =
  'Fixture/attested rights.ok or syncEligible is a gameplay gate assertion — not verified legal clearance, commercial license review, or HUMAN/RC authority.';

export interface RightsAssertionHonesty {
  gameplayGateOk: boolean;
  syncEligible: boolean;
  /** Always false — machine attestation is not counsel-reviewed clearance. */
  verifiedLegalClearance: false;
  /** Always false until separate human commercial review. */
  commercialEligible: false;
  note: string;
}

export function describeRightsAssertionHonesty(
  assessment: RightsLayersAssessment,
): RightsAssertionHonesty {
  return {
    gameplayGateOk: assessment.ok,
    syncEligible: assessment.syncEligible,
    verifiedLegalClearance: false,
    commercialEligible: false,
    note: RIGHTS_ASSERTION_NOT_LEGAL_CLEARANCE,
  };
}
