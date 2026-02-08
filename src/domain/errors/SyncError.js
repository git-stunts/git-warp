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
 * | `SYNC_ERROR` | Generic/default sync error |
 *
 * @class SyncError
 * @extends WarpError
 *
 * @property {string} name - Always 'SyncError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 */
export default class SyncError extends WarpError {
  constructor(message, options = {}) {
    super(message, 'SYNC_ERROR', options);
  }
}
