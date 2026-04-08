import WarpError, { type WarpErrorOptions } from './WarpError.ts';

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
 * | `E_AUDIT_WRITER_MISMATCH` | TickReceipt writer does not match the service's writerId |
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

  /** TickReceipt writer does not match the service's writerId. */
  static E_AUDIT_WRITER_MISMATCH = 'E_AUDIT_WRITER_MISMATCH';

  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, options.code ?? 'E_AUDIT_INVALID', options);
  }
}
