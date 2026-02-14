/**
 * Single source of truth for all doctor finding codes.
 *
 * Every code string referenced in checks.js and tests MUST come from here.
 * Prevents drift and typos across the codebase.
 *
 * @module cli/commands/doctor/codes
 */

export const CODES = {
  // repo-accessible
  REPO_OK: 'REPO_OK',
  REPO_UNREACHABLE: 'REPO_UNREACHABLE',

  // refs-consistent
  REFS_OK: 'REFS_OK',
  REFS_DANGLING_OBJECT: 'REFS_DANGLING_OBJECT',

  // coverage-complete
  COVERAGE_OK: 'COVERAGE_OK',
  COVERAGE_MISSING_WRITERS: 'COVERAGE_MISSING_WRITERS',
  COVERAGE_NO_REF: 'COVERAGE_NO_REF',

  // checkpoint-fresh
  CHECKPOINT_OK: 'CHECKPOINT_OK',
  CHECKPOINT_MISSING: 'CHECKPOINT_MISSING',
  CHECKPOINT_STALE: 'CHECKPOINT_STALE',

  // audit-consistent
  AUDIT_OK: 'AUDIT_OK',
  AUDIT_DANGLING: 'AUDIT_DANGLING',
  AUDIT_PARTIAL: 'AUDIT_PARTIAL',

  // clock-skew
  CLOCK_SYNCED: 'CLOCK_SYNCED',
  CLOCK_SKEW_EXCEEDED: 'CLOCK_SKEW_EXCEEDED',

  // hooks-installed
  HOOKS_OK: 'HOOKS_OK',
  HOOKS_MISSING: 'HOOKS_MISSING',
  HOOKS_OUTDATED: 'HOOKS_OUTDATED',

  // meta
  CHECK_SKIPPED_BUDGET_EXHAUSTED: 'CHECK_SKIPPED_BUDGET_EXHAUSTED',
  CHECK_INTERNAL_ERROR: 'CHECK_INTERNAL_ERROR',
};
