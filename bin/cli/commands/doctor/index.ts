/**
 * `git warp doctor` — diagnose structural anomalies and suggest fixes.
 *
 * Orchestrator: builds context, runs checks with budget tracking,
 * assembles payload, sorts findings, derives health.
 *
 * @module cli/commands/doctor
 */

import createBoundedMemoryCapabilityReport
  from '../../../../src/domain/memory/createBoundedMemoryCapabilityReport.ts';
import { parseCommandArgs } from '../../infrastructure.ts';
import { doctorSchema } from '../../schemas.ts';
import { ALL_CHECKS } from './checks.ts';
import { CODES } from './codes.ts';
import {
  checkMaterializationCache,
} from './checksMaterializationCache.ts';
import {
  createDoctorContext,
  repairMaterializationCache,
} from './storageCapabilities.ts';
import { DOCTOR_EXIT_CODES, type DoctorFinding, type DoctorPolicy, type DoctorPayload, type DoctorContext } from './types.ts';
import type { CliOptions } from '../../types.ts';

const DOCTOR_OPTION_MEMORY_BUDGET = 'memory-budget';
const DOCTOR_OPTION_LARGE_GRAPH = 'large-graph';
const DOCTOR_OPTION_REPAIR_MATERIALIZATION_CACHE = 'repair-materialization-cache';

const MEMORY_BUDGET_FINDING_ID = 'memory-budget';
const MEMORY_BUDGET_NOT_SPECIFIED = 'not-specified';

const DOCTOR_OPTIONS = {
  strict: { type: 'boolean', default: false },
  [DOCTOR_OPTION_MEMORY_BUDGET]: { type: 'string' },
  [DOCTOR_OPTION_LARGE_GRAPH]: { type: 'boolean', default: false },
  [DOCTOR_OPTION_REPAIR_MATERIALIZATION_CACHE]: { type: 'boolean', default: false },
};

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

type DoctorCommandValues = {
  readonly strict: boolean;
  readonly [DOCTOR_OPTION_MEMORY_BUDGET]: string | undefined;
  readonly [DOCTOR_OPTION_LARGE_GRAPH]: boolean;
  readonly [DOCTOR_OPTION_REPAIR_MATERIALIZATION_CACHE]: boolean;
};

type RawDoctorCommandValues = {
  readonly strict: boolean;
  readonly [DOCTOR_OPTION_MEMORY_BUDGET]?: string | undefined;
  readonly [DOCTOR_OPTION_LARGE_GRAPH]: boolean;
  readonly [DOCTOR_OPTION_REPAIR_MATERIALIZATION_CACHE]: boolean;
};

/** Handles the `git warp doctor` command: runs structural health checks and returns findings. */
export default async function handleDoctor({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: DoctorPayload; exitCode: number }> {
  const { values } = parseCommandArgs(args, DOCTOR_OPTIONS, doctorSchema);
  const commandValues = normalizeCommandValues(values);
  const startMs = Date.now();
  const ctx = await createDoctorContext(options, {
    ...DEFAULT_POLICY,
    strict: commandValues.strict,
  });
  const memoryFindings = memoryBudgetFindings(commandValues);
  const repairFinding = await repairMaterializationCache(
    commandValues[DOCTOR_OPTION_REPAIR_MATERIALIZATION_CACHE],
    ctx.materializationCacheDiagnostics,
  );
  const { findings, checksRun } = await runChecks(ctx, startMs);
  findings.push(...memoryFindings);
  if (repairFinding !== null) { findings.push(repairFinding); }
  findings.sort(compareFinding);
  const payload = assemblePayload({
    repo: options.repo,
    graph: ctx.graphName,
    policy: ctx.policy,
    findings,
    checksRun: checksRun + memoryFindings.length + (repairFinding === null ? 0 : 1),
    startMs,
  });
  const exitCode = computeExitCode(payload.health, ctx.policy.strict);
  return { payload, exitCode };
}

function normalizeCommandValues(values: RawDoctorCommandValues): DoctorCommandValues {
  return {
    strict: values.strict,
    [DOCTOR_OPTION_MEMORY_BUDGET]: values[DOCTOR_OPTION_MEMORY_BUDGET],
    [DOCTOR_OPTION_LARGE_GRAPH]: values[DOCTOR_OPTION_LARGE_GRAPH],
    [DOCTOR_OPTION_REPAIR_MATERIALIZATION_CACHE]:
      values[DOCTOR_OPTION_REPAIR_MATERIALIZATION_CACHE],
  };
}

function memoryBudgetFindings(values: DoctorCommandValues): DoctorFinding[] {
  if (values[DOCTOR_OPTION_MEMORY_BUDGET] === undefined && !values[DOCTOR_OPTION_LARGE_GRAPH]) {
    return [];
  }
  const report = createBoundedMemoryCapabilityReport();
  return [{
    id: MEMORY_BUDGET_FINDING_ID,
    status: 'ok',
    code: CODES.MEMORY_BUDGET_REPORT,
    impact: 'operability',
    message: 'Memory-budget posture reported for large-graph operation.',
    evidence: {
      requestedBudget: values[DOCTOR_OPTION_MEMORY_BUDGET] ?? MEMORY_BUDGET_NOT_SPECIFIED,
      largeGraph: values[DOCTOR_OPTION_LARGE_GRAPH],
      safe: mutableNames(report.safeNames()),
      transitional: mutableNames(report.transitionalNames()),
      diagnostic: mutableNames(report.diagnosticNames()),
      legacy: mutableNames(report.legacyNames()),
    },
  }];
}

function mutableNames(names: readonly string[]): string[] {
  const result: string[] = [];
  for (const name of names) {
    result.push(name);
  }
  return result;
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
