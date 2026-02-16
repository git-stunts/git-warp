/**
 * Shared constants and re-exports for WarpGraph method files.
 *
 * Method files (`*.methods.js`) import from here to avoid
 * brittle relative paths back into the domain root.
 *
 * @module domain/warp/_internal
 */

// ── Error constructors ──────────────────────────────────────────────────────
export { default as QueryError } from '../errors/QueryError.js';
export { default as ForkError } from '../errors/ForkError.js';
export { default as SyncError } from '../errors/SyncError.js';
export { default as OperationAbortedError } from '../errors/OperationAbortedError.js';

// ── Shared constants ────────────────────────────────────────────────────────
export const DEFAULT_ADJACENCY_CACHE_SIZE = 3;
export const E_NO_STATE_MSG = 'No materialized state. Call materialize() before querying, or use autoMaterialize: true (the default). See https://github.com/git-stunts/git-warp#materialization';
export const E_STALE_STATE_MSG = 'State is stale (patches written since last materialize). Call materialize() to refresh. See https://github.com/git-stunts/git-warp#materialization';

// ── Sync constants ──────────────────────────────────────────────────────────
export const DEFAULT_SYNC_SERVER_MAX_BYTES = 4 * 1024 * 1024;
export const DEFAULT_SYNC_WITH_RETRIES = 3;
export const DEFAULT_SYNC_WITH_BASE_DELAY_MS = 250;
export const DEFAULT_SYNC_WITH_MAX_DELAY_MS = 2000;
export const DEFAULT_SYNC_WITH_TIMEOUT_MS = 10_000;
