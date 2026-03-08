/**
 * SyncProtocol - WARP V5 frontier-based per-writer chain sync.
 *
 * This module provides the core sync protocol for WARP V5, enabling
 * efficient synchronization between nodes by comparing frontiers and
 * exchanging only the patches each side is missing.
 *
 * **Protocol Overview**:
 *
 * The protocol is based on per-writer chains where each writer has
 * a linear history of patches. Each writer's chain is independent,
 * enabling lock-free concurrent writes. Sync works by:
 *
 * 1. **Frontier Exchange**: Each node sends its frontier (Map<writerId, tipSha>)
 * 2. **Delta Computation**: Compare frontiers to determine what each side is missing
 * 3. **Patch Transfer**: Load and transmit missing patches in chronological order
 * 4. **State Application**: Apply received patches using CRDT merge semantics
 *
 * **Protocol Messages**:
 * - `SyncRequest`: Contains requester's frontier
 * - `SyncResponse`: Contains responder's frontier + patches the requester needs
 *
 * **Assumptions**:
 * - Writer chains are linear (no forks within a single writer)
 * - Patches are append-only (no history rewriting)
 * - CRDT semantics ensure convergence regardless of apply order
 *
 * **Error Handling**:
 * - Divergence detection: If a writer's chain has forked (rare, indicates bug
 *   or corruption), the protocol detects this and skips that writer
 * - Schema compatibility: Patches are validated against known op types before apply
 *
 * @module domain/services/SyncProtocol
 * @see WARP V5 Spec Section 11 (Network Sync)
 * @see JoinReducer - CRDT merge implementation
 * @see Frontier - Frontier manipulation utilities
 */

import defaultCodec from '../utils/defaultCodec.js';
import nullLogger from '../utils/nullLogger.js';
import { decodePatchMessage, assertOpsCompatible, SCHEMA_V3 } from './WarpMessageCodec.js';
import { join, cloneStateV5, isKnownRawOp } from './JoinReducer.js';
import SchemaUnsupportedError from '../errors/SchemaUnsupportedError.js';
import EncryptionError from '../errors/EncryptionError.js';
import { cloneFrontier, updateFrontier } from './Frontier.js';
import { vvDeserialize } from '../crdt/VersionVector.js';

/**
 * A decoded patch object after CBOR deserialization.
 * @typedef {Object} DecodedPatch
 * @property {Object | Map<string, number>} [context] - VersionVector (Map after normalization, plain object before)
 * @property {import('../types/WarpTypesV2.js').OpV2[]} ops - Ordered array of operations
 * @property {string} [writer] - Writer ID
 * @property {number} [lamport] - Lamport timestamp
 * @property {number} [schema] - Schema version
 */

// -----------------------------------------------------------------------------
// Patch Loading
// -----------------------------------------------------------------------------

/**
 * Normalizes a patch after CBOR deserialization.
 *
 * CBOR deserialization returns plain JavaScript objects, but the CRDT
 * merge logic (JoinReducer) expects the context field to be a Map
 * (VersionVector). This function performs the conversion in-place.
 *
 * **Mutation**: This function mutates the input patch object for efficiency.
 * The original object reference is returned.
 *
 * @param {DecodedPatch} patch - The raw decoded patch from CBOR.
 *   If context is present as a plain object, it will be converted to a Map.
 * @returns {DecodedPatch} The same patch object with context converted to Map
 * @private
 */
function normalizePatch(patch) {
  // Convert context from plain object to Map (VersionVector)
  // CBOR deserialization returns plain objects, but join() expects a Map
  if (patch.context && !(patch.context instanceof Map)) {
    patch.context = vvDeserialize(/** @type {{ [x: string]: number }} */ (patch.context));
  }
  return patch;
}

/**
 * Converts a frontier Map to a plain object for JSON serialization.
 *
 * @param {Map<string, string>} map - Frontier as Map<writerId, sha>
 * @returns {{ [x: string]: string }} Plain object representation
 * @private
 */
function frontierToObject(map) {
  /** @type {{ [x: string]: string }} */
  const obj = {};
  for (const [writerId, sha] of map) {
    obj[writerId] = sha;
  }
  return obj;
}

/**
 * Converts a frontier plain object back to a Map.
 *
 * @param {{ [x: string]: string }} obj - Frontier as plain object
 * @returns {Map<string, string>} Frontier as Map<writerId, sha>
 * @private
 */
function objectToFrontier(obj) {
  return new Map(Object.entries(obj));
}

/**
 * Loads a patch from a commit.
 *
 * WARP stores patches as Git blobs, with the blob OID embedded in the
 * commit message. This function:
 * 1. Reads the commit message via `showNode()`
 * 2. Decodes the message to extract the patch blob OID
 * 3. Reads the blob and CBOR-decodes it
 * 4. Normalizes the patch (converts context to Map)
 *
 * **Commit message format**: The message is encoded using WarpMessageCodec
 * and contains metadata (schema version, writer info) plus the patch OID.
 *
 * @param {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default} persistence - Git persistence layer
 *   (uses CommitPort.showNode() + BlobPort.readBlob() methods)
 * @param {string} sha - The 40-character commit SHA to load the patch from
 * @param {{ codec?: import('../../ports/CodecPort.js').default, patchBlobStorage?: import('../../ports/BlobStoragePort.js').default }} [options]
 * @returns {Promise<DecodedPatch>} The decoded and normalized patch object containing:
 *   - `ops`: Array of patch operations
 *   - `context`: VersionVector (Map) of causal dependencies
 *   - `writerId`: The writer who created this patch
 *   - `lamport`: Lamport timestamp for ordering
 * @throws {Error} If the commit cannot be read (invalid SHA, not found)
 * @throws {Error} If the commit message cannot be decoded (malformed, wrong schema)
 * @throws {Error} If the patch blob cannot be read (blob not found, I/O error)
 * @throws {Error} If the patch blob cannot be CBOR-decoded (corrupted data)
 * @throws {EncryptionError} If the patch is encrypted but no patchBlobStorage is provided
 * @private
 */
async function loadPatchFromCommit(persistence, sha, { codec: codecOpt, patchBlobStorage } = /** @type {{ codec?: import('../../ports/CodecPort.js').default, patchBlobStorage?: import('../../ports/BlobStoragePort.js').default }} */ ({})) {
  const codec = codecOpt || defaultCodec;
  // Read commit message to extract patch OID
  const message = await persistence.showNode(sha);
  const decoded = decodePatchMessage(message);

  // Read the patch blob (encrypted or plain)
  /** @type {Uint8Array} */
  let patchBuffer;
  if (decoded.encrypted) {
    if (!patchBlobStorage) {
      throw new EncryptionError(
        'This graph contains encrypted patches; provide patchBlobStorage with an encryption key',
      );
    }
    patchBuffer = await patchBlobStorage.retrieve(decoded.patchOid);
  } else {
    patchBuffer = await persistence.readBlob(decoded.patchOid);
  }
  const patch = /** @type {DecodedPatch} */ (codec.decode(patchBuffer));

  // Normalize the patch (convert context from object to Map)
  return normalizePatch(patch);
}

/**
 * Loads patches for a writer between two SHAs.
 *
 * Walks the commit graph backwards from `toSha` to `fromSha` (exclusive),
 * collecting patches along the way. Returns them in chronological order
 * (oldest first) for correct application.
 *
 * **Ancestry requirement**: `toSha` must be a descendant of `fromSha` in the
 * writer's linear chain. If not, a divergence error is thrown. This would
 * indicate either a bug (same writer forked) or data corruption.
 *
 * **Performance**: O(N) where N is the number of commits between fromSha and toSha.
 * Each commit requires two reads: commit info (for parent) and patch blob.
 *
 * @param {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default} persistence - Git persistence layer
 *   (uses CommitPort.getNodeInfo()/showNode() + BlobPort.readBlob() methods)
 * @param {string} graphName - Graph name (used in error messages, not for lookups)
 * @param {string} writerId - Writer ID (used in error messages, not for lookups)
 * @param {string|null} fromSha - Start SHA (exclusive). Pass null to load ALL patches
 *   for this writer from the beginning of their chain.
 * @param {string} toSha - End SHA (inclusive). This is typically the writer's current tip.
 * @param {{ codec?: import('../../ports/CodecPort.js').default, patchBlobStorage?: import('../../ports/BlobStoragePort.js').default }} [options]
 * @returns {Promise<Array<{patch: DecodedPatch, sha: string}>>} Array of patch objects in
 *   chronological order (oldest first). Each entry contains:
 *   - `patch`: The decoded patch object
 *   - `sha`: The commit SHA this patch came from
 * @throws {Error} If divergence is detected: "Divergence detected: {toSha} does not
 *   descend from {fromSha} for writer {writerId}". This indicates the writer's chain
 *   has forked, which should not happen under normal operation.
 * @throws {Error} If any commit or patch cannot be loaded (propagated from loadPatchFromCommit)
 *
 * @example
 * // Load patches from sha-a (exclusive) to sha-c (inclusive)
 * const patches = await loadPatchRange(persistence, 'events', 'node-1', 'sha-a', 'sha-c');
 * // Returns [{patch, sha: 'sha-b'}, {patch, sha: 'sha-c'}] in chronological order
 *
 * @example
 * // Load ALL patches for a new writer
 * const patches = await loadPatchRange(persistence, 'events', 'new-writer', null, tipSha);
 */
export async function loadPatchRange(persistence, graphName, writerId, fromSha, toSha, { codec, patchBlobStorage } = /** @type {{ codec?: import('../../ports/CodecPort.js').default, patchBlobStorage?: import('../../ports/BlobStoragePort.js').default }} */ ({})) {
  const patches = [];
  let cur = toSha;

  while (cur && cur !== fromSha) {
    // Load commit info to get parent
    const commitInfo = await persistence.getNodeInfo(cur);

    // Load patch from commit
    const patch = await loadPatchFromCommit(persistence, cur, { codec, patchBlobStorage });
    patches.unshift({ patch, sha: cur }); // Prepend for chronological order

    // Move to parent (first parent in linear chain)
    cur = commitInfo.parents?.[0] ?? null;
  }

  // If fromSha was specified but we didn't reach it, we have divergence
  if (fromSha && cur === null) {
    const err = /** @type {Error & { code: string }} */ (new Error(
      `Divergence detected: ${toSha} does not descend from ${fromSha} for writer ${writerId}`
    ));
    err.code = 'E_SYNC_DIVERGENCE';
    throw err;
  }

  return patches;
}

// -----------------------------------------------------------------------------
// Sync Delta Computation
// -----------------------------------------------------------------------------

/**
 * Computes what patches each side needs based on frontiers.
 *
 * This is the core delta computation for sync. By comparing frontiers
 * (which writer SHAs each side has), we determine:
 * - What local needs from remote (to catch up)
 * - What remote needs from local (to catch up)
 * - Which writers are completely new to each side
 *
 * **Algorithm**:
 * 1. For each writer in remote frontier:
 *    - Not in local? Local needs all patches (from: null)
 *    - Different SHA? Local needs patches from its SHA to remote's SHA
 * 2. For each writer in local frontier:
 *    - Not in remote? Remote needs all patches (from: null)
 *    - Different SHA and not already in needFromRemote? Remote needs patches
 *
 * **Assumptions**:
 * - When SHAs differ, we assume remote is ahead. The actual ancestry
 *   is verified during loadPatchRange() which will throw on divergence.
 * - Writers with identical SHAs in both frontiers are already in sync.
 *
 * **Pure function**: Does not modify inputs or perform I/O.
 *
 * @param {Map<string, string>} localFrontier - Local writer heads.
 *   Maps writerId to the SHA of their latest patch commit.
 * @param {Map<string, string>} remoteFrontier - Remote writer heads.
 *   Maps writerId to the SHA of their latest patch commit.
 * @returns {{ needFromRemote: Map<string, {from: string|null, to: string}>, needFromLocal: Map<string, {from: string|null, to: string}>, newWritersForLocal: string[], newWritersForRemote: string[] }} Sync delta
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
      // Direction is intentionally deferred: ancestry is verified by
      // isAncestor() pre-check or loadPatchRange() in processSyncRequest()
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
      // Always add both directions — ancestry is verified during loadPatchRange()
      // which will throw E_SYNC_DIVERGENCE if neither side descends from the other (S3)
      needFromLocal.set(writerId, { from: remoteSha, to: localSha });
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
 * A sync request message sent from one node to another.
 *
 * The requester sends its current frontier, allowing the responder to
 * compute what patches the requester is missing.
 *
 * @typedef {Object} SyncRequest
 * @property {'sync-request'} type - Message type discriminator for protocol parsing
 * @property {Object.<string, string>} frontier - Requester's frontier as a plain object.
 *   Keys are writer IDs, values are the SHA of each writer's latest known patch.
 *   Converted from Map for JSON serialization.
 */

/**
 * A sync response message containing patches the requester needs.
 *
 * The responder includes its own frontier (so the requester knows what
 * the responder is missing) and the patches the requester needs to catch up.
 *
 * @typedef {Object} SyncResponse
 * @property {'sync-response'} type - Message type discriminator for protocol parsing
 * @property {Object.<string, string>} frontier - Responder's frontier as a plain object.
 *   Keys are writer IDs, values are SHAs.
 * @property {Array<{writerId: string, sha: string, patch: DecodedPatch}>} patches - Patches
 *   the requester needs, in chronological order per writer. Contains:
 *   - `writerId`: The writer who created this patch
 *   - `sha`: The commit SHA this patch came from (for frontier updates)
 *   - `patch`: The decoded patch object with ops and context
 * @property {Array<{writerId: string, reason: string, localSha: string, remoteSha: string|null}>} [skippedWriters] - Writers that were skipped during sync
 *   (e.g. due to trust gate filtering, divergence, or missing refs)
 */

/**
 * Creates a sync request message.
 *
 * Converts the frontier Map to a plain object for JSON serialization.
 * The resulting message can be sent over HTTP, WebSocket, or any other
 * transport that supports JSON.
 *
 * **Wire format**: The message is a simple JSON object suitable for
 * transmission. No additional encoding is required.
 *
 * @param {Map<string, string>} frontier - Local frontier mapping writer IDs
 *   to their latest known patch SHAs
 * @returns {SyncRequest} A sync request message ready for serialization
 *
 * @example
 * const frontier = new Map([['w1', 'sha-a'], ['w2', 'sha-b']]);
 * const request = createSyncRequest(frontier);
 * // { type: 'sync-request', frontier: { w1: 'sha-a', w2: 'sha-b' } }
 * // Send over HTTP: await fetch(url, { body: JSON.stringify(request) })
 */
export function createSyncRequest(frontier) {
  return {
    type: /** @type {'sync-request'} */ ('sync-request'),
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
 * receive patches for that writer and may need to handle this separately
 * (e.g., full resync, manual intervention).
 *
 * **Performance**: O(P) where P is the total number of patches to load.
 * Each patch requires reading commit info + patch blob.
 *
 * @param {SyncRequest} request - Incoming sync request containing the requester's frontier
 * @param {Map<string, string>} localFrontier - Local frontier (what this node has)
 * @param {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default} persistence - Git persistence
 *   layer for loading patches (uses CommitPort + BlobPort methods)
 * @param {string} graphName - Graph name for error messages and logging
 * @param {{ codec?: import('../../ports/CodecPort.js').default, logger?: import('../../ports/LoggerPort.js').default, patchBlobStorage?: import('../../ports/BlobStoragePort.js').default }} [options]
 * @returns {Promise<SyncResponse>} Response containing local frontier and patches.
 *   Patches are ordered chronologically within each writer.
 * @throws {Error} If patch loading fails for reasons other than divergence
 *   (e.g., corrupted data, I/O error)
 *
 * @example
 * // Server-side sync handler
 * app.post('/sync', async (req, res) => {
 *   const request = req.body;
 *   const response = await processSyncRequest(request, localFrontier, persistence, 'events');
 *   res.json(response);
 * });
 */
export async function processSyncRequest(request, localFrontier, persistence, graphName, { codec, logger, patchBlobStorage } = /** @type {{ codec?: import('../../ports/CodecPort.js').default, logger?: import('../../ports/LoggerPort.js').default, patchBlobStorage?: import('../../ports/BlobStoragePort.js').default }} */ ({})) {
  const log = logger || nullLogger;

  const remoteFrontier = objectToFrontier(request.frontier);

  // Compute what the requester needs
  const delta = computeSyncDelta(remoteFrontier, localFrontier);

  // Load patches that the requester needs (from local to requester)
  const patches = [];
  /** @type {Array<{writerId: string, reason: string, localSha: string, remoteSha: string|null}>} */
  const skippedWriters = [];

  for (const [writerId, range] of delta.needFromRemote) {
    try {
      // Pre-check ancestry to avoid expensive chain walk (B107 / S3 fix).
      // If the persistence layer provides isAncestor, use it to detect
      // divergence early without walking the full commit chain.
      const hasIsAncestor = typeof /** @type {{isAncestor?: (...args: unknown[]) => unknown}} */ (persistence).isAncestor === 'function';
      if (range.from && hasIsAncestor) {
        const isAnc = await /** @type {{isAncestor: (a: string, b: string) => Promise<boolean>}} */ (/** @type {unknown} */ (persistence)).isAncestor(range.from, range.to);
        if (!isAnc) {
          const entry = {
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

      const writerPatches = await loadPatchRange(
        persistence,
        graphName,
        writerId,
        range.from,
        range.to,
        { codec, patchBlobStorage }
      );

      for (const { patch, sha } of writerPatches) {
        patches.push({ writerId, sha, patch });
      }
    } catch (err) {
      // If we detect divergence, log and skip this writer (B65).
      // The requester will not receive patches for this writer.
      if ((err instanceof Error && 'code' in err && /** @type {{ code: string }} */ (err).code === 'E_SYNC_DIVERGENCE') || (err instanceof Error && err.message?.includes('Divergence detected'))) {
        const entry = {
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
    type: /** @type {'sync-response'} */ ('sync-response'),
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
 * assertOpsCompatible throws to prevent silent data loss. The caller should
 * upgrade their client before retrying.
 *
 * **Immutability**: This function does not modify the input state or frontier.
 * It returns new objects.
 *
 * @param {SyncResponse} response - Incoming sync response containing patches
 * @param {import('./JoinReducer.js').WarpStateV5} state - Current CRDT state
 *   (nodeAlive, edgeAlive, prop, observedFrontier)
 * @param {Map<string, string>} frontier - Current frontier mapping writer IDs to SHAs
 * @returns {{state: import('./JoinReducer.js').WarpStateV5, frontier: Map<string, string>, applied: number}} Result containing:
 *   - `state`: New WarpStateV5 with patches applied
 *   - `frontier`: New frontier with updated writer tips
 *   - `applied`: Number of patches successfully applied
 * @throws {Error} If a patch contains unsupported op types (schema incompatibility).
 *   The error message will indicate which op type is unknown.
 *
 * @example
 * // Client-side sync handler
 * const response = await fetch('/sync', { ... }).then(r => r.json());
 * const result = applySyncResponse(response, currentState, currentFrontier);
 * console.log(`Applied ${result.applied} patches`);
 * // Update local state
 * currentState = result.state;
 * currentFrontier = result.frontier;
 */
export function applySyncResponse(response, state, frontier) {
  // Clone state and frontier to avoid mutating inputs
  const newState = cloneStateV5(state);
  const newFrontier = cloneFrontier(frontier);
  let applied = 0;

  // Patches arrive pre-grouped by writer from the sync response. This
  // re-grouping is defensive — it handles edge cases where patches from
  // multiple writers arrive interleaved (e.g., from a relay that merges
  // streams).
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
      // Guard: reject patches with genuinely unknown op types (B106 / C2 fix).
      // Uses isKnownRawOp to accept only the 6 wire-format types. Canonical-only
      // types (NodePropSet, EdgePropSet) must never appear on the wire before
      // ADR 2 capability cutover — reject them here to fail closed.
      for (const op of normalizedPatch.ops) {
        if (!isKnownRawOp(op)) {
          throw new SchemaUnsupportedError(
            `Patch ${sha} contains unknown op type: ${op.type}`
          );
        }
      }
      // Guard: reject patches exceeding our maximum supported schema version.
      // isKnownRawOp() above checks op-type recognition; this checks the schema
      // version ceiling. Currently SCHEMA_V3 is the max.
      assertOpsCompatible(normalizedPatch.ops, SCHEMA_V3);
      // Apply patch to state
      join(newState, /** @type {Parameters<typeof join>[1]} */ (normalizedPatch), sha);
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
 * A fast comparison to determine if two nodes have diverged. This can be
 * used to skip expensive sync operations when nodes are already in sync.
 *
 * **Comparison logic**:
 * 1. If frontier sizes differ, sync is needed (different writer sets)
 * 2. If any writer has a different SHA, sync is needed
 * 3. Otherwise, frontiers are identical and no sync is needed
 *
 * **Note**: This only checks for differences, not direction. Even if this
 * returns true, it's possible that local is ahead of remote (not just behind).
 *
 * @param {Map<string, string>} localFrontier - Local frontier
 * @param {Map<string, string>} remoteFrontier - Remote frontier
 * @returns {boolean} True if frontiers differ and sync is needed
 *
 * @example
 * if (syncNeeded(localFrontier, remoteFrontier)) {
 *   const request = createSyncRequest(localFrontier);
 *   // ... perform sync
 * } else {
 *   console.log('Already in sync');
 * }
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
 * This is a convenience function for responding to sync requests when
 * the requester is already up-to-date (or ahead). The response includes
 * the local frontier but no patches.
 *
 * **Use case**: When processSyncRequest would return no patches anyway,
 * this provides a more efficient path.
 *
 * @param {Map<string, string>} frontier - Local frontier to include in the response
 * @returns {SyncResponse} A sync response with empty patches array
 *
 * @example
 * // Shortcut when requester is already in sync
 * if (!syncNeeded(remoteFrontier, localFrontier)) {
 *   return createEmptySyncResponse(localFrontier);
 * }
 */
export function createEmptySyncResponse(frontier) {
  return {
    type: /** @type {'sync-response'} */ ('sync-response'),
    frontier: frontierToObject(frontier),
    patches: [],
  };
}
