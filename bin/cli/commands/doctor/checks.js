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
 * @param {string} id
 * @param {*} err TODO(ts-cleanup): narrow error type
 * @returns {DoctorFinding}
 */
function internalError(id, err) {
  return {
    id,
    status: 'fail',
    code: CODES.CHECK_INTERNAL_ERROR,
    impact: 'data_integrity',
    message: `Internal error: ${err?.message || String(err)}`,
  };
}

// ── repo-accessible ─────────────────────────────────────────────────────────

/** @param {DoctorContext} ctx @returns {Promise<DoctorFinding>} */
export async function checkRepoAccessible(ctx) {
  try {
    const clock = ClockAdapter.global();
    const svc = new HealthCheckService({ persistence: /** @type {*} TODO(ts-cleanup): narrow port type */ (ctx.persistence), clock });
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
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow error type
    return internalError('repo-accessible', err);
  }
}

// ── refs-consistent ─────────────────────────────────────────────────────────

/** @param {DoctorContext} ctx @returns {Promise<DoctorFinding[]>} */
export async function checkRefsConsistent(ctx) {
  try {
    const findings = /** @type {DoctorFinding[]} */ ([]);
    const allRefs = ctx.writerHeads.map((h) => ({
      ref: h.ref, sha: h.sha, label: `writer ${h.writerId}`,
    }));
    let allOk = true;
    let checkedCount = 0;

    for (const { ref, sha, label } of allRefs) {
      if (!sha) {
        allOk = false;
        findings.push({
          id: 'refs-consistent', status: 'fail', code: CODES.REFS_DANGLING_OBJECT,
          impact: 'data_integrity',
          message: `Ref ${ref} points to a missing or unreadable object`,
          fix: `Investigate broken ref for ${label}`, evidence: { ref },
        });
        continue;
      }
      checkedCount++;
      const exists = await ctx.persistence.nodeExists(sha);
      if (!exists) {
        allOk = false;
        findings.push({
          id: 'refs-consistent', status: 'fail', code: CODES.REFS_DANGLING_OBJECT,
          impact: 'data_integrity',
          message: `Ref ${ref} points to missing object ${sha.slice(0, 7)}`,
          fix: `Investigate missing object for ${label}`, evidence: { ref, sha },
        });
      }
    }

    if (allOk) {
      findings.push({
        id: 'refs-consistent', status: 'ok', code: CODES.REFS_OK,
        impact: 'data_integrity', message: `All ${checkedCount} ref(s) point to existing objects`,
      });
    }
    return findings;
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow error type
    return [internalError('refs-consistent', err)];
  }
}

// ── coverage-complete ───────────────────────────────────────────────────────

/** @param {DoctorContext} ctx @returns {Promise<DoctorFinding>} */
export async function checkCoverageComplete(ctx) {
  try {
    const coverageRef = buildCoverageRef(ctx.graphName);
    const coverageSha = await ctx.persistence.readRef(coverageRef);

    if (!coverageSha) {
      return {
        id: 'coverage-complete', status: 'warn', code: CODES.COVERAGE_NO_REF,
        impact: 'operability', message: 'No coverage ref found',
        fix: 'Run `git warp materialize` to create a coverage anchor',
      };
    }

    const missing = [];
    for (const head of ctx.writerHeads) {
      if (!head.sha) {
        missing.push(head.writerId);
        continue;
      }
      const reachable = await ctx.persistence.isAncestor(head.sha, coverageSha);
      if (!reachable) {
        missing.push(head.writerId);
      }
    }

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
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow error type
    return internalError('coverage-complete', err);
  }
}

// ── checkpoint-fresh ────────────────────────────────────────────────────────

/**
 * @param {import('../../types.js').Persistence} persistence
 * @param {string} checkpointSha
 * @returns {Promise<{date: string|null, ageHours: number|null}>}
 */
async function getCheckpointAge(persistence, checkpointSha) {
  const info = await persistence.getNodeInfo(checkpointSha);
  const date = info.date || null;
  if (!date) {
    return { date: null, ageHours: null };
  }
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return { date, ageHours: null };
  }
  return { date, ageHours: (Date.now() - parsed) / (1000 * 60 * 60) };
}

/** @param {DoctorContext} ctx @returns {Promise<DoctorFinding>} */
export async function checkCheckpointFresh(ctx) {
  try {
    const ref = buildCheckpointRef(ctx.graphName);
    const sha = await ctx.persistence.readRef(ref);

    if (!sha) {
      return {
        id: 'checkpoint-fresh', status: 'warn', code: CODES.CHECKPOINT_MISSING,
        impact: 'operability', message: 'No checkpoint found',
        fix: 'Run `git warp materialize` to create a checkpoint',
      };
    }

    const { date, ageHours } = await getCheckpointAge(ctx.persistence, sha);
    return buildCheckpointFinding({ sha, date, ageHours, maxAge: ctx.policy.checkpointMaxAgeHours });
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow error type
    return internalError('checkpoint-fresh', err);
  }
}

/**
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
 * @param {DoctorContext} ctx
 * @param {string[]} auditRefs
 * @param {string} auditPrefix
 * @returns {Promise<DoctorFinding[]>}
 */
async function probeAuditRefs(ctx, auditRefs, auditPrefix) {
  const findings = /** @type {DoctorFinding[]} */ ([]);

  for (const ref of auditRefs) {
    const sha = await ctx.persistence.readRef(ref);
    if (!sha) {
      continue;
    }
    const exists = await ctx.persistence.nodeExists(sha);
    if (!exists) {
      findings.push({
        id: 'audit-consistent', status: 'warn', code: CODES.AUDIT_DANGLING,
        impact: 'data_integrity',
        message: `Audit ref ${ref} points to missing object ${sha.slice(0, 7)}`,
        evidence: { ref, sha },
      });
    }
  }

  const writerIds = new Set(ctx.writerHeads.map((h) => h.writerId));
  const auditIdSet = new Set(auditRefs.map((r) => r.slice(auditPrefix.length)).filter((id) => id.length > 0));
  const missing = [...writerIds].filter((id) => !auditIdSet.has(id));

  if (missing.length > 0 && auditIdSet.size > 0) {
    findings.push({
      id: 'audit-consistent', status: 'warn', code: CODES.AUDIT_PARTIAL,
      impact: 'data_integrity',
      message: `Audit coverage is partial: writers without audit refs: ${missing.join(', ')}`,
      fix: 'Run `git warp verify-audit` to verify existing chains',
      evidence: { writersWithoutAudit: missing },
    });
  }

  return findings;
}

/** @param {DoctorContext} ctx @returns {Promise<DoctorFinding[]>} */
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
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow error type
    return [internalError('audit-consistent', err)];
  }
}

// ── clock-skew ──────────────────────────────────────────────────────────────

/**
 * @param {DoctorContext} ctx
 * @returns {Promise<Array<{writerId: string, ms: number}>>}
 */
async function collectWriterDates(ctx) {
  const dates = [];
  for (const head of ctx.writerHeads) {
    if (!head.sha) {
      continue;
    }
    const info = await ctx.persistence.getNodeInfo(head.sha);
    const ms = info.date ? Date.parse(info.date) : NaN;
    if (!Number.isNaN(ms)) {
      dates.push({ writerId: head.writerId, ms });
    }
  }
  return dates;
}

/** @param {DoctorContext} ctx @returns {Promise<DoctorFinding>} */
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
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow error type
    return internalError('clock-skew', err);
  }
}

// ── hooks-installed ─────────────────────────────────────────────────────────

/**
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding>}
 */
// eslint-disable-next-line @typescript-eslint/require-await -- sync body, async contract
export async function checkHooksInstalled(ctx) {
  try {
    const installer = createHookInstaller();
    const s = installer.getHookStatus(ctx.repoPath);
    return buildHookFinding(s);
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): narrow error type
    return internalError('hooks-installed', err);
  }
}

/**
 * @param {*} s TODO(ts-cleanup): narrow hook status type
 * @returns {DoctorFinding}
 */
function buildHookFinding(s) {
  if (!s.installed && s.foreign) {
    return {
      id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_MISSING,
      impact: 'hygiene', message: 'Foreign hook present; warp hook not installed',
      fix: 'Run `git warp install-hooks` (use --force to replace existing hook)',
    };
  }
  if (!s.installed) {
    return {
      id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_MISSING,
      impact: 'hygiene', message: 'Post-merge hook is not installed',
      fix: 'Run `git warp install-hooks`',
    };
  }
  if (!s.current) {
    return {
      id: 'hooks-installed', status: 'warn', code: CODES.HOOKS_OUTDATED,
      impact: 'hygiene', message: `Hook is outdated (v${s.version})`,
      fix: 'Run `git warp install-hooks` to upgrade',
      evidence: { version: s.version },
    };
  }
  return {
    id: 'hooks-installed', status: 'ok', code: CODES.HOOKS_OK,
    impact: 'hygiene', message: `Hook is installed and current (v${s.version})`,
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
