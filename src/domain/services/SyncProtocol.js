/**
 * SyncProtocol - WARP V5 frontier-based per-writer chain sync.
 *
 * This module provides the core sync protocol for WARP V5, enabling
 * efficient synchronization between nodes by comparing frontiers and
 * exchanging only the patches each side is missing.
 *
 * The protocol is based on per-writer chains where each writer has
 * a linear history of patches. Sync works by:
 * 1. Exchanging frontiers (Map<writerId, lastPatchSha>)
 * 2. Computing what each side needs based on frontier differences
 * 3. Loading and transmitting the missing patches
 * 4. Applying received patches to local state
 *
 * @module domain/services/SyncProtocol
 * @see WARP V5 Spec Section 11 (Network Sync)
 */

import { decode } from '../../infrastructure/codecs/CborCodec.js';
import { decodePatchMessage, detectMessageKind } from './WarpMessageCodec.js';
import { join, cloneStateV5 } from './JoinReducer.js';
import { cloneFrontier, updateFrontier } from './Frontier.js';
import { vvDeserialize } from '../crdt/VersionVector.js';

// -----------------------------------------------------------------------------
// Patch Loading
// -----------------------------------------------------------------------------

/**
 * Normalizes a patch after CBOR deserialization.
 * Converts context from plain object to VersionVector (Map).
 *
 * @param {Object} patch - The raw decoded patch
 * @returns {Object} The normalized patch with context as a Map
 * @private
 */
function normalizePatch(patch) {
  // Convert context from plain object to Map (VersionVector)
  // CBOR deserialization returns plain objects, but join() expects a Map
  if (patch.context && !(patch.context instanceof Map)) {
    patch.context = vvDeserialize(patch.context);
  }
  return patch;
}

/**
 * Loads a patch from a commit.
 * Reads the commit message to get the patch OID, then reads the patch blob.
 *
 * @param {import('../../ports/GraphPersistencePort.js').default} persistence - Git persistence layer
 * @param {string} sha - Commit SHA
 * @returns {Promise<Object>} The decoded patch object
 * @private
 */
async function loadPatchFromCommit(persistence, sha) {
  // Read commit message to extract patch OID
  const message = await persistence.showNode(sha);
  const decoded = decodePatchMessage(message);

  // Read and decode the patch blob
  const patchBuffer = await persistence.readBlob(decoded.patchOid);
  const patch = decode(patchBuffer);

  // Normalize the patch (convert context from object to Map)
  return normalizePatch(patch);
}

/**
 * Loads patches for a writer between two SHAs.
 * Walks commit graph from `toSha` back to `fromSha` (exclusive).
 *
 * @param {import('../../ports/GraphPersistencePort.js').default} persistence - Git persistence layer
 * @param {string} graphName - Graph name
 * @param {string} writerId - Writer ID
 * @param {string|null} fromSha - Start SHA (exclusive), null for all
 * @param {string} toSha - End SHA (inclusive)
 * @returns {Promise<Array<{patch: Object, sha: string}>>} Patches in chronological order
 * @throws {Error} If divergence detected (fromSha not ancestor of toSha)
 *
 * @example
 * // Load all patches from writer 'node-1' from sha-a to sha-c
 * const patches = await loadPatchRange(persistence, 'events', 'node-1', 'sha-a', 'sha-c');
 * // Returns [{patch, sha: 'sha-b'}, {patch, sha: 'sha-c'}] in chronological order
 */
export async function loadPatchRange(persistence, graphName, writerId, fromSha, toSha) {
  const patches = [];
  let cur = toSha;

  while (cur && cur !== fromSha) {
    // Load commit info to get parent
    const commitInfo = await persistence.getNodeInfo(cur);

    // Load patch from commit
    const patch = await loadPatchFromCommit(persistence, cur);
    patches.unshift({ patch, sha: cur }); // Prepend for chronological order

    // Move to parent (first parent in linear chain)
    cur = commitInfo.parents?.[0] ?? null;
  }

  // If fromSha was specified but we didn't reach it, we have divergence
  if (fromSha && cur === null) {
    throw new Error(
      `Divergence detected: ${toSha} does not descend from ${fromSha} for writer ${writerId}`
    );
  }

  return patches;
}

// -----------------------------------------------------------------------------
// Sync Delta Computation
// -----------------------------------------------------------------------------

/**
 * Computes what patches each side needs based on frontiers.
 *
 * For each writer:
 * - If writer is in remote but not local: local needs all patches (from: null)
 * - If writer is in local but not remote: remote needs all patches (from: null)
 * - If writer is in both with different heads: need from local head to remote head
 *   (or vice versa depending on ancestry)
 *
 * @param {Map<string, string>} localFrontier - Local writer heads
 * @param {Map<string, string>} remoteFrontier - Remote writer heads
 * @returns {{
 *   needFromRemote: Map<string, {from: string|null, to: string}>,
 *   needFromLocal: Map<string, {from: string|null, to: string}>,
 *   newWritersForLocal: string[],
 *   newWritersForRemote: string[]
 * }}
 *
 * @example
 * const local = new Map([['w1', 'sha-a'], ['w2', 'sha-b']]);
 * const remote = new Map([['w1', 'sha-c'], ['w3', 'sha-d']]);
 * const delta = computeSyncDelta(local, remote);
 * // delta.needFromRemote: Map { 'w1' => {from: 'sha-a', to: 'sha-c'}, 'w3' => {from: null, to: 'sha-d'} }
 * // delta.needFromLocal: Map { 'w2' => {from: null, to: 'sha-b'} }
 * // delta.newWritersForLocal: ['w3']
 * // delta.newWritersForRemote: ['w2']
 */
export function computeSyncDelta(localFrontier, remoteFrontier) {
  const needFromRemote = new Map();
  const needFromLocal = new Map();
  const newWritersForLocal = [];
  const newWritersForRemote = [];

  // Check what local needs from remote
  for (const [writerId, remoteSha] of remoteFrontier) {
    const localSha = localFrontier.get(writerId);

    if (localSha === undefined) {
      // New writer for local - need all patches
      needFromRemote.set(writerId, { from: null, to: remoteSha });
      newWritersForLocal.push(writerId);
    } else if (localSha !== remoteSha) {
      // Different heads - local needs patches from its head to remote head
      // Note: We assume remote is ahead; the caller should verify ancestry
      needFromRemote.set(writerId, { from: localSha, to: remoteSha });
    }
    // If localSha === remoteSha, already in sync for this writer
  }

  // Check what remote needs from local
  for (const [writerId, localSha] of localFrontier) {
    const remoteSha = remoteFrontier.get(writerId);

    if (remoteSha === undefined) {
      // New writer for remote - need all patches
      needFromLocal.set(writerId, { from: null, to: localSha });
      newWritersForRemote.push(writerId);
    } else if (remoteSha !== localSha) {
      // Different heads - remote might need patches from its head to local head
      // Only add if not already in needFromRemote (avoid double-counting)
      // This handles the case where local is ahead of remote
      if (!needFromRemote.has(writerId)) {
        needFromLocal.set(writerId, { from: remoteSha, to: localSha });
      }
    }
  }

  return {
    needFromRemote,
    needFromLocal,
    newWritersForLocal,
    newWritersForRemote,
  };
}

// -----------------------------------------------------------------------------
// Sync Messages
// -----------------------------------------------------------------------------

/**
 * @typedef {Object} SyncRequest
 * @property {'sync-request'} type - Message type discriminator
 * @property {Object.<string, string>} frontier - Requester's frontier as plain object
 */

/**
 * @typedef {Object} SyncResponse
 * @property {'sync-response'} type - Message type discriminator
 * @property {Object.<string, string>} frontier - Responder's frontier as plain object
 * @property {Array<{writerId: string, sha: string, patch: Object}>} patches - Patches the requester needs
 */

/**
 * Creates a sync request message.
 *
 * @param {Map<string, string>} frontier - Local frontier
 * @returns {SyncRequest}
 *
 * @example
 * const frontier = new Map([['w1', 'sha-a'], ['w2', 'sha-b']]);
 * const request = createSyncRequest(frontier);
 * // { type: 'sync-request', frontier: { w1: 'sha-a', w2: 'sha-b' } }
 */
export function createSyncRequest(frontier) {
  // Convert Map to plain object for serialization
  const frontierObj = {};
  for (const [writerId, sha] of frontier) {
    frontierObj[writerId] = sha;
  }

  return {
    type: 'sync-request',
    frontier: frontierObj,
  };
}

/**
 * Processes a sync request and returns patches the requester needs.
 *
 * @param {SyncRequest} request - Incoming sync request
 * @param {Map<string, string>} localFrontier - Local frontier
 * @param {import('../../ports/GraphPersistencePort.js').default} persistence - Git persistence
 * @param {string} graphName - Graph name
 * @returns {Promise<SyncResponse>}
 *
 * @example
 * const response = await processSyncRequest(request, localFrontier, persistence, 'events');
 * // Returns patches the requester needs to catch up
 */
export async function processSyncRequest(request, localFrontier, persistence, graphName) {
  // Convert incoming frontier from object to Map
  const remoteFrontier = new Map(Object.entries(request.frontier));

  // Compute what the requester needs
  const delta = computeSyncDelta(remoteFrontier, localFrontier);

  // Load patches that the requester needs (from local to requester)
  const patches = [];

  for (const [writerId, range] of delta.needFromRemote) {
    try {
      const writerPatches = await loadPatchRange(
        persistence,
        graphName,
        writerId,
        range.from,
        range.to
      );

      for (const { patch, sha } of writerPatches) {
        patches.push({ writerId, sha, patch });
      }
    } catch (err) {
      // If we detect divergence, skip this writer
      // The requester may need to handle this separately
      if (err.message.includes('Divergence detected')) {
        continue;
      }
      throw err;
    }
  }

  // Convert local frontier to plain object
  const frontierObj = {};
  for (const [writerId, sha] of localFrontier) {
    frontierObj[writerId] = sha;
  }

  return {
    type: 'sync-response',
    frontier: frontierObj,
    patches,
  };
}

/**
 * Applies a sync response to local state.
 *
 * @param {SyncResponse} response - Incoming sync response
 * @param {import('./JoinReducer.js').WarpStateV5} state - Current state
 * @param {Map<string, string>} frontier - Current frontier
 * @returns {{state: import('./JoinReducer.js').WarpStateV5, frontier: Map<string, string>, applied: number}}
 *
 * @example
 * const result = applySyncResponse(response, currentState, currentFrontier);
 * // result.state - Updated state with new patches applied
 * // result.frontier - Updated frontier
 * // result.applied - Number of patches applied
 */
export function applySyncResponse(response, state, frontier) {
  // Clone state and frontier to avoid mutating inputs
  const newState = cloneStateV5(state);
  const newFrontier = cloneFrontier(frontier);
  let applied = 0;

  // Group patches by writer to ensure proper ordering
  const patchesByWriter = new Map();
  for (const { writerId, sha, patch } of response.patches) {
    if (!patchesByWriter.has(writerId)) {
      patchesByWriter.set(writerId, []);
    }
    patchesByWriter.get(writerId).push({ sha, patch });
  }

  // Apply patches for each writer
  for (const [writerId, writerPatches] of patchesByWriter) {
    // Patches should already be in chronological order from processSyncRequest
    for (const { sha, patch } of writerPatches) {
      // Normalize patch context (in case it came from network serialization)
      const normalizedPatch = normalizePatch(patch);
      // Apply patch to state
      join(newState, normalizedPatch, sha);
      applied++;
    }

    // Update frontier to the last SHA for this writer
    if (writerPatches.length > 0) {
      const lastPatch = writerPatches[writerPatches.length - 1];
      updateFrontier(newFrontier, writerId, lastPatch.sha);
    }
  }

  return {
    state: newState,
    frontier: newFrontier,
    applied,
  };
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Checks if a sync is needed between two frontiers.
 *
 * @param {Map<string, string>} localFrontier - Local frontier
 * @param {Map<string, string>} remoteFrontier - Remote frontier
 * @returns {boolean} True if frontiers differ
 */
export function syncNeeded(localFrontier, remoteFrontier) {
  // Different number of writers means sync needed
  if (localFrontier.size !== remoteFrontier.size) {
    return true;
  }

  // Check if any writer has different head
  for (const [writerId, localSha] of localFrontier) {
    const remoteSha = remoteFrontier.get(writerId);
    if (remoteSha !== localSha) {
      return true;
    }
  }

  return false;
}

/**
 * Creates an empty sync response (used when no patches are needed).
 *
 * @param {Map<string, string>} frontier - Local frontier
 * @returns {SyncResponse}
 */
export function createEmptySyncResponse(frontier) {
  const frontierObj = {};
  for (const [writerId, sha] of frontier) {
    frontierObj[writerId] = sha;
  }

  return {
    type: 'sync-response',
    frontier: frontierObj,
    patches: [],
  };
}
