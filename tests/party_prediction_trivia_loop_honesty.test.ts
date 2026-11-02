import { describe, expect, it } from 'vitest';
import {
  PARTY_PREDICTION_TRIVIA_LOOP_HONESTY,
  PREDICTION_TRIVIA_MODE_ID,
  assessPartyPredictionTriviaLoopHonesty,
} from '../packages/game-engine/src/partyPredictionTriviaLoopHonesty.js';
import { SUGGESTED_RESULTS_DWELL_MS } from '../packages/game-engine/src/partyPacing.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('party Prediction Trivia loop honesty — non-karaoke digital continue', () => {
  it('keeps Prediction Trivia rematch digital-only and refuses rights elevation', () => {
    const report = assessPartyPredictionTriviaLoopHonesty({
      rematchRound: 1,
      phase: 'results',
      hasResults: true,
      resultsDwellMs: SUGGESTED_RESULTS_DWELL_MS,
      modeId: PREDICTION_TRIVIA_MODE_ID,
      karaokeModeActive: true,
      linkEqualsRipPermission: true,
      gameplaySyncAuthorized: true,
    });

    expect(report.modeId).toBe('PredictionTrivia');
    expect(report.predictionTriviaActive).toBe(true);
    expect(report.firstModeIsBeatTap).toBe(true);
    expect(report.karaokeModeActive).toBe(false);
    expect(report.rematch.rematchReady).toBe(true);
    expect(report.physicalPartyClaimed).toBe(false);
    expect(report.humanFirstFunClaimed).toBe(false);
    expect(report.LINK_EQUALS_RIP_PERMISSION).toBe(false);
    expect(report.GAMEPLAY_SYNC_AUTHORIZED).toBe(false);
    expect(report.criticRisk).toBe('S2_OPEN');
    expect(report.honestyBanner).toContain('karaoke=false');
    expect(report.honestyBanner).toContain(PARTY_PREDICTION_TRIVIA_LOOP_HONESTY.slice(0, 20));
  });

  it('preserves IV packet PREPARED honesty', () => {
    const iv = readFileSync(
      join(process.cwd(), 'artifacts/physical_lan_review/PHYSICAL_LAN_REVIEW_PACKET.md'),
      'utf8',
    );
    expect(iv).toContain('PREPARED — not executed');
  });
});
