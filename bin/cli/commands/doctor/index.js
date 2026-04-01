/**
 * `git warp doctor` — diagnose structural anomalies and suggest fixes.
 *
 * Orchestrator: builds context, runs checks with budget tracking,
 * assembles payload, sorts findings, derives health.
 *
 * @module cli/commands/doctor
 */

import { buildWritersPrefix } from '../../../../src/domain/utils/RefLayout.js';
import { parseCommandArgs } from '../../infrastructure.js';
import { doctorSchema } from '../../schemas.js';
import { createPersistence, resolveGraphName } from '../../shared.js';
import { ALL_CHECKS } from './checks.js';
import { CODES } from './codes.js';
import { DOCTOR_EXIT_CODES } from './types.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */
/** @typedef {import('./types.js').DoctorFinding} DoctorFinding */
/** @typedef {import('./types.js').DoctorPolicy} DoctorPolicy */
/** @typedef {import('./types.js').DoctorPayload} DoctorPayload */

const DOCTOR_OPTIONS = {
  strict: { type: 'boolean', default: false },
};

/** @type {DoctorPolicy} */
const DEFAULT_POLICY = {
  strict: false,
  clockSkewMs: 300_000,
  checkpointMaxAgeHours: 168,
  globalDeadlineMs: 10_000,
  checkTimeouts: {},
};

const STATUS_ORDER = /** @type {const} */ ({ fail: 0, warn: 1, ok: 2 });
const IMPACT_ORDER = /** @type {const} */ ({
  data_integrity: 0,
  security: 1,
  operability: 2,
  hygiene: 3,
});

/**
 * Handles the `git warp doctor` command: runs structural health checks and returns findings.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: DoctorPayload, exitCode: number}>}
 */
export default async function handleDoctor({ options, args }) {
  const { values } = parseCommandArgs(args, DOCTOR_OPTIONS, doctorSchema);
  const startMs = Date.now();

  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const policy = { ...DEFAULT_POLICY, strict: Boolean(values.strict) };
  const writerHeads = await collectWriterHeads(persistence, graphName);

  /** @type {import('./types.js').DoctorContext} */
  const ctx = { persistence, graphName, writerHeads, policy, repoPath: options.repo };

  const { findings, checksRun } = await runChecks(ctx, startMs);
  findings.sort(compareFinding);

  const payload = assemblePayload({ repo: options.repo, graph: graphName, policy, findings, checksRun, startMs });
  const exitCode = computeExitCode(payload.health, policy.strict);
  return { payload, exitCode };
}

/**
 * Assembles the final DoctorPayload from sorted findings.
 * @param {{repo: string, graph: string, policy: DoctorPolicy, findings: DoctorFinding[], checksRun: number, startMs: number}} p
 * @returns {DoctorPayload}
 */
function assemblePayload({ repo, graph, policy, findings, checksRun, startMs }) {
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
      findings.filter((f) => f.status !== 'ok' && typeof f.fix === 'string' && f.fix.length > 0).map((f) => /** @type {string} */ (f.fix)),
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

/**
 * Collects writer heads by listing refs and reading their SHAs.
 * @param {import('../../types.js').Persistence} persistence
 * @param {string} graphName
 * @returns {Promise<Array<{writerId: string, sha: string|null, ref: string}>>}
 */
async function collectWriterHeads(persistence, graphName) {
  const prefix = buildWritersPrefix(graphName);
  const refs = await persistence.listRefs(prefix);
  const heads = [];
  for (const ref of refs) {
    const writerId = ref.slice(prefix.length);
    if (!writerId) {
      continue;
    }
    let sha = null;
    try {
      sha = await persistence.readRef(ref);
    } catch {
      // Dangling ref — readRef may fail (e.g. show-ref exits 128 for missing objects).
      // Include the head with sha=null so downstream checks can report it.
    }
    heads.push({ writerId, sha, ref });
  }
  return heads.sort((a, b) => a.writerId.localeCompare(b.writerId));
}

/**
 * Executes a single check and returns its findings.
 * @param {{ id: string, fn: (ctx: import('./types.js').DoctorContext) => Promise<DoctorFinding|DoctorFinding[]|null> }} check
 * @param {import('./types.js').DoctorContext} ctx
 * @returns {Promise<DoctorFinding[]>}
 */
async function executeCheck(check, ctx) {
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
      status: /** @type {const} */ ('fail'),
      code: CODES.CHECK_INTERNAL_ERROR,
      impact: /** @type {const} */ ('data_integrity'),
      message: `Internal error in ${check.id}: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: checkDuration ?? 0,
    }];
  }
}

/**
 * Runs all checks with global deadline enforcement.
 * @param {import('./types.js').DoctorContext} ctx
 * @param {number} startMs
 * @returns {Promise<{findings: DoctorFinding[], checksRun: number}>}
 */
async function runChecks(ctx, startMs) {
  const findings = /** @type {DoctorFinding[]} */ ([]);
  let checksRun = 0;

  for (const check of ALL_CHECKS) {
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

/**
 * Normalizes a check result into an array of findings.
 * @param {DoctorFinding|DoctorFinding[]|null} result
 * @returns {DoctorFinding[]}
 */
function normalizeResult(result) {
  if (!result) {
    return [];
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [result];
}

/**
 * Derives the overall health status from fail and warn counts.
 * @param {number} fail
 * @param {number} warn
 * @returns {'ok'|'degraded'|'failed'}
 */
function deriveHealth(fail, warn) {
  if (fail > 0) {
    return 'failed';
  }
  if (warn > 0) {
    return 'degraded';
  }
  return 'ok';
}

/**
 * Computes the CLI exit code from the health status and strict mode flag.
 * @param {'ok'|'degraded'|'failed'} health
 * @param {boolean} strict
 * @returns {number}
 */
function computeExitCode(health, strict) {
  if (health === 'ok') {
    return DOCTOR_EXIT_CODES.OK;
  }
  if (strict) {
    return DOCTOR_EXIT_CODES.STRICT_FINDINGS;
  }
  return DOCTOR_EXIT_CODES.FINDINGS;
}

/**
 * Returns the numeric sort key for a finding's status.
 * @param {DoctorFinding} finding
 * @returns {number}
 */
function statusSortKey(finding) {
  return STATUS_ORDER[finding.status] ?? 9;
}

/**
 * Returns the numeric sort key for a finding's impact.
 * @param {DoctorFinding} finding
 * @returns {number}
 */
function impactSortKey(finding) {
  return IMPACT_ORDER[finding.impact] ?? 9;
}

/**
 * Comparator for sorting findings by status (fail first), then impact, then id.
 * @param {DoctorFinding} a
 * @param {DoctorFinding} b
 * @returns {number}
 */
function compareFinding(a, b) {
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
