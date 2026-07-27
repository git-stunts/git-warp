/**
 * `git warp doctor` — diagnose structural anomalies and suggest fixes.
 *
 * Orchestrator: builds context, runs checks with budget tracking,
 * assembles payload, sorts findings, derives health.
 *
 * @module cli/commands/doctor
 */

import { ALL_CHECKS } from './checks.ts';
import { CODES } from './codes.ts';
import {
  checkMaterializationCache,
} from './checksMaterializationCache.ts';
import {
  createDoctorContext,
} from './storageCapabilities.ts';
import { DOCTOR_EXIT_CODES, type DoctorFinding, type DoctorPolicy, type DoctorPayload, type DoctorContext } from './types.ts';
import type { CliOptions } from '../../types.ts';

const DEFAULT_POLICY: DoctorPolicy = {
  strict: false,
  clockSkewMs: 300_000,
  checkpointMaxAgeHours: 168,
  globalDeadlineMs: 10_000,
  checkTimeouts: {},
};

const STATUS_ORDER = { fail: 0, warn: 1, ok: 2 } as const;
const IMPACT_ORDER = {
  data_integrity: 0,
  security: 1,
  operability: 2,
  hygiene: 3,
} as const;

/** Handles the `git warp doctor` command: runs structural health checks and returns findings. */
export default async function handleDoctor({ options }: { options: CliOptions }): Promise<{ payload: DoctorPayload; exitCode: number }> {
  const startMs = Date.now();
  const ctx = await createDoctorContext(options, DEFAULT_POLICY);
  const { findings, checksRun } = await runChecks(ctx, startMs);
  findings.sort(compareFinding);
  const payload = assemblePayload({
    repo: options.repo,
    graph: ctx.graphName,
    policy: ctx.policy,
    findings,
    checksRun,
    startMs,
  });
  const exitCode = computeExitCode(payload.health, ctx.policy.strict);
  return { payload, exitCode };
}

/** Assembles the final DoctorPayload from sorted findings. */
function assemblePayload({ repo, graph, policy, findings, checksRun, startMs }: { repo: string; graph: string; policy: DoctorPolicy; findings: DoctorFinding[]; checksRun: number; startMs: number }): DoctorPayload {
  let ok = 0;
  let warn = 0;
  let fail = 0;
  for (const f of findings) {
    if (f.status === 'ok') { ok++; }
    else if (f.status === 'warn') { warn++; }
    else if (f.status === 'fail') { fail++; }
  }
  const priorityActions = [
    ...new Set(
      findings.filter((f) => f.status !== 'ok' && typeof f.fix === 'string' && f.fix.length > 0).map((f) => f.fix as string),
    ),
  ];

  return {
    doctorVersion: 1,
    repo,
    graph,
    checkedAt: new Date().toISOString(),
    health: deriveHealth(fail, warn),
    policy,
    summary: { checksRun, findingsTotal: findings.length, ok, warn, fail, priorityActions },
    findings,
    durationMs: Date.now() - startMs,
  };
}

/** Executes a single check and returns its findings. */
async function executeCheck(check: { id: string; fn: (ctx: DoctorContext) => Promise<DoctorFinding | DoctorFinding[] | null> }, ctx: DoctorContext): Promise<DoctorFinding[]> {
  let checkDuration;
  try {
    const checkStart = Date.now();
    const result = await check.fn(ctx);
    checkDuration = Date.now() - checkStart;
    const resultArray = normalizeResult(result);
    for (const f of resultArray) {
      f.durationMs = checkDuration;
    }
    return resultArray;
  } catch (err) {
    return [{
      id: check.id,
      status: 'fail' as const,
      code: CODES.CHECK_INTERNAL_ERROR,
      impact: 'data_integrity' as const,
      message: `Internal error in ${check.id}: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: checkDuration ?? 0,
    }];
  }
}

/** Runs all checks with global deadline enforcement. */
async function runChecks(ctx: DoctorContext, startMs: number): Promise<{ findings: DoctorFinding[]; checksRun: number }> {
  const findings: DoctorFinding[] = [];
  let checksRun = 0;
  const checks = ctx.materializationCacheDiagnostics === null
    ? ALL_CHECKS
    : [...ALL_CHECKS, {
        id: 'materialization-cache',
        fn: checkMaterializationCache,
      }];

  for (const check of checks) {
    const elapsed = Date.now() - startMs;
    if (elapsed >= ctx.policy.globalDeadlineMs) {
      findings.push({
        id: check.id,
        status: 'warn',
        code: CODES.CHECK_SKIPPED_BUDGET_EXHAUSTED,
        impact: 'operability',
        message: `Check skipped: global deadline exceeded (${elapsed}ms >= ${ctx.policy.globalDeadlineMs}ms)`,
      });
    } else {
      const checkFindings = await executeCheck(check, ctx);
      findings.push(...checkFindings);
    }
    checksRun++;
  }

  return { findings, checksRun };
}

/** Normalizes a check result into an array of findings. */
function normalizeResult(result: DoctorFinding | DoctorFinding[] | null): DoctorFinding[] {
  if (!result) {
    return [];
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [result];
}

/** Derives the overall health status from fail and warn counts. */
function deriveHealth(fail: number, warn: number): 'ok' | 'degraded' | 'failed' {
  if (fail > 0) {
    return 'failed';
  }
  if (warn > 0) {
    return 'degraded';
  }
  return 'ok';
}

/** Computes the CLI exit code from the health status and strict mode flag. */
function computeExitCode(health: 'ok' | 'degraded' | 'failed', strict: boolean): number {
  if (health === 'ok') {
    return DOCTOR_EXIT_CODES.OK;
  }
  if (strict) {
    return DOCTOR_EXIT_CODES.STRICT_FINDINGS;
  }
  return DOCTOR_EXIT_CODES.FINDINGS;
}

/** Returns the numeric sort key for a finding's status. */
function statusSortKey(finding: DoctorFinding): number {
  return STATUS_ORDER[finding.status] ?? 9;
}

/** Returns the numeric sort key for a finding's impact. */
function impactSortKey(finding: DoctorFinding): number {
  return IMPACT_ORDER[finding.impact] ?? 9;
}

/** Comparator for sorting findings by status (fail first), then impact, then id. */
function compareFinding(a: DoctorFinding, b: DoctorFinding): number {
  const statusDiff = statusSortKey(a) - statusSortKey(b);
  if (statusDiff !== 0) {
    return statusDiff;
  }
  const impactDiff = impactSortKey(a) - impactSortKey(b);
  if (impactDiff !== 0) {
    return impactDiff;
  }
  return a.id.localeCompare(b.id);
}
