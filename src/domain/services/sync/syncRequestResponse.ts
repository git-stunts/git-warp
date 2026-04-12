/**
 * syncRequestResponse — request/response protocol for WARP V5 sync.
 *
 * Handles creation and processing of SyncRequest/SyncResponse messages,
 * plus the client-side application of received patches.
 *
 * @module domain/services/sync/syncRequestResponse
 * @see SyncProtocol — WARP V5 Spec Section 11 (Network Sync)
 * @see JoinReducer — CRDT merge implementation
 */

import nullLogger from '../../utils/nullLogger.ts';
import { assertOpsCompatible, SCHEMA_V3 } from '../codec/WarpMessageCodec.ts';
import { applyFast, cloneState, isKnownRawOp } from '../JoinReducer.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';
import SyncError from '../../errors/SyncError.ts';
import { cloneFrontier, updateFrontier } from '../Frontier.ts';
import { computeSyncDelta } from './syncDelta.ts';
import { normalizePatch, loadPatchRange, type DecodedPatch } from './syncPatchLoader.ts';
import type WarpState from '../state/WarpState.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A sync request message sent from one node to another.
 *
 * The requester sends its current frontier, allowing the responder to
 * compute what patches the requester is missing.
 */
export interface SyncRequest {
  /** Message type discriminator for protocol parsing */
  type: 'sync-request';
  /**
   * Requester's frontier as a plain object.
   * Keys are writer IDs, values are the SHA of each writer's latest known patch.
   * Converted from Map for JSON serialization.
   */
  frontier: Record<string, string>;
}

/** A patch entry in a sync response. */
export interface SyncPatchEntry {
  writerId: string;
  sha: string;
  patch: DecodedPatch;
}

/** A writer that was skipped during sync (e.g. divergence or trust gate). */
export interface SkippedWriterEntry {
  writerId: string;
  reason: string;
  localSha: string;
  remoteSha: string | null;
}

/**
 * A sync response message containing patches the requester needs.
 *
 * The responder includes its own frontier (so the requester knows what
 * the responder is missing) and the patches the requester needs to catch up.
 */
export interface SyncResponse {
  /** Message type discriminator for protocol parsing */
  type: 'sync-response';
  /**
   * Responder's frontier as a plain object.
   * Keys are writer IDs, values are SHAs.
   */
  frontier: Record<string, string>;
  /** Patches the requester needs, in chronological order per writer */
  patches: SyncPatchEntry[];
  /** Writers that were skipped during sync */
  skippedWriters?: SkippedWriterEntry[];
}

export interface ProcessSyncRequestOptions {
  patchJournal?: PatchJournalPort;
  logger?: LoggerPort;
}

export interface ApplySyncResponseResult {
  state: WarpState;
  frontier: Map<string, string>;
  applied: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a frontier Map to a plain object for JSON serialization.
 */
function frontierToObject(map: Map<string, string>): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [writerId, sha] of map) {
    obj[writerId] = sha;
  }
  return obj;
}

/**
 * Converts a frontier plain object back to a Map.
 */
function objectToFrontier(obj: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(obj));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Creates a sync request message.
 *
 * Converts the frontier Map to a plain object for JSON serialization.
 * The resulting message can be sent over HTTP, WebSocket, or any other
 * transport that supports JSON.
 *
 * @param frontier - Local frontier mapping writer IDs to their latest known patch SHAs
 * @returns A sync request message ready for serialization
 *
 * @example
 * const frontier = new Map([['w1', 'sha-a'], ['w2', 'sha-b']]);
 * const request = createSyncRequest(frontier);
 * // { type: 'sync-request', frontier: { w1: 'sha-a', w2: 'sha-b' } }
 */
export function createSyncRequest(frontier: Map<string, string>): SyncRequest {
  return {
    type: 'sync-request',
    frontier: frontierToObject(frontier),
  };
}

/**
 * Processes a sync request and returns patches the requester needs.
 *
 * This is the server-side handler for sync requests. It:
 * 1. Converts the incoming frontier from plain object to Map
 * 2. Computes what the requester is missing (using computeSyncDelta)
 * 3. Loads the missing patches from storage
 * 4. Returns a response with the local frontier and patches
 *
 * **Error handling**: If divergence is detected for a writer (their chain
 * has forked), that writer is silently skipped. The requester will not
 * receive patches for that writer and may need to handle this separately.
 *
 * @param request - Incoming sync request containing the requester's frontier
 * @param localFrontier - Local frontier (what this node has)
 * @param persistence - Git persistence layer for loading patches
 * @param graphName - Graph name for error messages and logging
 * @param options - Options including optional patchJournal and logger
 * @returns Response containing local frontier and patches
 * @throws {Error} If patch loading fails for reasons other than divergence
 *
 * @example
 * // Server-side sync handler
 * app.post('/sync', async (req, res) => {
 *   const request = req.body;
 *   const response = await processSyncRequest(request, localFrontier, persistence, 'events');
 *   res.json(response);
 * });
 */
export async function processSyncRequest(
  request: SyncRequest,
  localFrontier: Map<string, string>,
  persistence: CommitPort & BlobPort,
  graphName: string,
  { patchJournal, logger }: ProcessSyncRequestOptions = {},
): Promise<SyncResponse> {
  const log = logger ?? nullLogger;

  const remoteFrontier = objectToFrontier(request.frontier);

  // Compute what the requester needs
  const delta = computeSyncDelta(remoteFrontier, localFrontier);

  // Load patches that the requester needs (from local to requester)
  const patches: SyncPatchEntry[] = [];
  const skippedWriters: SkippedWriterEntry[] = [];

  for (const [writerId, range] of delta.needFromRemote) {
    try {
      // Pre-check ancestry to avoid expensive chain walk (B107 / S3 fix).
      // If the persistence layer provides isAncestor, use it to detect
      // divergence early without walking the full commit chain.
      const persistenceWithIsAncestor = persistence as CommitPort & BlobPort & { isAncestor?: (a: string, b: string) => Promise<boolean> };
      const hasIsAncestor = typeof persistenceWithIsAncestor.isAncestor === 'function';
      if (range.from !== null && range.from !== undefined && range.from.length > 0 && hasIsAncestor) {
        const isAnc = await persistenceWithIsAncestor.isAncestor!(range.from, range.to);
        if (!isAnc) {
          const entry: SkippedWriterEntry = {
            writerId,
            reason: 'E_SYNC_DIVERGENCE',
            localSha: range.to,
            remoteSha: range.from,
          };
          skippedWriters.push(entry);
          log.warn('Sync divergence detected — skipping writer', {
            code: 'E_SYNC_DIVERGENCE',
            graphName,
            ...entry,
          });
          continue;
        }
      }

      // Prefer streaming scan when patchJournal supports it; fall back to legacy array load.
      if (patchJournal !== undefined && patchJournal !== null && typeof patchJournal.scanPatchRange === 'function') {
        const stream = patchJournal.scanPatchRange(writerId, range.from, range.to);
        for await (const entry of stream) {
          patches.push({ writerId, sha: entry.sha, patch: entry.patch as unknown as DecodedPatch });
        }
      } else {
        const writerPatches = await loadPatchRange(
          persistence, graphName, writerId, range.from, range.to, patchJournal !== undefined ? { patchJournal } : {},
        );
        for (const { patch, sha } of writerPatches) {
          patches.push({ writerId, sha, patch });
        }
      }
    } catch (err) {
      // If we detect divergence, log and skip this writer (B65).
      // The requester will not receive patches for this writer.
      const isSyncDivergence =
        (err instanceof SyncError && (err as SyncError & { code?: string }).code === 'E_SYNC_DIVERGENCE') ||
        (err instanceof Error && err.message?.includes('Divergence detected'));
      if (isSyncDivergence) {
        const entry: SkippedWriterEntry = {
          writerId,
          reason: 'E_SYNC_DIVERGENCE',
          localSha: range.to,
          remoteSha: range.from ?? '',
        };
        skippedWriters.push(entry);
        log.warn('Sync divergence detected — skipping writer', {
          code: 'E_SYNC_DIVERGENCE',
          graphName,
          ...entry,
        });
        continue;
      }
      throw err;
    }
  }

  return {
    type: 'sync-response',
    frontier: frontierToObject(localFrontier),
    patches,
    skippedWriters,
  };
}

/**
 * Applies a sync response to local state.
 *
 * This is the client-side handler for sync responses. It:
 * 1. Clones state and frontier to avoid mutating inputs
 * 2. Groups patches by writer for correct ordering
 * 3. Validates each patch against known op types (schema compatibility)
 * 4. Applies patches using CRDT merge semantics (JoinReducer.join)
 * 5. Updates the frontier with new writer tips
 *
 * **CRDT convergence**: Patches can be applied in any order and the final
 * state will be identical. However, applying in chronological order (as
 * provided) is slightly more efficient.
 *
 * **Schema validation**: Patches are checked against SCHEMA_V3 before apply.
 * If a patch contains op types we don't understand (from a newer schema),
 * assertOpsCompatible throws to prevent silent data loss.
 *
 * **Immutability**: This function does not modify the input state or frontier.
 * It returns new objects.
 *
 * @param response - Incoming sync response containing patches
 * @param state - Current CRDT state
 * @param frontier - Current frontier mapping writer IDs to SHAs
 * @returns New state, frontier, and count of applied patches
 * @throws {SchemaUnsupportedError} If a patch contains unsupported op types
 *
 * @example
 * const response = await fetch('/sync', { ... }).then(r => r.json());
 * const result = applySyncResponse(response, currentState, currentFrontier);
 * console.log(`Applied ${result.applied} patches`);
 * currentState = result.state;
 * currentFrontier = result.frontier;
 */
export function applySyncResponse(
  response: SyncResponse,
  state: Parameters<typeof cloneState>[0],
  frontier: Map<string, string>,
): ApplySyncResponseResult {
  // Clone state and frontier to avoid mutating inputs
  const newState = cloneState(state);
  const newFrontier = cloneFrontier(frontier);
  let applied = 0;

  // Patches arrive pre-grouped by writer from the sync response. This
  // re-grouping is defensive — it handles edge cases where patches from
  // multiple writers arrive interleaved (e.g., from a relay that merges
  // streams).
  const patchesByWriter = new Map<string, Array<{ sha: string; patch: DecodedPatch }>>();
  for (const { writerId, sha, patch } of response.patches) {
    if (!patchesByWriter.has(writerId)) {
      patchesByWriter.set(writerId, []);
    }
    const writerList = patchesByWriter.get(writerId)!;
    writerList.push({ sha, patch });
  }

  // Apply patches for each writer
  for (const [writerId, writerPatches] of patchesByWriter) {
    // Patches should already be in chronological order from processSyncRequest
    for (const { sha, patch } of writerPatches) {
      // Normalize patch context (in case it came from network serialization)
      const normalizedPatch = normalizePatch(patch);
      // Guard: reject patches with genuinely unknown op types (B106 / C2 fix).
      // Uses isKnownRawOp to accept only the 6 wire-format types. Canonical-only
      // types (NodePropSet, EdgePropSet) must never appear on the wire before
      // ADR 2 capability cutover — reject them here to fail closed.
      for (const op of normalizedPatch.ops) {
        if (!isKnownRawOp(op)) {
          throw new SchemaUnsupportedError(
            `Patch ${sha} contains unknown op type: ${(op as { type?: string }).type}`,
          );
        }
      }
      // Guard: reject patches exceeding our maximum supported schema version.
      assertOpsCompatible(normalizedPatch.ops as Parameters<typeof assertOpsCompatible>[0], SCHEMA_V3);
      // Apply patch to state (applyFast mutates in-place; return value is the same reference)
      applyFast(newState, normalizedPatch as Parameters<typeof applyFast>[1], sha);
      applied++;
    }

    // Update frontier to the last SHA for this writer
    if (writerPatches.length > 0) {
      const lastPatch = writerPatches[writerPatches.length - 1];
      if (lastPatch !== undefined) {
        updateFrontier(newFrontier, writerId, lastPatch.sha);
      }
    }
  }

  return {
    state: newState,
    frontier: newFrontier,
    applied,
  };
}

/**
 * Creates an empty sync response (used when no patches are needed).
 *
 * This is a convenience function for responding to sync requests when
 * the requester is already up-to-date (or ahead). The response includes
 * the local frontier but no patches.
 *
 * @param frontier - Local frontier to include in the response
 * @returns A sync response with empty patches array
 *
 * @example
 * if (!syncNeeded(remoteFrontier, localFrontier)) {
 *   return createEmptySyncResponse(localFrontier);
 * }
 */
export function createEmptySyncResponse(frontier: Map<string, string>): SyncResponse {
  return {
    type: 'sync-response',
    frontier: frontierToObject(frontier),
    patches: [],
  };
}
