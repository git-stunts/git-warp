import WarpError from './WarpError.js';

/**
 * Error class for sync transport and replication operations.
 *
 * SyncError is thrown when synchronization between WARP graph instances fails.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_SYNC_REMOTE_URL` | Invalid or unsupported remote URL |
 * | `E_SYNC_NETWORK` | Network-level failure |
 * | `E_SYNC_TIMEOUT` | Sync request exceeded timeout |
 * | `E_SYNC_REMOTE` | Remote server returned a 5xx error |
 * | `E_SYNC_PROTOCOL` | Protocol violation: 4xx, invalid JSON, or malformed response |
 * | `E_SYNC_PAYLOAD_INVALID` | Sync payload failed shape/resource-limit validation (B64) |
 * | `SYNC_ERROR` | Generic/default sync error |
 *
 * @class SyncError
 * @extends WarpError
 *
 * @property {string} name - Always 'SyncError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Record<string, unknown>} context - Serializable context object with error details
 */
export default class SyncError extends WarpError {
  /**
   * Creates a SyncError with message and optional error code.
   * @param {string} message - Human-readable error description
   * @param {{ code?: string, context?: Record<string, unknown> }} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super(message, 'SYNC_ERROR', options);
  }
}
