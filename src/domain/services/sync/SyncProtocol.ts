/**
 * SyncProtocol — frontier-based per-writer chain sync.
 *
 * Barrel re-export of the sync protocol split across focused sub-modules:
 * - syncPatchLoader    — patch loading helpers (loadPatchRange, etc.)
 * - syncDelta         — delta computation (computeSyncDelta, syncNeeded)
 * - syncRequestResponse — request/response protocol (createSyncRequest, etc.)
 *
 * @module domain/services/sync/SyncProtocol
 * @see WARP sync spec Section 11 (Network Sync)
 */

export type { DecodedPatch, LoadPatchRangeOptions } from './syncPatchLoader.ts';
export { normalizePatch, loadPatchFromCommit, loadPatchRange } from './syncPatchLoader.ts';

export type { WriterRange, SyncDelta } from './syncDelta.ts';
export { computeSyncDelta, syncNeeded } from './syncDelta.ts';

export type {
  SyncRequest,
  SyncResponse,
  SyncPatchEntry,
  SkippedWriterEntry,
  ProcessSyncRequestOptions,
  ApplySyncResponseResult,
} from './syncRequestResponse.ts';
export {
  createSyncRequest,
  processSyncRequest,
  applySyncResponse,
  createEmptySyncResponse,
} from './syncRequestResponse.ts';
