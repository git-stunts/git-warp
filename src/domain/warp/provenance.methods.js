/**
 * Provenance methods for WarpGraph — patch lookups, slice materialization,
 * backward causal cone computation, and causal sorting.
 *
 * Every function uses `this` bound to a WarpGraph instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/provenance.methods
 */

import { QueryError } from './_internal.js';
import { createEmptyStateV5, reduceV5 } from '../services/JoinReducer.js';
import { ProvenancePayload } from '../services/ProvenancePayload.js';
import { decodePatchMessage, detectMessageKind } from '../services/WarpMessageCodec.js';

/**
 * Returns all patch SHAs that affected a given node or edge.
 *
 * "Affected" means the patch either read from or wrote to the entity
 * (based on the patch's I/O declarations from HG/IO/1).
 *
 * If `autoMaterialize` is enabled, this will automatically materialize
 * the state if dirty. Otherwise, call `materialize()` first.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} entityId - The node ID or edge key to query
 * @returns {Promise<string[]>} Array of patch SHAs that affected the entity, sorted alphabetically
 * @throws {QueryError} If no cached state exists and autoMaterialize is off (code: `E_NO_STATE`)
 */
export async function patchesFor(entityId) {
  await this._ensureFreshState();

  if (this._provenanceDegraded) {
    throw new QueryError('Provenance unavailable for cached seek. Re-seek with --no-persistent-cache or call materialize({ ceiling }) directly.', {
      code: 'E_PROVENANCE_DEGRADED',
    });
  }

  if (!this._provenanceIndex) {
    throw new QueryError('No provenance index. Call materialize() first.', {
      code: 'E_NO_STATE',
    });
  }
  return this._provenanceIndex.patchesFor(entityId);
}

/**
 * Materializes only the backward causal cone for a specific node.
 *
 * This implements the slicing theorem from Paper III (Computational Holography):
 * Given a target node v, compute its backward causal cone D(v) - the set of
 * all patches that contributed to v's current state - and replay only those.
 *
 * The algorithm:
 * 1. Start with patches that directly wrote to the target node
 * 2. For each patch, find entities it read from
 * 3. Recursively gather all dependencies
 * 4. Topologically sort by Lamport timestamp (causal order)
 * 5. Replay the sorted patches against empty state
 *
 * **Requires a cached state.** Call materialize() first to build the provenance index.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} nodeId - The target node ID to materialize the cone for
 * @param {{receipts?: boolean}} [options] - Optional configuration
 * @returns {Promise<{state: import('../services/JoinReducer.js').WarpStateV5, patchCount: number, receipts?: import('../types/TickReceipt.js').TickReceipt[]}>}
 *   Returns the sliced state with the patch count (for comparison with full materialization)
 * @throws {QueryError} If no provenance index exists (code: `E_NO_STATE`)
 * @throws {Error} If patch loading fails
 */
export async function materializeSlice(nodeId, options) {
  const t0 = this._clock.now();
  const collectReceipts = options && options.receipts;

  try {
    // Ensure fresh state before accessing provenance index
    await this._ensureFreshState();

    if (this._provenanceDegraded) {
      throw new QueryError('Provenance unavailable for cached seek. Re-seek with --no-persistent-cache or call materialize({ ceiling }) directly.', {
        code: 'E_PROVENANCE_DEGRADED',
      });
    }

    if (!this._provenanceIndex) {
      throw new QueryError('No provenance index. Call materialize() first.', {
        code: 'E_NO_STATE',
      });
    }

    // 1. Compute backward causal cone using BFS over the provenance index
    // Returns Map<sha, patch> with patches already loaded (avoids double I/O)
    const conePatchMap = await this._computeBackwardCone(nodeId);

    // 2. If no patches in cone, return empty state
    if (conePatchMap.size === 0) {
      const emptyState = createEmptyStateV5();
      this._logTiming('materializeSlice', t0, { metrics: '0 patches (empty cone)' });
      return {
        state: emptyState,
        patchCount: 0,
        ...(collectReceipts ? { receipts: [] } : {}),
      };
    }

    // 3. Convert cached patches to entry format (patches already loaded by _computeBackwardCone)
    const patchEntries = [];
    for (const [sha, patch] of conePatchMap) {
      patchEntries.push({ patch, sha });
    }

    // 4. Topologically sort by causal order (Lamport timestamp, then writer, then SHA)
    const sortedPatches = this._sortPatchesCausally(patchEntries);

    // 5. Replay: use reduceV5 directly when collecting receipts, otherwise use ProvenancePayload
    this._logTiming('materializeSlice', t0, { metrics: `${sortedPatches.length} patches` });

    if (collectReceipts) {
      const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}} */ (reduceV5(sortedPatches, undefined, { receipts: true }));
      return {
        state: result.state,
        patchCount: sortedPatches.length,
        receipts: result.receipts,
      };
    }

    const payload = new ProvenancePayload(sortedPatches);
    return {
      state: payload.replay(),
      patchCount: sortedPatches.length,
    };
  } catch (err) {
    this._logTiming('materializeSlice', t0, { error: /** @type {Error} */ (err) });
    throw err;
  }
}

/**
 * Computes the backward causal cone for a node.
 *
 * Uses BFS over the provenance index:
 * 1. Find all patches that wrote to the target node
 * 2. For each patch, find entities it read from
 * 3. Find all patches that wrote to those entities
 * 4. Repeat until no new patches are found
 *
 * Returns a Map of SHA -> patch to avoid double-loading (the cone
 * computation needs to read patches for their read-dependencies,
 * so we cache them for later replay).
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} nodeId - The target node ID
 * @returns {Promise<Map<string, Object>>} Map of patch SHA to loaded patch object
 */
export async function _computeBackwardCone(nodeId) {
  if (!this._provenanceIndex) {
    throw new QueryError('No provenance index. Call materialize() first.', {
      code: 'E_NO_STATE',
    });
  }
  const cone = new Map(); // sha -> patch (cache loaded patches)
  const visited = new Set(); // Visited entities
  const queue = [nodeId]; // BFS queue of entities to process
  let qi = 0;

  while (qi < queue.length) {
    const entityId = queue[qi++];

    if (visited.has(entityId)) {
      continue;
    }
    visited.add(entityId);

    // Get all patches that affected this entity
    const patchShas = /** @type {import('../services/ProvenanceIndex.js').ProvenanceIndex} */ (this._provenanceIndex).patchesFor(entityId);

    for (const sha of patchShas) {
      if (cone.has(sha)) {
        continue;
      }

      // Load the patch and cache it
      const patch = await this._loadPatchBySha(sha);
      cone.set(sha, patch);

      // Add read dependencies to the queue
      const patchReads = /** @type {any} */ (patch)?.reads; // TODO(ts-cleanup): type patch array
      if (patchReads) {
        for (const readEntity of patchReads) {
          if (!visited.has(readEntity)) {
            queue.push(readEntity);
          }
        }
      }
    }
  }

  return cone;
}

/**
 * Loads a single patch by its SHA.
 *
 * Thin wrapper around the internal `_loadPatchBySha` helper. Exposed for
 * CLI/debug tooling (e.g. seek tick receipts) that needs to inspect patch
 * operations without re-materializing intermediate states.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} sha - The patch commit SHA
 * @returns {Promise<Object>} The decoded patch object
 * @throws {Error} If the commit is not a patch or loading fails
 */
export async function loadPatchBySha(sha) {
  return await this._loadPatchBySha(sha);
}

/**
 * Loads a single patch by its SHA.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} sha - The patch commit SHA
 * @returns {Promise<Object>} The decoded patch object
 * @throws {Error} If the commit is not a patch or loading fails
 */
export async function _loadPatchBySha(sha) {
  const nodeInfo = await this._persistence.getNodeInfo(sha);
  const kind = detectMessageKind(nodeInfo.message);

  if (kind !== 'patch') {
    throw new Error(`Commit ${sha} is not a patch`);
  }

  const patchMeta = decodePatchMessage(nodeInfo.message);
  const patchBuffer = await this._persistence.readBlob(patchMeta.patchOid);
  return /** @type {Object} */ (this._codec.decode(patchBuffer));
}

/**
 * Loads multiple patches by their SHAs.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string[]} shas - Array of patch commit SHAs
 * @returns {Promise<Array<{patch: Object, sha: string}>>} Array of patch entries
 * @throws {Error} If any SHA is not a patch or loading fails
 */
export async function _loadPatchesBySha(shas) {
  const entries = [];

  for (const sha of shas) {
    const patch = await this._loadPatchBySha(sha);
    entries.push({ patch, sha });
  }

  return entries;
}

/**
 * Sorts patches in causal order for deterministic replay.
 *
 * Sort order: Lamport timestamp (ascending), then writer ID, then SHA.
 * This ensures deterministic ordering regardless of discovery order.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {Array<{patch: any, sha: string}>} patches - Unsorted patch entries
 * @returns {Array<{patch: any, sha: string}>} Sorted patch entries
 */
export function _sortPatchesCausally(patches) {
  return [...patches].sort((a, b) => {
    // Primary: Lamport timestamp (ascending - earlier patches first)
    const lamportDiff = (a.patch.lamport || 0) - (b.patch.lamport || 0);
    if (lamportDiff !== 0) {
      return lamportDiff;
    }

    // Secondary: Writer ID (lexicographic)
    const writerCmp = (a.patch.writer || '').localeCompare(b.patch.writer || '');
    if (writerCmp !== 0) {
      return writerCmp;
    }

    // Tertiary: SHA (lexicographic) for total ordering
    return a.sha.localeCompare(b.sha);
  });
}
