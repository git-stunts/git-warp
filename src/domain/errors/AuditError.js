import WarpError from './WarpError.js';

/**
 * Error class for audit receipt validation and persistence failures.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_AUDIT_INVALID` | Receipt field validation failed (version, OIDs, ticks, etc.) |
 * | `E_AUDIT_CAS_FAILED` | Compare-and-swap failed during audit commit |
 * | `E_AUDIT_DEGRADED` | Audit service degraded after exhausting retries |
 * | `E_AUDIT_CHAIN_GAP` | Audit chain has a gap (missing commit in ancestry) |
 *
 * @class AuditError
 * @extends WarpError
 *
 * @property {string} name - Always 'AuditError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Record<string, unknown>} context - Serializable context object with error details
 */
export default class AuditError extends WarpError {
  /** Receipt field validation failed. */
  static E_AUDIT_INVALID = 'E_AUDIT_INVALID';

  /** Compare-and-swap failed during audit commit. */
  static E_AUDIT_CAS_FAILED = 'E_AUDIT_CAS_FAILED';

  /** Audit service degraded after exhausting retries. */
  static E_AUDIT_DEGRADED = 'E_AUDIT_DEGRADED';

  /** Audit chain has a gap (missing commit in ancestry). */
  static E_AUDIT_CHAIN_GAP = 'E_AUDIT_CHAIN_GAP';

  /**
   * Creates an AuditError with the given message and error code.
   * @param {string} message - Human-readable error description
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super(message, options.code ?? 'E_AUDIT_INVALID', options);
  }
}
