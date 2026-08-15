import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildBeatLinkVisualPackHarness,
  buildPartyOnboarding,
  clearAvFeedbackHistory,
  clearPartyPaceHistory,
  firstFunCriticNotes,
  firstMinutesEstimate,
  FIRST_MINUTES_STEPS,
  getAvFeedbackHistory,
  getPartyPaceHistory,
  onboardingCompletionPercent,
  presentAvFeedback,
  pulsePartyPace,
} from '../packages/game-engine/src/index.js';
import { getProviderAuthStatus } from '../apps/server/src/music/linkResolver.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(here, '..');

describe('GAME-RC-004 Beat Link party UX density', () => {
  it('validates release contracts including platform + visual harness', () => {
    const out = execFileSync('python3', ['scripts/validate_game_rc_contracts.py'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out).toContain('GAME_RC_CONTRACTS_OK');
    expect(out).toContain('achievements=14');
  });

  it('covers first-minutes onboarding without claiming human first-fun', () => {
    expect(FIRST_MINUTES_STEPS.length).toBe(8);
    expect(firstMinutesEstimate()).toBeGreaterThanOrEqual(5);
    const steps = buildPartyOnboarding(['landing', 'create_or_join', 'media_local_catalog']);
    expect(onboardingCompletionPercent(steps)).toBe(38);
    const notes = firstFunCriticNotes();
    expect(notes.engineered_toward).toBe('first_minutes_without_developer');
    expect(notes.risk).toBe('S2_OPEN');
  });

  it('records party pacing and A/V feedback hooks', () => {
    clearPartyPaceHistory();
    clearAvFeedbackHistory();
    pulsePartyPace('lobby_ready', 'test');
    pulsePartyPace('results', 'test');
    presentAvFeedback('join_chime', 'hi');
    presentAvFeedback('results_sting', 'done');
    expect(getPartyPaceHistory().length).toBe(2);
    expect(getAvFeedbackHistory().map((e) => e.kind)).toEqual(['join_chime', 'results_sting']);
  });

  it('ships visual harness + honest platform matrix', () => {
    const harness = buildBeatLinkVisualPackHarness();
    expect(harness.status).toBe('HARNESS_READY');
    expect(harness.VISUAL_MODEL_REVIEW).toBe('HISTORICAL_CAPTURES_ONLY');
    expect(harness.deferred_heavy_work.length).toBeGreaterThan(0);

    const platform = JSON.parse(
      readFileSync(resolve(ROOT, 'release/PLATFORM_MATRIX.json'), 'utf8'),
    ) as {
      PLATFORM_PUBLISHED: boolean;
      targets: Array<{ id: string; status: string }>;
    };
    expect(platform.PLATFORM_PUBLISHED).toBe(false);
    expect(platform.targets.find((t) => t.id === 'web')?.status).toBe('BUILDABLE');
    expect(platform.targets.find((t) => t.id === 'android')?.status).toBe('BUILDABLE');
  });

  it('keeps honesty tokens false, provider EXTERNAL_PENDING, critic BETA', () => {
    const gate = JSON.parse(readFileSync(resolve(ROOT, 'release/RC_GATE.json'), 'utf8')) as {
      packet: string;
      claims: Record<string, boolean>;
      critic_class: string;
      defects: { S0_open: number; S1_open: number; S2_open: number };
      visual: { VISUAL_MODEL_REVIEW: string };
      achievements: { count: number };
    };
    expect(gate.packet).toBe('GAME-RC-004');
    expect(gate.claims.POLISHED_RELEASE_CANDIDATE).toBe(false);
    expect(gate.claims.FEATURE_COMPLETE_RC).toBe(false);
    expect(gate.claims.HUMAN_PLAYTEST_VALIDATED).toBe(false);
    expect(gate.critic_class).toBe('BETA');
    expect(gate.defects.S0_open).toBe(0);
    expect(gate.defects.S1_open).toBe(0);
    expect(gate.defects.S2_open).toBeGreaterThan(0);
    expect(gate.visual.VISUAL_MODEL_REVIEW).toBe('HISTORICAL_CAPTURES_ONLY');
    expect(gate.achievements.count).toBe(14);

    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
    expect(getProviderAuthStatus().authState).toBe('EXTERNAL_PENDING');
  });
});
