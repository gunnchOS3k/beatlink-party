/**
 * Beta gap audit builder — every Beta criterion with complete/path/test/blocker.
 */

export interface BetaGapCriterion {
  id: string;
  description: string;
  complete: boolean;
  path: string;
  test: string;
  blocker: string | null;
}

export interface BetaGapAudit {
  schema_version: '1.0.0';
  product: 'beatlink-party';
  updated_at_utc: string;
  branch: string;
  base_sha: string;
  criteria: BetaGapCriterion[];
  summary: {
    total: number;
    complete: number;
    incomplete: number;
    blockers: string[];
  };
  tokens: {
    BEATLINK_BETA_CONTENT_COMPLETE_DIGITAL: boolean;
    BEATLINK_DIGITAL_RC_READY: boolean;
    BETA: boolean;
    RC: boolean;
  };
}

export function buildBetaGapAudit(input: {
  updatedAtUtc?: string;
  branch: string;
  baseSha: string;
  criteria: Array<Omit<BetaGapCriterion, 'blocker'> & { blocker?: string | null }>;
  tokens: BetaGapAudit['tokens'];
}): BetaGapAudit {
  const criteria: BetaGapCriterion[] = input.criteria.map((c) => ({
    ...c,
    blocker: c.complete ? null : (c.blocker ?? 'incomplete'),
  }));
  const incomplete = criteria.filter((c) => !c.complete);
  return {
    schema_version: '1.0.0',
    product: 'beatlink-party',
    updated_at_utc: input.updatedAtUtc ?? new Date().toISOString(),
    branch: input.branch,
    base_sha: input.baseSha,
    criteria,
    summary: {
      total: criteria.length,
      complete: criteria.length - incomplete.length,
      incomplete: incomplete.length,
      blockers: incomplete.map((c) => c.blocker!).filter(Boolean),
    },
    tokens: input.tokens,
  };
}
