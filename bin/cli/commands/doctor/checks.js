/**
 * Diagnostic check functions for `git warp doctor`.
 *
 * Each check follows the DoctorCheck callback signature and NEVER throws.
 * Internal errors are captured as `CHECK_INTERNAL_ERROR` findings.
 *
 * @module cli/commands/doctor/checks
 */

import HealthCheckService from '../../../../src/domain/services/HealthCheckService.js';
import ClockAdapter from '../../../../src/infrastructure/adapters/ClockAdapter.js';
import {
  buildCheckpointRef,
  buildCoverageRef,
  buildAuditPrefix,
} from '../../../../src/domain/utils/RefLayout.js';
import { createHookInstaller } from '../../shared.js';
import { CODES } from './codes.js';

/** @typedef {import('./types.js').DoctorFinding} DoctorFinding */
/** @typedef {import('./types.js').DoctorContext} DoctorContext */

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Wrap an unexpected exception as an internal-error finding.
 * @param {string} id
 * @param {unknown} err
 * @returns {DoctorFinding}
 */
function internalError(id, err) {
  return {
    id,
    status: 'fail',
    code: CODES.CHECK_INTERNAL_ERROR,
    impact: 'data_integrity',
    message: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
  };
}

// ── repo-accessible ─────────────────────────────────────────────────────────

/**
 * Verify the repository is reachable via HealthCheckService.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding>}
 */
export async function checkRepoAccessible(ctx) {
  try {
    const clock = ClockAdapter.global();
    const svc = new HealthCheckService({ persistence: /** @type {import('../../../../src/domain/types/WarpPersistence.ts').CorePersistence} */ (/** @type {unknown} */ (ctx.persistence)), clock });
    const health = await svc.getHealth();
    if (health.components.repository.status === 'unhealthy') {
      return {
        id: 'repo-accessible', status: 'fail', code: CODES.REPO_UNREACHABLE,
        impact: 'operability', message: 'Repository is not accessible',
        fix: 'Check that the --repo path points to a valid git repository',
      };
    }
    return {
      id: 'repo-accessible', status: 'ok', code: CODES.REPO_OK,
      impact: 'operability', message: 'Repository is accessible',
    };
  } catch (err) {
    return internalError('repo-accessible', err);
  }
}

// ── refs-consistent ─────────────────────────────────────────────────────────

/**
 * Check whether a single ref points to an existing Git object.
 * @param {{ ref: string, sha: string, label: string }} entry
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding|null>}
 */
async function checkSingleRef(entry, ctx) {
  if (typeof entry.sha !== 'string' || entry.sha.length === 0) {
    return {
      id: 'refs-consistent', status: 'fail', code: CODES.REFS_DANGLING_OBJECT,
      impact: 'data_integrity',
      message: `Ref ${entry.ref} points to a missing or unreadable object`,
      fix: `Investigate broken ref for ${entry.label}`, evidence: { ref: entry.ref },
    };
  }
  const exists = await ctx.persistence.nodeExists(entry.sha);
  if (!exists) {
    return {
      id: 'refs-consistent', status: 'fail', code: CODES.REFS_DANGLING_OBJECT,
      impact: 'data_integrity',
      message: `Ref ${entry.ref} points to missing object ${entry.sha.slice(0, 7)}`,
      fix: `Investigate missing object for ${entry.label}`, evidence: { ref: entry.ref, sha: entry.sha },
    };
  }
  return null;
}

/**
 * Verify all writer refs point to existing Git objects.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding[]>}
 */
export async function checkRefsConsistent(ctx) {
  try {
    const allRefs = ctx.writerHeads.map((h) => ({
      ref: h.ref, sha: h.sha ?? '', label: `writer ${h.writerId}`,
    }));
    return await checkAllRefs(allRefs, ctx);
  } catch (err) {
    return [internalError('refs-consistent', err)];
  }
}

/**
 * Iterate over all refs, collecting failure findings or a single OK finding.
 * @param {Array<{ ref: string, sha: string, label: string }>} allRefs
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding[]>}
 */
async function checkAllRefs(allRefs, ctx) {
  const findings = /** @type {DoctorFinding[]} */ ([]);
  let checkedCount = 0;

  for (const entry of allRefs) {
    const finding = await checkSingleRef(entry, ctx);
    if (finding !== null && finding !== undefined) {
      findings.push(finding);
    } else {
      checkedCount++;
    }
  }

  if (findings.length === 0) {
    findings.push({
      id: 'refs-consistent', status: 'ok', code: CODES.REFS_OK,
      impact: 'data_integrity', message: `All ${checkedCount} ref(s) point to existing objects`,
    });
  }
  return findings;
}

// ── coverage-complete ───────────────────────────────────────────────────────

/**
 * Collect writer IDs whose heads are not reachable from the coverage anchor.
 * @param {DoctorContext} ctx
 * @param {string} coverageSha
 * @returns {Promise<string[]>}
 */
async function findMissingWriters(ctx, coverageSha) {
  const missing = [];
  for (const head of ctx.writerHeads) {
    if (typeof head.sha !== 'string' || head.sha.length === 0) {
      missing.push(head.writerId);
      continue;
    }
    const reachable = await ctx.persistence.isAncestor(head.sha, coverageSha);
    if (!reachable) {
      missing.push(head.writerId);
    }
  }
  return missing;
}

/**
 * Verify the coverage octopus anchor includes all writers.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding>}
 */
export async function checkCoverageComplete(ctx) {
  try {
    const coverageRef = buildCoverageRef(ctx.graphName);
    const coverageSha = await ctx.persistence.readRef(coverageRef);

    if (typeof coverageSha !== 'string' || coverageSha.length === 0) {
      return buildCoverageNoRef();
    }

    const missing = await findMissingWriters(ctx, coverageSha);
    return buildCoverageFinding(missing);
  } catch (err) {
    return internalError('coverage-complete', err);
  }
}

/**
 * Build a finding when the coverage ref does not exist.
 * @returns {DoctorFinding}
 */
function buildCoverageNoRef() {
  return {
    id: 'coverage-complete', status: 'warn', code: CODES.COVERAGE_NO_REF,
    impact: 'operability', message: 'No coverage ref found',
    fix: 'Run `git warp materialize` to create a coverage anchor',
  };
}

/**
 * Build a coverage finding based on the set of missing writer IDs.
 * @param {string[]} missing
 * @returns {DoctorFinding}
 */
function buildCoverageFinding(missing) {
  if (missing.length > 0) {
    return {
      id: 'coverage-complete', status: 'warn', code: CODES.COVERAGE_MISSING_WRITERS,
      impact: 'operability',
      message: `Coverage anchor is missing ${missing.length} writer(s): ${missing.join(', ')}`,
      fix: 'Run `git warp materialize` to update the coverage anchor',
      evidence: { missingWriters: missing },
    };
  }
  return {
    id: 'coverage-complete', status: 'ok', code: CODES.COVERAGE_OK,
    impact: 'operability', message: 'Coverage anchor includes all writers',
  };
}

// ── checkpoint-fresh ────────────────────────────────────────────────────────

/**
 * Read the commit date of a checkpoint and compute its age in hours.
 * @param {import('../../types.js').Persistence} persistence
 * @param {string} checkpointSha
 * @returns {Promise<{date: string|null, ageHours: number|null}>}
 */
async function getCheckpointAge(persistence, checkpointSha) {
  const info = await persistence.getNodeInfo(checkpointSha);
  const date = typeof info.date === 'string' && info.date.length > 0 ? info.date : null;
  return parseCheckpointDate(date);
}

/**
 * Parse a date string into an age-in-hours value, returning nulls for missing or unparseable dates.
 * @param {string|null} date
 * @returns {{date: string|null, ageHours: number|null}}
 */
function parseCheckpointDate(date) {
  if (date === null) {
    return { date: null, ageHours: null };
  }
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return { date, ageHours: null };
  }
  return { date, ageHours: (Date.now() - parsed) / (1000 * 60 * 60) };
}

/**
 * Verify the checkpoint exists and is not stale.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding>}
 */
export async function checkCheckpointFresh(ctx) {
  try {
    const ref = buildCheckpointRef(ctx.graphName);
    const sha = await ctx.persistence.readRef(ref);

    if (typeof sha !== 'string' || sha.length === 0) {
      return {
        id: 'checkpoint-fresh', status: 'warn', code: CODES.CHECKPOINT_MISSING,
        impact: 'operability', message: 'No checkpoint found',
        fix: 'Run `git warp materialize` to create a checkpoint',
      };
    }

    const { date, ageHours } = await getCheckpointAge(ctx.persistence, sha);
    return buildCheckpointFinding({ sha, date, ageHours, maxAge: ctx.policy.checkpointMaxAgeHours });
  } catch (err) {
    return internalError('checkpoint-fresh', err);
  }
}

/**
 * Build a finding from checkpoint age analysis.
 * @param {{sha: string, date: string|null, ageHours: number|null, maxAge: number}} p
 * @returns {DoctorFinding}
 */
function buildCheckpointFinding({ sha, date, ageHours, maxAge }) {
  if (ageHours === null) {
    return {
      id: 'checkpoint-fresh', status: 'ok', code: CODES.CHECKPOINT_OK,
      impact: 'operability', message: 'Checkpoint exists (age unknown)',
      evidence: { sha, date },
    };
  }
  if (ageHours > maxAge) {
    return {
      id: 'checkpoint-fresh', status: 'warn', code: CODES.CHECKPOINT_STALE,
      impact: 'operability',
      message: `Checkpoint is ${Math.round(ageHours)} hours old (threshold: ${maxAge}h)`,
      fix: 'Run `git warp materialize` to refresh the checkpoint',
      evidence: { sha, date, ageHours: Math.round(ageHours) },
    };
  }
  return {
    id: 'checkpoint-fresh', status: 'ok', code: CODES.CHECKPOINT_OK,
    impact: 'operability', message: 'Checkpoint is fresh',
    evidence: { sha, date, ageHours: Math.round(ageHours) },
  };
}

// ── audit-consistent ────────────────────────────────────────────────────────

/**
 * Check individual audit refs for dangling objects.
 * @param {DoctorContext} ctx
 * @param {string} ref
 * @returns {Promise<DoctorFinding|null>}
 */
async function probeOneAuditRef(ctx, ref) {
  const sha = await ctx.persistence.readRef(ref);
  if (typeof sha !== 'string' || sha.length === 0) {
    return null;
  }
  const exists = await ctx.persistence.nodeExists(sha);
  if (!exists) {
    return {
      id: 'audit-consistent', status: 'warn', code: CODES.AUDIT_DANGLING,
      impact: 'data_integrity',
      message: `Audit ref ${ref} points to missing object ${sha.slice(0, 7)}`,
      evidence: { ref, sha },
    };
  }
  return null;
}

/**
 * Detect writers without corresponding audit refs.
 * @param {DoctorContext} ctx
 * @param {string[]} auditRefs
 * @param {string} auditPrefix
 * @returns {DoctorFinding|null}
 */
function detectPartialCoverage(ctx, auditRefs, auditPrefix) {
  const writerIds = new Set(ctx.writerHeads.map((h) => h.writerId));
  const auditIdSet = new Set(auditRefs.map((r) => r.slice(auditPrefix.length)).filter((id) => id.length > 0));
  const missing = [...writerIds].filter((id) => !auditIdSet.has(id));

  if (missing.length > 0 && auditIdSet.size > 0) {
    return {
      id: 'audit-consistent', status: 'warn', code: CODES.AUDIT_PARTIAL,
      impact: 'data_integrity',
      message: `Audit coverage is partial: writers without audit refs: ${missing.join(', ')}`,
      fix: 'Run `git warp verify-audit` to verify existing chains',
      evidence: { writersWithoutAudit: missing },
    };
  }
  return null;
}

/**
 * Probe all audit refs for dangling objects and partial coverage.
 * @param {DoctorContext} ctx
 * @param {string[]} auditRefs
 * @param {string} auditPrefix
 * @returns {Promise<DoctorFinding[]>}
 */
async function probeAuditRefs(ctx, auditRefs, auditPrefix) {
  const danglingFindings = await probeDanglingAuditRefs(ctx, auditRefs);
  const partialFinding = detectPartialCoverage(ctx, auditRefs, auditPrefix);
  if (partialFinding !== null && partialFinding !== undefined) {
    danglingFindings.push(partialFinding);
  }
  return danglingFindings;
}

/**
 * Check each audit ref for dangling objects.
 * @param {DoctorContext} ctx
 * @param {string[]} auditRefs
 * @returns {Promise<DoctorFinding[]>}
 */
async function probeDanglingAuditRefs(ctx, auditRefs) {
  const findings = /** @type {DoctorFinding[]} */ ([]);
  for (const ref of auditRefs) {
    const finding = await probeOneAuditRef(ctx, ref);
    if (finding !== null && finding !== undefined) {
      findings.push(finding);
    }
  }
  return findings;
}

/**
 * Verify audit refs are consistent and cover all writers.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding[]>}
 */
export async function checkAuditConsistent(ctx) {
  try {
    const auditPrefix = buildAuditPrefix(ctx.graphName);
    const auditRefs = await ctx.persistence.listRefs(auditPrefix);

    if (auditRefs.length === 0) {
      return [{
        id: 'audit-consistent', status: 'ok', code: CODES.AUDIT_OK,
        impact: 'data_integrity', message: 'No audit refs present (none expected)',
      }];
    }

    const findings = await probeAuditRefs(ctx, auditRefs, auditPrefix);
    if (findings.length === 0) {
      findings.push({
        id: 'audit-consistent', status: 'ok', code: CODES.AUDIT_OK,
        impact: 'data_integrity', message: `All ${auditRefs.length} audit ref(s) are consistent`,
      });
    }
    return findings;
  } catch (err) {
    return [internalError('audit-consistent', err)];
  }
}

// ── clock-skew ──────────────────────────────────────────────────────────────

/**
 * Collect parsed commit dates from writer head commits.
 * @param {DoctorContext} ctx
 * @returns {Promise<Array<{writerId: string, ms: number}>>}
 */
async function collectWriterDates(ctx) {
  const dates = [];
  for (const head of ctx.writerHeads) {
    if (typeof head.sha !== 'string' || head.sha.length === 0) {
      continue;
    }
    const entry = await parseWriterDate(ctx.persistence, { writerId: head.writerId, sha: /** @type {string} */ (head.sha) });
    if (entry !== null) {
      dates.push(entry);
    }
  }
  return dates;
}

/**
 * Parse the commit date from a single writer head into a timestamped entry.
 * @param {import('../../types.js').Persistence} persistence
 * @param {{ writerId: string, sha: string }} head
 * @returns {Promise<{writerId: string, ms: number}|null>}
 */
async function parseWriterDate(persistence, head) {
  const info = await persistence.getNodeInfo(head.sha);
  const raw = typeof info.date === 'string' && info.date.length > 0 ? info.date : '';
  const ms = raw.length > 0 ? Date.parse(raw) : NaN;
  return Number.isNaN(ms) ? null : { writerId: head.writerId, ms };
}

/**
 * Build the skew finding from the computed spread.
 * @param {number} spreadMs
 * @param {DoctorContext} ctx
 * @returns {DoctorFinding}
 */
function buildSkewFinding(spreadMs, ctx) {
  if (spreadMs > ctx.policy.clockSkewMs) {
    return {
      id: 'clock-skew', status: 'warn', code: CODES.CLOCK_SKEW_EXCEEDED,
      impact: 'operability',
      message: `Clock skew is ${Math.round(spreadMs / 1000)}s (threshold: ${Math.round(ctx.policy.clockSkewMs / 1000)}s)`,
      evidence: { spreadMs, thresholdMs: ctx.policy.clockSkewMs },
    };
  }
  return {
    id: 'clock-skew', status: 'ok', code: CODES.CLOCK_SYNCED,
    impact: 'operability',
    message: `Clock skew is within threshold (${Math.round(spreadMs / 1000)}s)`,
    evidence: { spreadMs },
  };
}

/**
 * Detect excessive clock skew between writer head commits.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding>}
 */
export async function checkClockSkew(ctx) {
  try {
    if (ctx.writerHeads.length < 2) {
      return {
        id: 'clock-skew', status: 'ok', code: CODES.CLOCK_SYNCED,
        impact: 'operability', message: 'Clock skew check skipped (fewer than 2 writers)',
      };
    }

    const dates = await collectWriterDates(ctx);
    if (dates.length < 2) {
      return {
        id: 'clock-skew', status: 'ok', code: CODES.CLOCK_SYNCED,
        impact: 'operability', message: 'Clock skew check skipped (insufficient date data)',
      };
    }

    const spreadMs = Math.max(...dates.map((d) => d.ms)) - Math.min(...dates.map((d) => d.ms));
    return buildSkewFinding(spreadMs, ctx);
  } catch (err) {
    return internalError('clock-skew', err);
  }
}

// ── hooks-installed ─────────────────────────────────────────────────────────

/**
 * Check whether the warp post-merge hook is installed and current.
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding>}
 */
export async function checkHooksInstalled(ctx) {
  try {
    const installer = createHookInstaller();
    const s = installer.getHookStatus(ctx.repoPath);
    return await Promise.resolve(buildHookFinding(s));
  } catch (err) {
    return internalError('hooks-installed', err);
  }
}

/**
 * Build a finding describing the hook installation state.
 * @param {{ installed: boolean, version?: string, current?: boolean, foreign?: boolean, hookPath: string }} s
 * @returns {DoctorFinding}
 */
function buildHookFinding(s) {
  if (!s.installed) {
    return buildUninstalledHookFinding(Boolean(s.foreign));
  }
  return buildInstalledHookFinding(s);
}

/**
 * Build a finding for a hook that is installed but may be outdated.
 * @param {{ version?: string, current?: boolean }} s
 * @returns {DoctorFinding}
 */
function buildInstalledHookFinding(s) {
  if (s.current !== true) {
    return {
      id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_OUTDATED,
      impact: 'hygiene', message: `Hook is outdated (v${s.version})`,
      fix: 'Run `git warp install-hooks` to upgrade',
      evidence: { version: s.version ?? null },
    };
  }
  return {
    id: 'hooks-installed', status: 'ok', code: CODES.HOOKS_OK,
    impact: 'hygiene', message: `Hook is installed and current (v${s.version})`,
  };
}

/**
 * Build a finding for a missing hook, distinguishing foreign hooks.
 * @param {boolean} isForeign
 * @returns {DoctorFinding}
 */
function buildUninstalledHookFinding(isForeign) {
  if (isForeign) {
    return {
      id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_MISSING,
      impact: 'hygiene', message: 'Foreign hook present; warp hook not installed',
      fix: 'Run `git warp install-hooks` (use --force to replace existing hook)',
    };
  }
  return {
    id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_MISSING,
    impact: 'hygiene', message: 'Post-merge hook is not installed',
    fix: 'Run `git warp install-hooks`',
  };
}

// ── registry ────────────────────────────────────────────────────────────────

/**
 * All checks in execution order.
 * @type {Array<{id: string, fn: function(DoctorContext): Promise<DoctorFinding|DoctorFinding[]|null>}>}
 */
export const ALL_CHECKS = [
  { id: 'repo-accessible', fn: checkRepoAccessible },
  { id: 'refs-consistent', fn: checkRefsConsistent },
  { id: 'coverage-complete', fn: checkCoverageComplete },
  { id: 'checkpoint-fresh', fn: checkCheckpointFresh },
  { id: 'audit-consistent', fn: checkAuditConsistent },
  { id: 'clock-skew', fn: checkClockSkew },
  { id: 'hooks-installed', fn: checkHooksInstalled },
];
