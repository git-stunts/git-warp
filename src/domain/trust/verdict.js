/**
 * Trust V1 verdict derivation.
 *
 * Deterministic mapping from TrustAssessment to verdict string.
 * This is the single source of truth for verdict logic.
 *
 * @module domain/trust/verdict
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 13
 */

/**
 * @typedef {Object} TrustAssessmentV1
 * @property {'not_configured'|'configured'|'pinned'|'error'} status
 * @property {string[]} untrustedWriters
 */

/**
 * Derives the trust verdict from a V1 trust assessment.
 *
 * Mapping (evaluated in order):
 * - status 'not_configured' → 'not_configured'
 * - status 'error'          → 'fail'
 * - untrustedWriters.length > 0 → 'fail'
 * - otherwise               → 'pass'
 *
 * V1 has no 'degraded' verdict — untrusted writers are a hard failure.
 *
 * @param {TrustAssessmentV1} trust
 * @returns {'pass'|'fail'|'not_configured'}
 */
export function deriveTrustVerdict(trust) {
  if (trust.status === 'not_configured') {
    return 'not_configured';
  }
  if (trust.status === 'error') {
    return 'fail';
  }
  if (Array.isArray(trust.untrustedWriters) && trust.untrustedWriters.length > 0) {
    return 'fail';
  }
  return 'pass';
}
