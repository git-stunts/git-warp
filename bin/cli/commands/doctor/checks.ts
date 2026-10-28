/**
 * Diagnostic check functions for `git warp doctor`.
 *
 * Each check follows the DoctorCheck callback signature and NEVER throws.
 * Internal errors are captured as `CHECK_INTERNAL_ERROR` findings.
 *
 * @module cli/commands/doctor/checks
 */

import {
  buildCoverageRef,
  buildAuditPrefix,
} from '../../../../src/domain/utils/RefLayout.ts';
import { CODES } from './codes.ts';
import { checkClockSkew, checkHooksInstalled } from './checksAux.ts';
import { checkConeBasisLag } from './checksConeBasis.ts';
export { checkClockSkew, checkConeBasisLag, checkHooksInstalled };
import type { DoctorFinding, DoctorContext } from './types.ts';

// ── helpers ─────────────────────────────────────────────────────────────────

/** Wrap an unexpected exception as an internal-error finding. */
function internalError(id: string, err: unknown): DoctorFinding {
  return {
    id,
    status: 'fail',
    code: CODES.CHECK_INTERNAL_ERROR,
    impact: 'data_integrity',
    message: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
  };
}

// ── repo-accessible ─────────────────────────────────────────────────────────

/** Verify the repository is reachable. */
export async function checkRepoAccessible(ctx: DoctorContext): Promise<DoctorFinding> {
  try {
    const health = await ctx.persistence.ping();
    if (!health.ok) {
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

/** Check whether a single ref points to an existing Git object. */
async function checkSingleRef(entry: { ref: string; sha: string; label: string }, ctx: DoctorContext): Promise<DoctorFinding | null> {
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

/** Verify all writer refs point to existing Git objects. */
export async function checkRefsConsistent(ctx: DoctorContext): Promise<DoctorFinding[]> {
  try {
    const allRefs = ctx.writerHeads.map((h) => ({
      ref: h.ref, sha: h.sha ?? '', label: `writer ${h.writerId}`,
    }));
    return await checkAllRefs(allRefs, ctx);
  } catch (err) {
    return [internalError('refs-consistent', err)];
  }
}

/** Iterate over all refs, collecting failure findings or a single OK finding. */
async function checkAllRefs(allRefs: Array<{ ref: string; sha: string; label: string }>, ctx: DoctorContext): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
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

/** Collect writer IDs whose heads are not reachable from the coverage anchor. */
async function findMissingWriters(ctx: DoctorContext, coverageSha: string): Promise<string[]> {
  const missing: string[] = [];
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

/** Verify the coverage octopus anchor includes all writers. */
export async function checkCoverageComplete(ctx: DoctorContext): Promise<DoctorFinding> {
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

/** Build a finding when the coverage ref does not exist. */
function buildCoverageNoRef(): DoctorFinding {
  return {
    id: 'coverage-complete', status: 'ok', code: CODES.COVERAGE_NO_REF,
    impact: 'operability',
    message: 'No coverage anchor; only the global checkpoint maintenance writes one, and public reads do not need it',
  };
}

/** Build a coverage finding based on the set of missing writer IDs. */
function buildCoverageFinding(missing: string[]): DoctorFinding {
  if (missing.length > 0) {
    return {
      id: 'coverage-complete', status: 'warn', code: CODES.COVERAGE_MISSING_WRITERS,
      impact: 'operability',
      message: `Coverage anchor is missing ${missing.length} writer(s): ${missing.join(', ')}`,
      fix: 'Run `git warp repair --lane <name> --action materialization` (global maintenance) to refresh the coverage anchor of the whole-state checkpoint',
      evidence: { missingWriters: missing },
    };
  }
  return {
    id: 'coverage-complete', status: 'ok', code: CODES.COVERAGE_OK,
    impact: 'operability', message: 'Coverage anchor includes all writers',
  };
}

// ── audit-consistent ────────────────────────────────────────────────────────

/** Check individual audit refs for dangling objects. */
async function probeOneAuditRef(ctx: DoctorContext, ref: string): Promise<DoctorFinding | null> {
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

/** Detect writers without corresponding audit refs. */
function detectPartialCoverage(ctx: DoctorContext, auditRefs: string[], auditPrefix: string): DoctorFinding | null {
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

/** Probe all audit refs for dangling objects and partial coverage. */
async function probeAuditRefs(ctx: DoctorContext, auditRefs: string[], auditPrefix: string): Promise<DoctorFinding[]> {
  const danglingFindings = await probeDanglingAuditRefs(ctx, auditRefs);
  const partialFinding = detectPartialCoverage(ctx, auditRefs, auditPrefix);
  if (partialFinding !== null && partialFinding !== undefined) {
    danglingFindings.push(partialFinding);
  }
  return danglingFindings;
}

/** Check each audit ref for dangling objects. */
async function probeDanglingAuditRefs(ctx: DoctorContext, auditRefs: string[]): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  for (const ref of auditRefs) {
    const finding = await probeOneAuditRef(ctx, ref);
    if (finding !== null && finding !== undefined) {
      findings.push(finding);
    }
  }
  return findings;
}

/** Verify audit refs are consistent and cover all writers. */
export async function checkAuditConsistent(ctx: DoctorContext): Promise<DoctorFinding[]> {
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

// ── registry ────────────────────────────────────────────────────────────────

/** All checks in execution order. */
export const ALL_CHECKS: Array<{ id: string; fn: (ctx: DoctorContext) => Promise<DoctorFinding | DoctorFinding[] | null> }> = [
  { id: 'repo-accessible', fn: checkRepoAccessible },
  { id: 'refs-consistent', fn: checkRefsConsistent },
  { id: 'coverage-complete', fn: checkCoverageComplete },
  { id: 'cone-basis-lag', fn: checkConeBasisLag },
  { id: 'audit-consistent', fn: checkAuditConsistent },
  { id: 'clock-skew', fn: checkClockSkew },
  { id: 'hooks-installed', fn: checkHooksInstalled },
];
