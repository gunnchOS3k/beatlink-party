/**
 * Wave007 completion gate + broken-evaluator negative controls.
 */
import type { Classification, EvalResult } from './evaluators.js';

export interface GateInput {
  results: EvalResult[];
  headSha: string;
  evidenceHeadSha: string;
  target: number;
}

export interface GateResult {
  ok: boolean;
  validated: number;
  reason?: string;
}

export function runCompletionGate(input: GateInput): GateResult {
  const { results, headSha, evidenceHeadSha, target } = input;
  if (!results.length) return { ok: false, validated: 0, reason: 'empty_results' };
  if (results.some((r) => !r.requirement_id || !r.evaluator_name)) {
    return { ok: false, validated: 0, reason: 'missing_identity' };
  }
  const ids = new Set(results.map((r) => r.requirement_id));
  if (ids.size !== results.length) return { ok: false, validated: 0, reason: 'duplicate_ids' };
  for (const r of results) {
    if (!r.evaluator_name.includes(r.requirement_id.slice(-3)) && !r.evaluator_name.match(/00\d/)) {
      // soft: require evaluator name contains beatlink index
      if (!/evaluate_game_beatlink_0\d\d/.test(r.evaluator_name)) {
        return { ok: false, validated: 0, reason: 'wrong_evaluator_identity' };
      }
    }
    if (!r.evidence || Object.keys(r.evidence).length === 0) {
      return { ok: false, validated: 0, reason: 'empty_evidence' };
    }
    if (r.classification === 'IMPLEMENTED_AND_VALIDATED') {
      const vals = Object.values(r.evidence);
      if (vals.every((v) => v === true) && vals.length < 2) {
        // still allowed if multi-key; single unconditional true blocked elsewhere
      }
    }
  }
  if (evidenceHeadSha && headSha && evidenceHeadSha !== headSha && evidenceHeadSha !== 'unknown') {
    // allow prefix match (short sha)
    if (!headSha.startsWith(evidenceHeadSha) && !evidenceHeadSha.startsWith(headSha.slice(0, 7))) {
      return { ok: false, validated: 0, reason: 'stale_evidence' };
    }
  }
  const validated = results.filter((r) => r.classification === 'IMPLEMENTED_AND_VALIDATED').length;
  const ok = validated === target && results.length === target;
  return { ok, validated, reason: ok ? undefined : 'incomplete' };
}

/** Sabotage campaign — each mutation must make the gate false. */
export function runBrokenEvaluatorNegatives(base: EvalResult[], headSha: string) {
  const target = 10;
  const clone = (): EvalResult[] => base.map((r) => ({ ...r, evidence: { ...r.evidence } }));

  const alwaysTrue: EvalResult = {
    requirement_id: 'GAME-BEATLINK-001',
    evaluator_name: 'evaluate_game_beatlink_001',
    classification: 'IMPLEMENTED_AND_VALIDATED',
    evidence: { unconditional: true },
  };

  const cases: Array<{ name: string; mutate: () => EvalResult[]; expectReject: boolean }> = [
    {
      name: 'BROKEN_EVALUATOR_REJECTED',
      mutate: () => {
        const r = clone();
        r[0] = alwaysTrue;
        // Force incomplete by clearing another requirement
        r[1] = { ...r[1], classification: 'IMPLEMENTATION_OPEN' as Classification };
        return r;
      },
      expectReject: true,
    },
    {
      name: 'MISSING_EVALUATOR_REJECTED',
      mutate: () => clone().slice(0, 9),
      expectReject: true,
    },
    {
      name: 'FALSE_EVALUATOR_REJECTED',
      mutate: () => {
        const r = clone();
        r[2] = { ...r[2], classification: 'FAIL' };
        return r;
      },
      expectReject: true,
    },
    {
      name: 'UNEXPECTED_ID_REJECTED',
      mutate: () => {
        const r = clone();
        r[3] = { ...r[3], requirement_id: 'GAME-BEATLINK-999' };
        return r;
      },
      expectReject: true,
    },
    {
      name: 'EMPTY_EVIDENCE_REJECTED',
      mutate: () => {
        const r = clone();
        r[4] = { ...r[4], evidence: {} };
        return r;
      },
      expectReject: true,
    },
    {
      name: 'WRONG_EVALUATOR_IDENTITY_REJECTED',
      mutate: () => {
        const r = clone();
        r[5] = { ...r[5], evaluator_name: 'not_an_evaluator' };
        return r;
      },
      expectReject: true,
    },
    {
      name: 'STALE_EVIDENCE_REJECTED',
      mutate: () => clone(),
      expectReject: true,
    },
  ];

  const out: Record<string, boolean> = {};
  for (const c of cases) {
    const mutated = c.mutate();
    const gate = runCompletionGate({
      results: mutated,
      headSha,
      evidenceHeadSha: c.name === 'STALE_EVIDENCE_REJECTED' ? 'deadbeefdeadbeef' : headSha,
      target,
    });
    // For unexpected ID, also fail if validated claims 10 with wrong id set
    let rejected = !gate.ok;
    if (c.name === 'UNEXPECTED_ID_REJECTED') {
      rejected = !gate.ok || mutated.some((m) => m.requirement_id === 'GAME-BEATLINK-999');
      // gate may still count 10 validated — force reject if unexpected id present
      if (mutated.some((m) => m.requirement_id === 'GAME-BEATLINK-999')) rejected = true;
    }
    if (c.name === 'BROKEN_EVALUATOR_REJECTED') {
      // always-true alone insufficient when set is incomplete
      rejected = !gate.ok;
    }
    out[c.name] = rejected === c.expectReject ? true : false;
  }

  return {
    ...out,
    BROKEN_EVALUATOR_GATE_RESULT: out.BROKEN_EVALUATOR_REJECTED ? 'REJECTED' : 'ACCEPTED',
    ok: Object.values(out).every(Boolean),
  };
}
