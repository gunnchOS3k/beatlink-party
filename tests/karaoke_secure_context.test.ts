import { describe, it, expect } from 'vitest';
import {
  assessKaraokeSecureContext,
  karaokePitchPathAllowed,
} from '../packages/game-engine/src/karaokeSecureContext.js';

describe('karaoke secure context — HTTPS ≠ physical mic acceptance', () => {
  it('blocks pitch path on insecure origins', () => {
    const insecure = assessKaraokeSecureContext({
      isSecureContext: false,
      protocol: 'http:',
      hostname: '192.168.1.20',
    });
    expect(insecure.micPathEligible).toBe(false);
    expect(insecure.insecureBlocked).toBe(true);
    expect(insecure.physicalPhoneMicAccepted).toBe(false);
    expect(insecure.rejectedReason).toBe('insecure_origin');
    expect(karaokePitchPathAllowed({ secure: insecure, serverPitchAnalysisActive: true })).toBe(
      false,
    );
  });

  it('allows mic path on secure loopback without claiming phone', () => {
    const secure = assessKaraokeSecureContext({
      isSecureContext: true,
      protocol: 'https:',
      hostname: 'localhost',
    });
    expect(secure.micPathEligible).toBe(true);
    expect(secure.loopbackSecure).toBe(true);
    expect(secure.physicalPhoneMicAccepted).toBe(false);
    expect(karaokePitchPathAllowed({ secure, serverPitchAnalysisActive: true })).toBe(true);
    expect(karaokePitchPathAllowed({ secure, serverPitchAnalysisActive: false })).toBe(false);
  });
});
