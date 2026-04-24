/**
 * Shared constants and re-exports for WarpRuntime method files.
 *
 * Method files (`*.methods.js`) import from here to avoid
 * brittle relative paths back into the domain root.
 *
 * @module domain/warp/_internal
 */

// ── Error constructors ──────────────────────────────────────────────────────
export { default as QueryError } from '../errors/QueryError.ts';
export { default as ForkError } from '../errors/ForkError.ts';
export { default as StrandError } from '../errors/StrandError.ts';

/**
 * Compatibility alias for the runtime-backed graph surface while the
 * remaining WarpRuntime cleanup finishes landing.
 */
export type WarpGraphWithMixins = import('../WarpRuntime.ts').default;

// ── Shared constants ────────────────────────────────────────────────────────
export const DEFAULT_ADJACENCY_CACHE_SIZE = 3;
export const E_NO_STATE_MSG = 'No materialized state. Call materialize() before querying, or use autoMaterialize: true (the default). See https://github.com/git-stunts/git-warp#materialization';
export const E_STALE_STATE_MSG = 'State is stale (patches written since last materialize). Call materialize() to refresh. See https://github.com/git-stunts/git-warp#materialization';
