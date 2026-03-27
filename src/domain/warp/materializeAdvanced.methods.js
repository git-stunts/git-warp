/**
 * Advanced materialization methods for WarpRuntime — ceiling-aware replay,
 * checkpoint-based materializeAt, adjacency building, and state caching.
 *
 * Every function uses `this` bound to a WarpRuntime instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/materializeAdvanced.methods
 */

import { reduceV5, createEmptyStateV5, cloneStateV5 } from '../services/JoinReducer.js';
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
import { QueryError } from './_internal.js';

/** @typedef {import('../types/WarpPersistence.js').CorePersistence} CorePersistence */
/** @typedef {import('../services/JoinReducer.js').WarpStateV5} WarpStateV5 */
/** @typedef {import('../types/TickReceipt.js').TickReceipt} TickReceipt */

/**
 * @typedef {{ outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>> }} AdjacencyMap
 * @typedef {{ state: WarpStateV5, stateHash: string|null, adjacency: AdjacencyMap }} MaterializedResult
 */

import { buildWriterRef } from '../utils/RefLayout.js';

/**
 * Creates a shallow-frozen public view of materialized state.
 *
 * @param {WarpStateV5} state
 * @returns {WarpStateV5}
 */
function freezePublicState(state) {
  return Object.freeze(cloneStateV5(state));
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
    receipts: /** @type {TickReceipt[]} */ (Object.freeze([...receipts])),
  });
}

/**
 * Opens a detached graph handle for read-only materialization.
 *
 * @param {import('../WarpRuntime.js').default} graph
 * @returns {Promise<import('../WarpRuntime.js').default>}
 */
async function openDetachedReadGraph(graph) {
  const GraphClass = /** @type {typeof import('../WarpRuntime.js').default} */ (graph.constructor);
  return await GraphClass.open({
    persistence: graph._persistence,
    graphName: graph._graphName,
    writerId: graph._writerId,
    gcPolicy: graph._gcPolicy,
    checkpointPolicy: graph._checkpointPolicy || undefined,
    autoMaterialize: false,
    onDeleteWithData: graph._onDeleteWithData,
    logger: graph._logger || undefined,
    clock: graph._clock,
    crypto: graph._crypto,
    codec: graph._codec,
    seekCache: graph._seekCache || undefined,
    audit: false,
    blobStorage: graph._blobStorage || undefined,
    patchBlobStorage: graph._patchBlobStorage || undefined,
    trust: graph._trustConfig,
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
 * @this {import('../WarpRuntime.js').default}
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
 * @param {Map<string, string>|Record<string, string>} frontierInput
 * @returns {Map<string, string>}
 */
function normalizeFrontierInput(frontierInput) {
  /** @type {Array<[string, string]>} */
  let entries;

  if (frontierInput instanceof Map) {
    entries = [...frontierInput.entries()];
  } else if (frontierInput && typeof frontierInput === 'object' && !Array.isArray(frontierInput)) {
    entries = Object.entries(frontierInput);
  } else {
    throw new QueryError('frontier must be a Map or string record', {
      code: 'E_QUERY_COORDINATE_INVALID',
      context: { frontierType: typeof frontierInput },
    });
  }

  const normalized = entries
    .map(([writerId, tipSha]) => {
      if (typeof writerId !== 'string' || writerId.length === 0 || typeof tipSha !== 'string' || tipSha.length === 0) {
        throw new QueryError('frontier entries must be non-empty string pairs', {
          code: 'E_QUERY_COORDINATE_INVALID',
          context: { writerId, tipSha },
        });
      }
      return /** @type {[string, string]} */ ([writerId, tipSha]);
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  return new Map(normalized);
}

/**
 * @param {number|null} ceiling
 * @returns {number|null}
 */
function normalizeExplicitCeiling(ceiling) {
  if (ceiling === undefined || ceiling === null) {
    return null;
  }
  if (!Number.isInteger(ceiling) || ceiling < 0) {
    throw new QueryError('ceiling must be a non-negative integer or null', {
      code: 'E_QUERY_COORDINATE_INVALID',
      context: { ceiling },
    });
  }
  return ceiling;
}

/**
 * @param {Map<string, string>|null} a
 * @param {Map<string, string>} b
 * @returns {boolean}
 */
function frontiersEqual(a, b) {
  if (!a || a.size !== b.size) {
    return false;
  }
  for (const [writerId, sha] of b) {
    if (a.get(writerId) !== sha) {
      return false;
    }
  }
  return true;
}

/**
 * @param {import('../WarpRuntime.js').default} graph
 * @param {Map<string, string>} frontier
 * @param {number|null} ceiling
 * @param {number} t0
 * @returns {Promise<{state: WarpStateV5|null, cacheKey: string|null}|null>}
 */
async function tryReadCoordinateCache(graph, frontier, ceiling, t0) {
  if (!graph._seekCache || ceiling === null) {
    return null;
  }

  let cacheKey = null;
  try {
    cacheKey = await buildSeekCacheKey(ceiling, frontier);
  } catch {
    return null;
  }

  try {
    const cached = await graph._seekCache.get(cacheKey);
    if (!cached) {
      return { state: null, cacheKey };
    }

    const state = deserializeFullStateV5(cached.buffer, { codec: graph._codec });
    graph._provenanceIndex = new ProvenanceIndex();
    graph._provenanceDegraded = true;
    await graph._setMaterializedState(state);
    graph._cachedCeiling = ceiling;
    graph._cachedFrontier = new Map(frontier);
    if (cached.indexTreeOid) {
      await graph._restoreIndexFromCache(cached.indexTreeOid);
    }
    graph._logTiming('materialize', t0, { metrics: `cache hit (coordinate ceiling=${ceiling})` });
    return { state, cacheKey };
  } catch {
    if (cacheKey) {
      try { await graph._seekCache.delete(cacheKey); } catch { /* best-effort */ }
    }
    return { state: null, cacheKey };
  }
}

/**
 * @param {import('../WarpRuntime.js').default} graph
 * @param {Map<string, string>} frontier
 * @param {number|null} ceiling
 * @returns {Promise<Array<{ patch: import('../types/WarpTypesV2.js').PatchV2, sha: string }>>}
 */
async function collectPatchesForFrontier(graph, frontier, ceiling) {
  const allPatches = [];
  for (const writerId of frontier.keys()) {
    const tipSha = frontier.get(writerId);
    if (!tipSha) {
      continue;
    }
    const writerPatches = await graph._loadPatchChainFromSha(tipSha);
    for (const entry of writerPatches) {
      if (ceiling === null || entry.patch.lamport <= ceiling) {
        allPatches.push(entry);
      }
    }
  }
  return allPatches;
}

/**
 * Builds a deterministic adjacency map for the logical graph.
 *
 * @this {import('../WarpRuntime.js').default}
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
 * @this {import('../WarpRuntime.js').default}
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
 * @this {import('../WarpRuntime.js').default}
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
 * Materializes against an explicit observation coordinate.
 *
 * Unlike `materialize()`, this path does not infer the frontier from current
 * writer refs. The provided frontier snapshot is authoritative for the read.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {{ frontier: Map<string, string>|Record<string, string>, ceiling?: number|null, receipts?: boolean }} options
 * @returns {Promise<WarpStateV5|{state: WarpStateV5, receipts: TickReceipt[]}>}
 */
export async function materializeCoordinate(options) {
  if (!options || typeof options !== 'object') {
    throw new QueryError('materializeCoordinate() requires an options object', {
      code: 'E_QUERY_COORDINATE_INVALID',
    });
  }

  const frontier = normalizeFrontierInput(options.frontier);
  const ceiling = normalizeExplicitCeiling(options.ceiling ?? null);
  const collectReceipts = !!options.receipts;
  const detached = await openDetachedReadGraph(this);

  return await detached._materializeWithCoordinate(
    frontier,
    ceiling,
    collectReceipts,
    detached._clock.now(),
  );
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
 * @this {import('../WarpRuntime.js').default}
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
  return await this._materializeWithCoordinate(frontier, ceiling, collectReceipts, t0);
}

/**
 * Materializes the graph at an explicit frontier snapshot and optional ceiling.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {Map<string, string>} frontier
 * @param {number|null} ceiling
 * @param {boolean} collectReceipts
 * @param {number} t0
 * @returns {Promise<WarpStateV5|{state: WarpStateV5, receipts: TickReceipt[]}>}
 * @private
 */
export async function _materializeWithCoordinate(frontier, ceiling, collectReceipts, t0) {
  if (
    this._cachedState &&
    !this._stateDirty &&
    ceiling === this._cachedCeiling &&
    !collectReceipts &&
    frontiersEqual(this._cachedFrontier, frontier)
  ) {
    return freezePublicState(this._cachedState);
  }

  const writerIds = [...frontier.keys()];
  if (writerIds.length === 0 || (ceiling !== null && ceiling <= 0)) {
    const state = createEmptyStateV5();
    this._provenanceIndex = new ProvenanceIndex();
    this._provenanceDegraded = false;
    await this._setMaterializedState(state);
    this._cachedCeiling = ceiling;
    this._cachedFrontier = new Map(frontier);
    this._logTiming('materialize', t0, { metrics: '0 patches (coordinate)' });
    if (collectReceipts) {
      return freezePublicStateWithReceipts(state, []);
    }
    return freezePublicState(state);
  }

  let cacheKey = null;
  if (!collectReceipts) {
    const cached = await tryReadCoordinateCache(this, frontier, ceiling, t0);
    if (cached?.state) {
      return freezePublicState(cached.state);
    }
    cacheKey = cached?.cacheKey ?? null;
  }

  const allPatches = await collectPatchesForFrontier(this, frontier, ceiling);

  /** @type {WarpStateV5|undefined} */
  let state;
  /** @type {TickReceipt[]|undefined} */
  let receipts;

  if (allPatches.length === 0) {
    state = createEmptyStateV5();
    if (collectReceipts) {
      receipts = [];
    }
  } else if (collectReceipts) {
    const result = /** @type {{state: WarpStateV5, receipts: TickReceipt[]}} */ (
      reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, { receipts: true })
    );
    state = result.state;
    receipts = result.receipts;
  } else {
    state = /** @type {WarpStateV5} */ (
      reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches))
    );
  }

  this._provenanceIndex = new ProvenanceIndex();
  for (const { patch, sha } of allPatches) {
    this._provenanceIndex.addPatch(sha, /** @type {string[]|undefined} */ (patch.reads), /** @type {string[]|undefined} */ (patch.writes));
  }
  this._provenanceDegraded = false;

  await this._setMaterializedState(state);
  this._cachedCeiling = ceiling;
  this._cachedFrontier = new Map(frontier);

  if (this._seekCache && !collectReceipts && allPatches.length > 0 && ceiling !== null) {
    try {
      if (!cacheKey) {
        cacheKey = await buildSeekCacheKey(ceiling, frontier);
      }
      const buf = serializeFullStateV5(state, { codec: this._codec });
      this._persistSeekCacheEntry(cacheKey, buf, state).catch(() => {});
    } catch {
      // crypto unavailable — skip cache write
    }
  }

  const ceilingLabel = ceiling === null ? 'latest' : String(ceiling);
  this._logTiming('materialize', t0, { metrics: `${allPatches.length} patches (coordinate ceiling=${ceilingLabel})` });

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
 * @this {import('../WarpRuntime.js').default}
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
 * @this {import('../WarpRuntime.js').default}
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
    void writerId;
    return await this._loadPatchChainFromSha(toSha, fromSha);
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
 * @this {import('../WarpRuntime.js').default}
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
 * @this {import('../WarpRuntime.js').default}
 */
export function invalidateIndex() {
  this._cachedIndexTree = null;
  this._cachedViewHash = null;
}
