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
 * Extended WarpRuntime type that includes mixin methods wired at runtime.
 * Use this as the `this` type in method files that call other mixin methods.
 */
export type WarpGraphWithMixins = import('../WarpRuntime.ts').default & {
  _readPatchBlob(patchMeta: { patchOid: string; storage: import('../../ports/CommitMessageCodecPort.ts').PatchStorageRoute }): Promise<Uint8Array>;
};

// ── Shared constants ────────────────────────────────────────────────────────
export const DEFAULT_ADJACENCY_CACHE_SIZE = 3;
export const E_NO_STATE_MSG = 'No materialized state. Call materialize() before querying, or use autoMaterialize: true (the default). See https://github.com/git-stunts/git-warp#materialization';
export const E_STALE_STATE_MSG = 'State is stale (patches written since last materialize). Call materialize() to refresh. See https://github.com/git-stunts/git-warp#materialization';
