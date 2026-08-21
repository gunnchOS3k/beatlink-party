/**
 * Computed evaluator integrity — TypeScript AST / source scan (not hand-assigned constants).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const EVALUATOR_FILE = join(
  process.cwd(),
  'tests/engineering_wave007/evaluators.ts',
);

const REQUIRED = [
  'evaluate_game_beatlink_001',
  'evaluate_game_beatlink_002',
  'evaluate_game_beatlink_003',
  'evaluate_game_beatlink_004',
  'evaluate_game_beatlink_005',
  'evaluate_game_beatlink_006',
  'evaluate_game_beatlink_007',
  'evaluate_game_beatlink_008',
  'evaluate_game_beatlink_009',
  'evaluate_game_beatlink_010',
] as const;

export interface IntegrityFinding {
  evaluator_name: string;
  requirement_id: string;
  unconditional: boolean;
  literal_success_findings: string[];
  integrity_ok: boolean;
  source_hash: string;
}

function fnBodyText(source: string, fnName: string): string | null {
  const sf = ts.createSourceFile(EVALUATOR_FILE, source, ts.ScriptTarget.Latest, true);
  let body: string | null = null;
  const visit = (node: ts.Node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === fnName &&
      node.body
    ) {
      body = node.body.getText(sf);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return body;
}

function detectUnconditional(body: string): string[] {
  const findings: string[] = [];
  if (/classification:\s*'IMPLEMENTED_AND_VALIDATED'/.test(body) && !/\bok\b/.test(body)) {
    findings.push('literal_classification_without_ok_predicate');
  }
  if (/return\s+true\s*;/.test(body) && body.includes('IMPLEMENTED_AND_VALIDATED')) {
    // only flag if return true is the sole gate
  }
  if (
    /classification:\s*ok\s*\?\s*'IMPLEMENTED_AND_VALIDATED'/.test(body) === false &&
    /IMPLEMENTED_AND_VALIDATED/.test(body) &&
    !/\bok\b\s*=/.test(body)
  ) {
    findings.push('validated_without_computed_ok');
  }
  // Unconditional: classification always VALIDATED with no ternary / ok check
  if (
    /classification:\s*'IMPLEMENTED_AND_VALIDATED'/.test(body) &&
    !/classification:\s*ok\s*\?/.test(body)
  ) {
    findings.push('unconditional_implemented_and_validated');
  }
  return findings;
}

export function scanEvaluatorIntegrity() {
  const source = readFileSync(EVALUATOR_FILE, 'utf8');
  const requirements: IntegrityFinding[] = [];
  let unconditional = 0;

  for (const fn of REQUIRED) {
    const body = fnBodyText(source, fn);
    const reqId = `GAME-BEATLINK-${fn.slice(-3)}`;
    const hash = createHash('sha256')
      .update(body ?? `missing:${fn}`)
      .digest('hex');
    if (!body) {
      requirements.push({
        evaluator_name: fn,
        requirement_id: reqId,
        unconditional: true,
        literal_success_findings: ['missing_function_body'],
        integrity_ok: false,
        source_hash: hash,
      });
      unconditional += 1;
      continue;
    }
    const findings = detectUnconditional(body);
    const isUncond = findings.includes('unconditional_implemented_and_validated');
    if (isUncond) unconditional += 1;
    requirements.push({
      evaluator_name: fn,
      requirement_id: reqId,
      unconditional: isUncond,
      literal_success_findings: findings,
      integrity_ok: findings.length === 0,
      source_hash: hash,
    });
  }

  return {
    UNCONDITIONAL_TRUE_CLASSIFIERS: unconditional,
    UNCONDITIONAL_TRUE_CLASSIFIERS_COMPUTED: true,
    evaluators_inspected: REQUIRED.length,
    ok: unconditional === 0 && requirements.every((r) => r.integrity_ok),
    requirements,
    scanner: 'typescript-ast+source-body',
  };
}
