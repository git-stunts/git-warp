/**
 * Trust V1 verdict derivation.
 *
 * Deterministic mapping from trust status + untrusted writers to verdict.
 * This is the single source of truth for verdict logic.
 *
 * @module domain/trust/verdict
 * @see docs/specs/TRUST_CRYPTO_ALGORITHM.md Section 13
 */

/** The subset of trust data needed for verdict derivation. */
type VerdictInput = {
  readonly status: 'not_configured' | 'configured' | 'pinned' | 'error';
  readonly untrustedWriters: readonly string[];
};

/** Possible trust verdicts. */
type TrustVerdict = 'pass' | 'fail' | 'not_configured';

/**
 * Derives the trust verdict from a V1 trust assessment.
 *
 * Mapping (evaluated in order):
 * - status 'not_configured' -> 'not_configured'
 * - status 'error'          -> 'fail'
 * - untrustedWriters.length > 0 -> 'fail'
 * - otherwise               -> 'pass'
 *
 * The current trust contract has no 'degraded' verdict -- untrusted writers are a hard failure.
 */
function deriveTrustVerdict(trust: VerdictInput): TrustVerdict {
  if (trust.status === 'not_configured') {
    return 'not_configured';
  }
  if (trust.status === 'error') {
    return 'fail';
  }
  if (trust.untrustedWriters.length > 0) {
    return 'fail';
  }
  return 'pass';
}

export { deriveTrustVerdict };
export type { TrustVerdict, VerdictInput };
