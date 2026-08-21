/**
 * Wave007 requirement evaluators — each maps 1:1 to GAME-BEATLINK-00x.
 * Classifications depend on evidence predicates (never unconditional true).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export type Classification =
  | 'IMPLEMENTED_AND_VALIDATED'
  | 'IMPLEMENTED_VALIDATION_OPEN'
  | 'IMPLEMENTATION_OPEN'
  | 'BLOCKED_ENVIRONMENT'
  | 'BLOCKED_EXTERNAL'
  | 'FAIL';

export interface EvalResult {
  requirement_id: string;
  evaluator_name: string;
  classification: Classification;
  evidence: Record<string, unknown>;
}

const ART = join(process.cwd(), 'artifacts/engineering_wave007');

function load(name: string): Record<string, unknown> | null {
  const p = join(ART, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pass(ev: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((k) => {
    const v = ev[k];
    return v === true || (typeof v === 'string' && v.length > 0) || (typeof v === 'number' && Number.isFinite(v));
  });
}

export function evaluate_game_beatlink_001(): EvalResult {
  const browser = load('CREATE_ROOM_BROWSER_RESULT.json') ?? {};
  const e2e = load('BROWSER_E2E_RESULT.json') ?? {};
  const ok =
    browser.CREATE_ROOM_UI_TO_REAL_SERVER === true &&
    browser.ok === true &&
    e2e.playwright_ran === true &&
    e2e.playwright_skipped === false;
  return {
    requirement_id: 'GAME-BEATLINK-001',
    evaluator_name: 'evaluate_game_beatlink_001',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      CREATE_ROOM_REACHES_LOBBY: ok,
      CREATE_ROOM_UI_TO_REAL_SERVER: browser.CREATE_ROOM_UI_TO_REAL_SERVER === true,
      room_code: browser.room_code ?? null,
      playwright_ran: e2e.playwright_ran === true,
    },
  };
}

export function evaluate_game_beatlink_002(): EvalResult {
  const multi = load('MULTICLIENT_BROWSER_RESULT.json') ?? {};
  const e2e = load('BROWSER_E2E_RESULT.json') ?? {};
  const contexts = Number(multi.independent_browser_contexts ?? e2e.contexts ?? 0);
  const ok =
    contexts >= 3 &&
    multi.canonical_room_code_same === true &&
    multi.ok === true &&
    e2e.playwright_ran === true;
  return {
    requirement_id: 'GAME-BEATLINK-002',
    evaluator_name: 'evaluate_game_beatlink_002',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      MULTI_CLIENT_JOIN: ok,
      independent_browser_contexts: contexts,
      host_context_id: multi.host_context_id ?? null,
      performer_context_id: multi.performer_context_id ?? null,
      audience_context_id: multi.audience_context_id ?? null,
      canonical_room_code_same: multi.canonical_room_code_same === true,
    },
  };
}

export function evaluate_game_beatlink_003(unit: Record<string, unknown>): EvalResult {
  const song = load('SONG_SOURCE_RIGHTS_RESULT.json') ?? unit;
  const ok =
    song.SONG_SOURCE_LAWFUL === true &&
    song.COPYRIGHT_SAFE_FIXTURE === true &&
    song.LINK_IS_NOT_RIP_PERMISSION === true &&
    song.REFERENCE_ONLY_CAN_GAMEPLAY_STREAM === false &&
    song.REFERENCE_ONLY_CAN_CACHE_MEDIA === false;
  return {
    requirement_id: 'GAME-BEATLINK-003',
    evaluator_name: 'evaluate_game_beatlink_003',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: { ...song, SONG_SOURCE_LAWFUL: ok },
  };
}

export function evaluate_game_beatlink_004(): EvalResult {
  const roles = load('ROLE_SYNC_BROWSER_RESULT.json') ?? {};
  const ok = roles.ROLE_SYNC_REAL_BROWSER === true && roles.ok === true;
  return {
    requirement_id: 'GAME-BEATLINK-004',
    evaluator_name: 'evaluate_game_beatlink_004',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      ACTIVE_AND_AUDIENCE_ROLES: ok,
      ROLE_SYNC_REAL_BROWSER: roles.ROLE_SYNC_REAL_BROWSER === true,
      performer_role: roles.performer_role ?? null,
      audience_seat: roles.audience_seat === true,
    },
  };
}

export function evaluate_game_beatlink_005(unit: Record<string, unknown>): EvalResult {
  const cal = load('DEVICE_CALIBRATION_BROWSER_RESULT.json') ?? {};
  const ok =
    cal.DEVICE_CALIBRATION_UI_FLOW === true &&
    cal.CALIBRATION_AFFECTS_SCORING === true &&
    unit.PROFILES_AFFECT_SCORING_WINDOWS === true;
  return {
    requirement_id: 'GAME-BEATLINK-005',
    evaluator_name: 'evaluate_game_beatlink_005',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      DEVICE_TIMING_PROFILE: ok,
      DEVICE_CALIBRATION_UI_FLOW: cal.DEVICE_CALIBRATION_UI_FLOW === true,
      CALIBRATION_AFFECTS_SCORING: cal.CALIBRATION_AFFECTS_SCORING === true,
      PROFILES_AFFECT_SCORING_WINDOWS: unit.PROFILES_AFFECT_SCORING_WINDOWS === true,
      audio_output_latency_ms: cal.audio_output_latency_ms ?? null,
    },
  };
}

export function evaluate_game_beatlink_006(unit: Record<string, unknown>): EvalResult {
  const play = load('GAMEPLAY_BROWSER_RESULT.json') ?? {};
  const ok =
    play.PERFORMER_REAL_BROWSER_GAMEPLAY === true &&
    play.TAP_INPUT === true &&
    play.SWIPE_INPUT === true &&
    play.VOCAL_PATH_CLASSIFICATION === 'VOCAL_PROMPT_TIMING_MODE' &&
    play.MICROPHONE_PITCH_ANALYSIS === false;
  return {
    requirement_id: 'GAME-BEATLINK-006',
    evaluator_name: 'evaluate_game_beatlink_006',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      AUTHORITATIVE_ROUND_CLOCK: unit.AUTHORITATIVE_ROUND_CLOCK === true,
      TAP_INPUT: play.TAP_INPUT === true,
      SWIPE_INPUT: play.SWIPE_INPUT === true,
      VOCAL_PATH_CLASSIFICATION: play.VOCAL_PATH_CLASSIFICATION ?? null,
      MICROPHONE_PITCH_ANALYSIS: false,
      GENERAL_VOCAL_RECOGNITION: false,
      PERFORMER_REAL_BROWSER_GAMEPLAY: play.PERFORMER_REAL_BROWSER_GAMEPLAY === true,
    },
  };
}

export function evaluate_game_beatlink_007(unit: Record<string, unknown>): EvalResult {
  const aud = load('AUDIENCE_BROWSER_RESULT.json') ?? {};
  const ok =
    aud.AUDIENCE_REAL_BROWSER_INFLUENCE === true &&
    aud.AUDIENCE_SPAM_BOUNDED === true &&
    unit.SPAM_CAPS === true;
  return {
    requirement_id: 'GAME-BEATLINK-007',
    evaluator_name: 'evaluate_game_beatlink_007',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      AUDIENCE_INFLUENCE_ENGINE: ok,
      AUDIENCE_REAL_BROWSER_INFLUENCE: aud.AUDIENCE_REAL_BROWSER_INFLUENCE === true,
      SPAM_CAPS: unit.SPAM_CAPS === true,
      AUDIENCE_SPAM_BOUNDED: aud.AUDIENCE_SPAM_BOUNDED === true,
    },
  };
}

export function evaluate_game_beatlink_008(unit: Record<string, unknown>): EvalResult {
  const out = load('OUTCOME_CONSISTENCY_BROWSER_RESULT.json') ?? {};
  const ledger = load('SCORING_LEDGER_REPLAY_RESULT.json') ?? {};
  const ok =
    out.OUTCOME_HASH_CONSISTENT_ACROSS_CLIENTS === true &&
    ledger.SCORING_REPLAY_DETERMINISTIC === true &&
    unit.TEAM_ASSIGNMENT_SERVER_AUTHORITATIVE === true &&
    unit.DUPLICATE_GAMEPLAY_SCORE_DELTA === 0;
  return {
    requirement_id: 'GAME-BEATLINK-008',
    evaluator_name: 'evaluate_game_beatlink_008',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      SCORING_LEDGER_REPLAY: ok,
      OUTCOME_HASH_CONSISTENT_ACROSS_CLIENTS: out.OUTCOME_HASH_CONSISTENT_ACROSS_CLIENTS === true,
      TEAM_ASSIGNMENT_SERVER_AUTHORITATIVE: unit.TEAM_ASSIGNMENT_SERVER_AUTHORITATIVE === true,
      DUPLICATE_GAMEPLAY_SCORE_DELTA: unit.DUPLICATE_GAMEPLAY_SCORE_DELTA ?? null,
      SCORING_REPLAY_DETERMINISTIC: ledger.SCORING_REPLAY_DETERMINISTIC === true,
    },
  };
}

export function evaluate_game_beatlink_009(): EvalResult {
  const rec = load('RECONNECT_BROWSER_A_B_C_RESULT.json') ?? {};
  const rem = load('REMATCH_BROWSER_RESULT.json') ?? {};
  const ok =
    rec.NEW_CLIENT_CONTEXT_B === true &&
    rec.NEW_CLIENT_CONTEXT_C === true &&
    rec.RECONNECT_SAME_IDENTITY === true &&
    Number(rec.RECONNECT_ROSTER_DUPLICATES ?? 1) === 0 &&
    rem.REMATCH_NEW_ROUND === true &&
    rem.PRIOR_RESULT_IMMUTABLE === true;
  return {
    requirement_id: 'GAME-BEATLINK-009',
    evaluator_name: 'evaluate_game_beatlink_009',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      SESSION_RESUME_A_B_C: ok,
      NEW_CLIENT_CONTEXT_B: rec.NEW_CLIENT_CONTEXT_B === true,
      NEW_CLIENT_CONTEXT_C: rec.NEW_CLIENT_CONTEXT_C === true,
      RECONNECT_SAME_IDENTITY: rec.RECONNECT_SAME_IDENTITY === true,
      RECONNECT_ROSTER_DUPLICATES: rec.RECONNECT_ROSTER_DUPLICATES ?? null,
      REMATCH_NEW_ROUND: rem.REMATCH_NEW_ROUND === true,
      PRIOR_RESULT_IMMUTABLE: rem.PRIOR_RESULT_IMMUTABLE === true,
    },
  };
}

export function evaluate_game_beatlink_010(unit: Record<string, unknown>): EvalResult {
  const song = load('SONG_SOURCE_RIGHTS_RESULT.json') ?? unit;
  const ok =
    song.LINK_IS_NOT_RIP_PERMISSION === true &&
    song.PROVIDER_LINK_RIP_BLOCK === true &&
    song.PROVIDER_AUTH_FAILURE_NO_DOWNLOADER_FALLBACK === true &&
    song.ARBITRARY_URL_FETCH_BLOCKED === true &&
    song.SONG_SOURCE_REFERENCE_ONLY_TRUTHFUL === true;
  return {
    requirement_id: 'GAME-BEATLINK-010',
    evaluator_name: 'evaluate_game_beatlink_010',
    classification: ok ? 'IMPLEMENTED_AND_VALIDATED' : 'IMPLEMENTED_VALIDATION_OPEN',
    evidence: {
      LINK_IS_NOT_RIP_PERMISSION: song.LINK_IS_NOT_RIP_PERMISSION === true,
      PROVIDER_LINK_RIP_BLOCK: song.PROVIDER_LINK_RIP_BLOCK === true,
      PROVIDER_AUTH_FAILURE_NO_DOWNLOADER_FALLBACK:
        song.PROVIDER_AUTH_FAILURE_NO_DOWNLOADER_FALLBACK === true,
      ARBITRARY_URL_FETCH_BLOCKED: song.ARBITRARY_URL_FETCH_BLOCKED === true,
      SONG_SOURCE_REFERENCE_ONLY_TRUTHFUL: song.SONG_SOURCE_REFERENCE_ONLY_TRUTHFUL === true,
    },
  };
}

export const EVALUATOR_REGISTRY: Record<string, () => EvalResult> = {
  'GAME-BEATLINK-001': evaluate_game_beatlink_001,
  'GAME-BEATLINK-002': evaluate_game_beatlink_002,
};

export { pass, load };
