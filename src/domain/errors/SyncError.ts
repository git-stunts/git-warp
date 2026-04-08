import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for sync transport and replication operations.
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
 * | `E_SYNC_DIVERGENCE` | Writer chains have diverged (no common ancestor) |
 * | `SYNC_ERROR` | Generic/default sync error |
 */
export default class SyncError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'SYNC_ERROR', options);
  }
}
