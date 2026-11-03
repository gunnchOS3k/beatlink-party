import { describe, it, expect } from 'vitest';
import {
  RIGHTS_ASSERTION_NOT_LEGAL_CLEARANCE,
  assessRightsLayers,
  describeRightsAssertionHonesty,
  firstPartyOriginalRightsLayers,
} from '../packages/game-engine/src/rightsLayers.js';

describe('authorized media honesty — syncEligible ≠ legal clearance', () => {
  it('describes gameplay gate without commercial or legal clearance claims', () => {
    const assessment = assessRightsLayers(firstPartyOriginalRightsLayers());
    const honesty = describeRightsAssertionHonesty(assessment);
    expect(honesty.gameplayGateOk).toBe(true);
    expect(honesty.syncEligible).toBe(true);
    expect(honesty.verifiedLegalClearance).toBe(false);
    expect(honesty.commercialEligible).toBe(false);
    expect(honesty.note).toBe(RIGHTS_ASSERTION_NOT_LEGAL_CLEARANCE);
  });
});
