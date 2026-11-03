/**
 * Karaoke secure-context gate for getUserMedia.
 * isSecureContext / HTTPS ≠ physical phone mic acceptance or commercial clearance.
 * Insecure origins never authorize MICROPHONE_PITCH_ANALYSIS.
 */

export interface KaraokeSecureContextInput {
  isSecureContext: boolean;
  protocol?: string;
  hostname?: string;
}

export interface KaraokeSecureContextAssessment {
  /** Browser may offer getUserMedia (secure context). */
  micPathEligible: boolean;
  insecureBlocked: boolean;
  /** localhost / 127.0.0.1 secure context — still not a phone. */
  loopbackSecure: boolean;
  /** Always false — secure origin ≠ physical device mic grant on LAN. */
  physicalPhoneMicAccepted: false;
  honestyBanner: string;
  rejectedReason: string | null;
}

export const KARAOKE_SECURE_CONTEXT_HONESTY =
  'Secure context / HTTPS enables getUserMedia path only — not physical phone mic acceptance. Synthetic MediaStream ≠ device mic.';

function isLoopbackHost(hostname: string | undefined): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

export function assessKaraokeSecureContext(
  input: KaraokeSecureContextInput,
): KaraokeSecureContextAssessment {
  const loopbackSecure = input.isSecureContext && isLoopbackHost(input.hostname);
  if (!input.isSecureContext) {
    return {
      micPathEligible: false,
      insecureBlocked: true,
      loopbackSecure: false,
      physicalPhoneMicAccepted: false,
      honestyBanner: `KARAOKE_SECURE_CONTEXT micPathEligible=false insecureBlocked=true · physical_phone_mic=false · ${KARAOKE_SECURE_CONTEXT_HONESTY}`,
      rejectedReason: 'insecure_origin',
    };
  }
  return {
    micPathEligible: true,
    insecureBlocked: false,
    loopbackSecure,
    physicalPhoneMicAccepted: false,
    honestyBanner: `KARAOKE_SECURE_CONTEXT micPathEligible=true loopbackSecure=${loopbackSecure} · physical_phone_mic=false · ${KARAOKE_SECURE_CONTEXT_HONESTY}`,
    rejectedReason: null,
  };
}

/**
 * Combine secure-context gate with server pitch-claim bound honesty:
 * insecure origins never authorize pitch even if client sends flags.
 */
export function karaokePitchPathAllowed(args: {
  secure: KaraokeSecureContextAssessment;
  serverPitchAnalysisActive: boolean;
}): boolean {
  return args.secure.micPathEligible && args.serverPitchAnalysisActive === true;
}
