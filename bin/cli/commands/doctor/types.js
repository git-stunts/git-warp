/**
 * Type definitions for the `doctor` command.
 *
 * @module cli/commands/doctor/types
 */

// ── JSON-safe recursive value type ──────────────────────────────────────────

/** @typedef {null | boolean | number | string | Array<unknown> | {[k:string]: unknown}} JsonValue */

/** @typedef {{[k:string]: JsonValue}} FindingEvidence */

// ── Finding ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DoctorFinding
 * @property {string} id - Check identifier (e.g. 'repo-accessible')
 * @property {'ok'|'warn'|'fail'} status
 * @property {string} code - Machine-readable code from CODES registry
 * @property {'data_integrity'|'security'|'operability'|'hygiene'} impact
 * @property {string} message - Human-readable summary
 * @property {string} [fix] - Suggested remediation command or instruction
 * @property {string} [helpUrl] - Stable documentation anchor
 * @property {FindingEvidence} [evidence] - JSON-safe supporting data
 * @property {number} [durationMs] - Time spent on this check
 */

// ── Policy ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DoctorPolicy
 * @property {boolean} strict
 * @property {number} clockSkewMs
 * @property {number} checkpointMaxAgeHours
 * @property {number} globalDeadlineMs
 * @property {{[checkId:string]: number}} checkTimeouts
 */

// ── Payload ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DoctorPayload
 * @property {1} doctorVersion
 * @property {string} repo
 * @property {string} graph
 * @property {string} checkedAt - ISO 8601 timestamp
 * @property {'ok'|'degraded'|'failed'} health
 * @property {DoctorPolicy} policy
 * @property {DoctorSummary} summary
 * @property {DoctorFinding[]} findings
 * @property {number} durationMs
 */

/**
 * @typedef {Object} DoctorSummary
 * @property {number} checksRun
 * @property {number} findingsTotal
 * @property {number} ok
 * @property {number} warn
 * @property {number} fail
 * @property {string[]} priorityActions
 */

// ── Context passed to each check ────────────────────────────────────────────

/**
 * @typedef {Object} DoctorContext
 * @property {import('../../types.js').Persistence} persistence
 * @property {string} graphName
 * @property {Array<{writerId: string, sha: string|null, ref: string}>} writerHeads
 * @property {DoctorPolicy} policy
 * @property {string} repoPath
 */

/**
 * @callback DoctorCheck
 * @param {DoctorContext} ctx
 * @returns {Promise<DoctorFinding|DoctorFinding[]|null>}
 */

// ── Exit codes ──────────────────────────────────────────────────────────────

export const DOCTOR_EXIT_CODES = {
  OK: 0,
  FINDINGS: 3,
  STRICT_FINDINGS: 4,
};

export {};
