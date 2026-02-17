/**
 * Advanced materialization methods for WarpGraph — ceiling-aware replay,
 * checkpoint-based materializeAt, adjacency building, and state caching.
 *
 * Every function uses `this` bound to a WarpGraph instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/materializeAdvanced.methods
 */

import { reduceV5, createEmptyStateV5 } from '../services/JoinReducer.js';
import { orsetContains, orsetElements } from '../crdt/ORSet.js';
import { decodeEdgeKey } from '../services/KeyCodec.js';
import { vvClone } from '../crdt/VersionVector.js';
import { computeStateHashV5 } from '../services/StateSerializerV5.js';
import { ProvenanceIndex } from '../services/ProvenanceIndex.js';
import { serializeFullStateV5, deserializeFullStateV5 } from '../services/CheckpointSerializerV5.js';
import { buildSeekCacheKey } from '../utils/seekCacheKey.js';
import { materializeIncremental } from '../services/CheckpointService.js';
import { createFrontier, updateFrontier } from '../services/Frontier.js';
import { buildWriterRef } from '../utils/RefLayout.js';
import { decodePatchMessage, detectMessageKind } from '../services/WarpMessageCodec.js';

/**
 * Resolves the effective ceiling from options and instance state.
 *
 * Precedence: explicit `ceiling` in options overrides the instance-level
 * `_seekCeiling`. Uses the `'ceiling' in options` check, so passing
 * `{ ceiling: null }` explicitly clears the seek ceiling for that call
 * (returns `null`), while omitting the key falls through to `_seekCeiling`.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {{ceiling?: number|null}} [options] - Options object; when the
 *   `ceiling` key is present (even if `null`), its value takes precedence
 * @returns {number|null} Lamport ceiling to apply, or `null` for latest
 * @private
 */
export function _resolveCeiling(options) {
  if (options && 'ceiling' in options) {
    return options.ceiling ?? null;
  }
  return this._seekCeiling;
}

/**
 * Builds a deterministic adjacency map for the logical graph.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @returns {{outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}}
 * @private
 */
export function _buildAdjacency(state) {
  const outgoing = new Map();
  const incoming = new Map();

  for (const edgeKey of orsetElements(state.edgeAlive)) {
    const { from, to, label } = decodeEdgeKey(edgeKey);

    if (!orsetContains(state.nodeAlive, from) || !orsetContains(state.nodeAlive, to)) {
      continue;
    }

    if (!outgoing.has(from)) {
      outgoing.set(from, []);
    }
    if (!incoming.has(to)) {
      incoming.set(to, []);
    }

    outgoing.get(from).push({ neighborId: to, label });
    incoming.get(to).push({ neighborId: from, label });
  }

  const sortNeighbors = (/** @type {Array<{neighborId: string, label: string}>} */ list) => {
    list.sort((/** @type {{neighborId: string, label: string}} */ a, /** @type {{neighborId: string, label: string}} */ b) => {
      if (a.neighborId !== b.neighborId) {
        return a.neighborId < b.neighborId ? -1 : 1;
      }
      return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
    });
  };

  for (const list of outgoing.values()) {
    sortNeighbors(list);
  }

  for (const list of incoming.values()) {
    sortNeighbors(list);
  }

  return { outgoing, incoming };
}

/**
 * Sets the cached state and materialized graph details.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @returns {Promise<{state: any, stateHash: string, adjacency: any}>}
 * @private
 */
export async function _setMaterializedState(state) {
  this._cachedState = state;
  this._stateDirty = false;
  this._versionVector = vvClone(state.observedFrontier);

  const stateHash = await computeStateHashV5(state, { crypto: this._crypto, codec: this._codec });
  let adjacency;

  if (this._adjacencyCache) {
    adjacency = this._adjacencyCache.get(stateHash);
    if (!adjacency) {
      adjacency = this._buildAdjacency(state);
      this._adjacencyCache.set(stateHash, adjacency);
    }
  } else {
    adjacency = this._buildAdjacency(state);
  }

  this._materializedGraph = { state, stateHash, adjacency };
  return this._materializedGraph;
}

/**
 * Materializes the graph with a Lamport ceiling (time-travel).
 *
 * Bypasses checkpoints entirely — replays all patches from all writers,
 * filtering to only those with `lamport <= ceiling`. Skips auto-checkpoint
 * and GC since this is an exploratory read.
 *
 * Uses a dedicated cache keyed on `ceiling` + frontier snapshot. Cache
 * is bypassed when the writer frontier has advanced (new writers or
 * updated tips) or when `collectReceipts` is `true` because the cached
 * path does not retain receipt data.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {number} ceiling - Maximum Lamport tick to include (patches with
 *   `lamport <= ceiling` are replayed; `ceiling <= 0` yields empty state)
 * @param {boolean} collectReceipts - When `true`, return receipts alongside
 *   state and skip the ceiling cache
 * @param {number} t0 - Start timestamp for performance logging
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5 |
 *   {state: import('../services/JoinReducer.js').WarpStateV5,
 *    receipts: import('../types/TickReceipt.js').TickReceipt[]}>}
 *   Plain state when `collectReceipts` is falsy; `{ state, receipts }`
 *   when truthy
 * @private
 */
export async function _materializeWithCeiling(ceiling, collectReceipts, t0) {
  const frontier = await this.getFrontier();

  // Cache hit: same ceiling, clean state, AND frontier unchanged.
  // Bypass cache when collectReceipts is true — cached path has no receipts.
  const cf = this._cachedFrontier;
  if (
    this._cachedState && !this._stateDirty &&
    ceiling === this._cachedCeiling && !collectReceipts &&
    cf !== null &&
    cf.size === frontier.size &&
    [...frontier].every(([w, sha]) => cf.get(w) === sha)
  ) {
    return this._cachedState;
  }

  const writerIds = [...frontier.keys()];

  if (writerIds.length === 0 || ceiling <= 0) {
    const state = createEmptyStateV5();
    this._provenanceIndex = new ProvenanceIndex();
    this._provenanceDegraded = false;
    await this._setMaterializedState(state);
    this._cachedCeiling = ceiling;
    this._cachedFrontier = frontier;
    this._logTiming('materialize', t0, { metrics: '0 patches (ceiling)' });
    if (collectReceipts) {
      return { state, receipts: [] };
    }
    return state;
  }

  // Persistent cache check — skip when collectReceipts is requested
  let cacheKey;
  if (this._seekCache && !collectReceipts) {
    cacheKey = buildSeekCacheKey(ceiling, frontier);
    try {
      const cached = await this._seekCache.get(cacheKey);
      if (cached) {
        try {
          const state = deserializeFullStateV5(cached, { codec: this._codec });
          this._provenanceIndex = new ProvenanceIndex();
          this._provenanceDegraded = true;
          await this._setMaterializedState(state);
          this._cachedCeiling = ceiling;
          this._cachedFrontier = frontier;
          this._logTiming('materialize', t0, { metrics: `cache hit (ceiling=${ceiling})` });
          return state;
        } catch {
          // Corrupted payload — self-heal by removing the bad entry
          try { await this._seekCache.delete(cacheKey); } catch { /* best-effort */ }
        }
      }
    } catch {
      // Cache read failed — fall through to full materialization
    }
  }

  const allPatches = [];
  for (const writerId of writerIds) {
    const writerPatches = await this._loadWriterPatches(writerId);
    for (const entry of writerPatches) {
      if (entry.patch.lamport <= ceiling) {
        allPatches.push(entry);
      }
    }
  }

  /** @type {import('../services/JoinReducer.js').WarpStateV5|undefined} */
  let state;
  /** @type {import('../types/TickReceipt.js').TickReceipt[]|undefined} */
  let receipts;

  if (allPatches.length === 0) {
    state = createEmptyStateV5();
    if (collectReceipts) {
      receipts = [];
    }
  } else if (collectReceipts) {
    const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}} */ (reduceV5(/** @type {any} */ (allPatches), undefined, { receipts: true })); // TODO(ts-cleanup): type patch array
    state = result.state;
    receipts = result.receipts;
  } else {
    state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (reduceV5(/** @type {any} */ (allPatches))); // TODO(ts-cleanup): type patch array
  }

  this._provenanceIndex = new ProvenanceIndex();
  for (const { patch, sha } of allPatches) {
    this._provenanceIndex.addPatch(sha, /** @type {string[]|undefined} */ (patch.reads), /** @type {string[]|undefined} */ (patch.writes));
  }
  this._provenanceDegraded = false;

  await this._setMaterializedState(state);
  this._cachedCeiling = ceiling;
  this._cachedFrontier = frontier;

  // Store to persistent cache (fire-and-forget — failure is non-fatal)
  if (this._seekCache && !collectReceipts && allPatches.length > 0) {
    if (!cacheKey) {
      cacheKey = buildSeekCacheKey(ceiling, frontier);
    }
    const buf = serializeFullStateV5(state, { codec: this._codec });
    this._seekCache.set(cacheKey, /** @type {Buffer} */ (buf)).catch(() => {});
  }

  // Skip auto-checkpoint and GC — this is an exploratory read
  this._logTiming('materialize', t0, { metrics: `${allPatches.length} patches (ceiling=${ceiling})` });

  if (collectReceipts) {
    return { state, receipts: /** @type {import('../types/TickReceipt.js').TickReceipt[]} */ (receipts) };
  }
  return state;
}

/**
 * Materializes the graph state at a specific checkpoint.
 *
 * Loads the checkpoint state and frontier, discovers current writers,
 * builds the target frontier from current writer tips, and applies
 * incremental patches since the checkpoint.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} checkpointSha - The checkpoint commit SHA
 * @returns {Promise<import('../services/JoinReducer.js').WarpStateV5>} The materialized graph state at the checkpoint
 * @throws {Error} If checkpoint SHA is invalid or not found
 * @throws {Error} If checkpoint loading or patch decoding fails
 *
 * @example
 * // Time-travel to a previous checkpoint
 * const oldState = await graph.materializeAt('abc123');
 * console.log('Nodes at checkpoint:', orsetElements(oldState.nodeAlive));
 */
export async function materializeAt(checkpointSha) {
  // 1. Discover current writers to build target frontier
  const writerIds = await this.discoverWriters();

  // 2. Build target frontier (current tips for all writers)
  const targetFrontier = createFrontier();
  for (const writerId of writerIds) {
    const writerRef = buildWriterRef(this._graphName, writerId);
    const tipSha = await this._persistence.readRef(writerRef);
    if (tipSha) {
      updateFrontier(targetFrontier, writerId, tipSha);
    }
  }

  // 3. Create a patch loader function for incremental materialization
  const patchLoader = async (/** @type {string} */ writerId, /** @type {string|null} */ fromSha, /** @type {string} */ toSha) => {
    // Load patches from fromSha (exclusive) to toSha (inclusive)
    // Walk from toSha back to fromSha
    const patches = [];
    let currentSha = toSha;

    while (currentSha && currentSha !== fromSha) {
      const nodeInfo = await this._persistence.getNodeInfo(currentSha);
      const {message} = nodeInfo;

      const kind = detectMessageKind(message);
      if (kind !== 'patch') {
        break;
      }

      const patchMeta = decodePatchMessage(message);
      const patchBuffer = await this._persistence.readBlob(patchMeta.patchOid);
      const patch = this._codec.decode(patchBuffer);

      patches.push({ patch, sha: currentSha });

      if (nodeInfo.parents && nodeInfo.parents.length > 0) {
        currentSha = nodeInfo.parents[0];
      } else {
        break;
      }
    }

    return patches.reverse();
  };

  // 4. Call materializeIncremental with the checkpoint and target frontier
  const state = await materializeIncremental({
    persistence: /** @type {any} */ (this._persistence), // TODO(ts-cleanup): narrow port type
    graphName: this._graphName,
    checkpointSha,
    targetFrontier,
    patchLoader,
    codec: this._codec,
  });
  await this._setMaterializedState(state);
  return state;
}
