/**
 * Error class for sync transport and replication operations.
 *
 * SyncError is thrown when synchronization between WARP graph instances fails.
 * This includes HTTP transport failures, protocol violations, timeout errors,
 * and invalid remote responses. It provides structured error information via
 * error codes and context objects for programmatic handling and retry logic.
 *
 * ## When This Error Is Thrown
 *
 * - **Invalid remote URL**: The sync target URL is malformed or uses an unsupported protocol
 * - **Network failures**: Connection refused, DNS resolution failure, or other network errors
 * - **Timeout**: The sync request exceeded the configured timeout duration
 * - **Server errors (5xx)**: The remote server returned an internal error
 * - **Client errors (4xx)**: Protocol violation or invalid request
 * - **Invalid response**: The remote returned malformed JSON or an invalid sync response structure
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_SYNC_REMOTE_URL` | Invalid or unsupported remote URL (malformed URL or non-HTTP(S) protocol) |
 * | `E_SYNC_NETWORK` | Network-level failure (connection refused, DNS failure, etc.) |
 * | `E_SYNC_TIMEOUT` | Sync request exceeded the configured timeout |
 * | `E_SYNC_REMOTE` | Remote server returned a 5xx error |
 * | `E_SYNC_PROTOCOL` | Protocol violation: 4xx response, invalid JSON, or malformed sync response |
 * | `SYNC_ERROR` | Generic/default sync error |
 *
 * ## Context Structure
 *
 * The context object varies by error code but commonly includes:
 * - `remote`: The remote URL that was being synced to
 * - `protocol`: The URL protocol when it's unsupported (e.g., 'ftp:')
 * - `status`: HTTP status code for server/protocol errors
 * - `timeoutMs`: Timeout duration in milliseconds
 * - `message`: Original error message from underlying network error
 *
 * @class SyncError
 * @extends Error
 *
 * @property {string} name - Always 'SyncError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 *
 * @example
 * // Handling network errors with retry
 * try {
 *   await graph.sync('https://remote.example.com/warp');
 * } catch (err) {
 *   if (err instanceof SyncError) {
 *     if (err.code === 'E_SYNC_TIMEOUT') {
 *       console.log(`Sync timed out after ${err.context.timeoutMs}ms`);
 *       // Implement exponential backoff retry
 *     } else if (err.code === 'E_SYNC_NETWORK') {
 *       console.log('Network error:', err.context.message);
 *       // Check connectivity and retry
 *     } else if (err.code === 'E_SYNC_REMOTE') {
 *       console.log(`Remote error: HTTP ${err.context.status}`);
 *       // Server issue, wait and retry
 *     }
 *   }
 * }
 *
 * @example
 * // Validating remote URL before sync
 * try {
 *   await graph.sync('ftp://invalid.example.com');
 * } catch (err) {
 *   console.error(err.code); // 'E_SYNC_REMOTE_URL'
 *   console.error(err.context); // { protocol: 'ftp:' }
 * }
 *
 * @example
 * // Error thrown internally by sync protocol
 * throw new SyncError('Invalid remote URL', {
 *   code: 'E_SYNC_REMOTE_URL',
 *   context: { remote: 'not-a-url' },
 * });
 */
export default class SyncError extends Error {
  /**
   * Creates a new SyncError.
   *
   * @param {string} message - Human-readable error message describing what went wrong
   * @param {Object} [options={}] - Error options
   * @param {string} [options.code='SYNC_ERROR'] - Machine-readable error code.
   *   Should be one of the documented error codes (e.g., 'E_SYNC_TIMEOUT', 'E_SYNC_NETWORK').
   *   Falls back to 'SYNC_ERROR' if not provided.
   * @param {Object} [options.context={}] - Serializable context object containing
   *   additional debugging information. Should only contain JSON-serializable values.
   *   Common fields include `remote`, `status`, `timeoutMs`, `message`, and `protocol`.
   *
   * @example
   * throw new SyncError('Sync request timed out', {
   *   code: 'E_SYNC_TIMEOUT',
   *   context: { timeoutMs: 30000 },
   * });
   *
   * @example
   * throw new SyncError('Network error', {
   *   code: 'E_SYNC_NETWORK',
   *   context: { message: 'Connection refused' },
   * });
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'SyncError';
    this.code = options.code || 'SYNC_ERROR';
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
