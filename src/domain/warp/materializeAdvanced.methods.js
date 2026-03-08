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
import BitmapNeighborProvider from '../services/BitmapNeighborProvider.js';

/** @typedef {import('../types/WarpPersistence.js').CorePersistence} CorePersistence */
/** @typedef {import('../services/JoinReducer.js').WarpStateV5} WarpStateV5 */
/** @typedef {import('../types/TickReceipt.js').TickReceipt} TickReceipt */

/**
 * @typedef {{ outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>> }} AdjacencyMap
 * @typedef {{ state: WarpStateV5, stateHash: string|null, adjacency: AdjacencyMap }} MaterializedResult
 */

import { buildWriterRef } from '../utils/RefLayout.js';
import { decodePatchMessage, detectMessageKind } from '../services/WarpMessageCodec.js';

/**
 * Creates a shallow-frozen public view of materialized state.
 *
 * @param {WarpStateV5} state
 * @returns {WarpStateV5}
 */
function freezePublicState(state) {
  return Object.freeze({ ...state });
}

/**
 * Creates a shallow-frozen public materialization result with receipts.
 *
 * @param {WarpStateV5} state
 * @param {TickReceipt[]} receipts
 * @returns {{state: WarpStateV5, receipts: TickReceipt[]}}
 */
function freezePublicStateWithReceipts(state, receipts) {
  return Object.freeze({
    state: freezePublicState(state),
    receipts,
  });
}

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
 * @param {import('../types/PatchDiff.js').PatchDiff|{diff?: import('../types/PatchDiff.js').PatchDiff|null}} [optionsOrDiff]
 *   Either a PatchDiff (legacy positional form) or options object.
 * @returns {Promise<MaterializedResult>}
 * @private
 */
export async function _setMaterializedState(state, optionsOrDiff) {
  /** @type {import('../types/PatchDiff.js').PatchDiff|undefined} */
  let diff;
  if (
    optionsOrDiff &&
    typeof optionsOrDiff === 'object' &&
    Object.prototype.hasOwnProperty.call(optionsOrDiff, 'diff')
  ) {
    diff = /** @type {{diff?: import('../types/PatchDiff.js').PatchDiff|null}} */ (optionsOrDiff).diff ?? undefined;
  } else {
    diff = /** @type {import('../types/PatchDiff.js').PatchDiff|undefined} */ (optionsOrDiff ?? undefined);
  }
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
  this._buildView(state, stateHash, diff);
  return this._materializedGraph;
}

/**
 * Builds the MaterializedView (logicalIndex + propertyReader) and attaches
 * a BitmapNeighborProvider to the materialized graph. Skips rebuild when
 * the stateHash matches the previous build. Uses incremental update when
 * a diff and cached index tree are available.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @param {string} stateHash
 * @param {import('../types/PatchDiff.js').PatchDiff} [diff] - Optional diff for incremental update
 * @private
 */
export function _buildView(state, stateHash, diff) {
  if (this._cachedViewHash === stateHash) {
    return;
  }
  try {
    /** @type {import('../services/MaterializedViewService.js').BuildResult} */
    let result;
    if (diff && this._cachedIndexTree) {
      result = this._viewService.applyDiff({
        existingTree: this._cachedIndexTree,
        diff,
        state,
      });
    } else {
      result = this._viewService.build(state);
    }

    this._logicalIndex = result.logicalIndex;
    this._propertyReader = result.propertyReader;
    this._cachedViewHash = stateHash;
    this._cachedIndexTree = result.tree;
    this._indexDegraded = false;

    const provider = new BitmapNeighborProvider({ logicalIndex: result.logicalIndex });
    if (this._materializedGraph) {
      this._materializedGraph.provider = provider;
    }
  } catch (err) {
    this._logger?.warn('[warp] index build failed, falling back to linear scan', {
      error: /** @type {Error} */ (err).message,
    });
    this._indexDegraded = true;
    this._logicalIndex = null;
    this._propertyReader = null;
    this._cachedIndexTree = null;
  }
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
    return freezePublicState(this._cachedState);
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
      return freezePublicStateWithReceipts(state, []);
    }
    return freezePublicState(state);
  }

  // Persistent cache check — skip when collectReceipts is requested
  let cacheKey;
  if (this._seekCache && !collectReceipts) {
    cacheKey = await buildSeekCacheKey(ceiling, frontier);
    try {
      const cached = await this._seekCache.get(cacheKey);
      if (cached) {
        try {
          const state = deserializeFullStateV5(cached.buffer, { codec: this._codec });
          this._provenanceIndex = new ProvenanceIndex();
          this._provenanceDegraded = true;
          await this._setMaterializedState(state);
          this._cachedCeiling = ceiling;
          this._cachedFrontier = frontier;
          if (cached.indexTreeOid) {
            await this._restoreIndexFromCache(cached.indexTreeOid);
          }
          this._logTiming('materialize', t0, { metrics: `cache hit (ceiling=${ceiling})` });
          return freezePublicState(state);
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
    const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, { receipts: true }));
    state = result.state;
    receipts = result.receipts;
  } else {
    state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches)));
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
      cacheKey = await buildSeekCacheKey(ceiling, frontier);
    }
    const buf = serializeFullStateV5(state, { codec: this._codec });
    this._persistSeekCacheEntry(cacheKey, buf, state)
      .catch(() => {});
  }

  // Skip auto-checkpoint and GC — this is an exploratory read
  this._logTiming('materialize', t0, { metrics: `${allPatches.length} patches (ceiling=${ceiling})` });

  if (collectReceipts) {
    return freezePublicStateWithReceipts(
      state,
      /** @type {TickReceipt[]} */ (receipts),
    );
  }
  return freezePublicState(state);
}

/**
 * Persists a seek cache entry with an optional index tree snapshot.
 *
 * Builds the bitmap index tree from the materialized state, writes it
 * to Git storage, and includes the resulting tree OID in the cache
 * entry metadata. Index persistence failure is non-fatal — the state
 * buffer is still cached without the index.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} cacheKey - Seek cache key
 * @param {Uint8Array} buf - Serialized WarpStateV5 buffer
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @returns {Promise<void>}
 * @private
 */
export async function _persistSeekCacheEntry(cacheKey, buf, state) {
  /** @type {{ indexTreeOid?: string }} */
  const opts = {};
  try {
    const { tree } = this._viewService.build(state);
    opts.indexTreeOid = await this._viewService.persistIndexTree(
      tree,
      this._persistence,
    );
  } catch {
    // Non-fatal — cache the state without the index
  }
  if (this._seekCache) {
    await this._seekCache.set(cacheKey, buf, opts);
  }
}

/**
 * Restores a LogicalIndex and PropertyReader from a cached index tree OID.
 *
 * Reads the tree entries from Git storage and delegates hydration to
 * the MaterializedViewService. Failure is non-fatal — the in-memory
 * index built by `_buildView` remains as fallback.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string} indexTreeOid - Git tree OID of the bitmap index snapshot
 * @returns {Promise<void>}
 * @private
 */
export async function _restoreIndexFromCache(indexTreeOid) {
  try {
    const shardOids = await this._persistence.readTreeOids(indexTreeOid);
    const { logicalIndex, propertyReader } =
      await this._viewService.loadFromOids(shardOids, this._persistence);
    this._logicalIndex = logicalIndex;
    this._propertyReader = propertyReader;
  } catch {
    // Non-fatal — fall back to in-memory index from _buildView
  }
}

/**
 * Materializes the graph state at a specific checkpoint.
 *
 * Loads the checkpoint state and frontier, discovers current writers,
 * builds the target frontier from current writer tips, and applies
 * incremental patches since the checkpoint.
 *
 * @this {import('./_internal.js').WarpGraphWithMixins}
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
      const patchBuffer = await this._readPatchBlob(patchMeta);
      const patch = /** @type {import('../types/WarpTypesV2.js').PatchV2} */ (this._codec.decode(patchBuffer));

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
  /** @type {CorePersistence} */
  const persistence = this._persistence;
  const state = await materializeIncremental({
    persistence,
    graphName: this._graphName,
    checkpointSha,
    targetFrontier,
    patchLoader,
    codec: this._codec,
  });
  await this._setMaterializedState(state);
  return freezePublicState(state);
}

/**
 * Verifies the bitmap index against adjacency ground truth.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {{ seed?: number, sampleRate?: number }} [options]
 * @returns {{ passed: number, failed: number, errors: Array<{nodeId: string, direction: string, expected: string[], actual: string[]}> }}
 */
export function verifyIndex(options) {
  if (!this._logicalIndex || !this._cachedState || !this._viewService) {
    throw new Error('Cannot verify index: graph not materialized or index not built');
  }
  return this._viewService.verifyIndex({
    state: this._cachedState,
    logicalIndex: this._logicalIndex,
    options,
  });
}

/**
 * Clears the cached bitmap index, forcing a full rebuild on next materialize.
 *
 * @this {import('../WarpGraph.js').default}
 */
export function invalidateIndex() {
  this._cachedIndexTree = null;
  this._cachedViewHash = null;
}
