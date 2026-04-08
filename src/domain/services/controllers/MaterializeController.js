/**
 * MaterializeController — full and ceiling-aware materialization,
 * adjacency building, bitmap index management, and state caching.
 *
 * Extracted from materialize.methods.js and materializeAdvanced.methods.js.
 * WarpRuntime delegates to this controller via defineProperty loops on the
 * prototype.
 *
 * @module domain/services/controllers/MaterializeController
 */

import { reduceV5, createEmptyStateV5, cloneStateV5 } from '../JoinReducer.js';
import { isV5CheckpointSchema, materializeIncremental } from '../state/CheckpointService.js';
import { createImmutableValue, createImmutableWarpStateV5 } from '../ImmutableSnapshot.js';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.js';
import { diffStates, isEmptyDiff } from '../state/StateDiff.js';
import { decodePatchMessage, detectMessageKind } from '../codec/WarpMessageCodec.js';
import { orsetContains, orsetElements } from '../../crdt/ORSet.js';
import { decodeEdgeKey } from '../KeyCodec.js';
import { computeStateHashV5 } from '../state/StateSerializerV5.js';
import { serializeFullStateV5, deserializeFullStateV5 } from '../state/CheckpointSerializerV5.js';
import { buildSeekCacheKey } from '../../utils/seekCacheKey.ts';
import { createFrontier, updateFrontier } from '../Frontier.js';
import BitmapNeighborProvider from '../index/BitmapNeighborProvider.js';
import { QueryError } from '../../warp/_internal.js';
import { buildWriterRef } from '../../utils/RefLayout.ts';

/**
 * @typedef {import('../../WarpRuntime.js').default} MaterializeHost
 * @typedef {import('../../types/WarpPersistence.ts').CorePersistence} CorePersistence
 */

/** @import { WarpStateV5 } from '../JoinReducer.js' */
/** @import { TickReceipt } from '../../types/TickReceipt.ts' */
/** @import { PatchDiff } from '../../types/PatchDiff.ts' */

// ── Standalone helper functions ─────────────────────────────────────────────

/**
 * Scans the checkpoint frontier's tip commits for the maximum observed Lamport tick.
 * Updates `host._maxObservedLamport` in-place; best-effort (skips unreadable commits).
 *
 * @param {MaterializeHost} host
 * @param {Map<string, string>} frontier
 * @returns {Promise<void>}
 */
async function scanFrontierForMaxLamport(host, frontier) {
  for (const tipSha of frontier.values()) {
    try {
      const msg = await host._persistence.showNode(tipSha);
      if (detectMessageKind(msg) === 'patch') {
        const { lamport } = decodePatchMessage(msg);
        if (lamport > host._maxObservedLamport) {
          host._maxObservedLamport = lamport;
        }
      }
    } catch {
      // best-effort: skip unreadable frontier commits
    }
  }
}

/**
 * Scans a list of patch entries for the maximum observed Lamport tick.
 * Updates `host._maxObservedLamport` in-place.
 *
 * @param {MaterializeHost} host
 * @param {Array<{patch: {lamport?: number}}>} patches
 */
function scanPatchesForMaxLamport(host, patches) {
  for (const { patch } of patches) {
    const tick = patch.lamport ?? 0;
    if (tick > host._maxObservedLamport) {
      host._maxObservedLamport = tick;
    }
  }
}

/**
 * Creates a shallow-frozen public view of materialized state.
 *
 * @param {WarpStateV5} state
 * @returns {WarpStateV5}
 */
function freezePublicState(state) {
  return createImmutableWarpStateV5(state);
}

/**
 * Creates a shallow-frozen public result for receipt-enabled materialization.
 *
 * @param {WarpStateV5} state
 * @param {TickReceipt[]} receipts
 * @returns {{state: WarpStateV5, receipts: TickReceipt[]}}
 */
function freezePublicStateWithReceipts(state, receipts) {
  return Object.freeze({
    state: freezePublicState(state),
    receipts: /** @type {TickReceipt[]} */ (createImmutableValue(receipts)),
  });
}

/**
 * Triggers an auto-checkpoint when the checkpoint policy threshold is exceeded.
 * Guard prevents recursion since createCheckpoint() calls materialize() internally.
 *
 * @param {MaterializeHost} host
 * @param {number} patchCount
 * @returns {Promise<void>}
 */
async function _maybeAutoCheckpoint(host, patchCount) {
  if (host._checkpointPolicy && !host._checkpointing && patchCount >= host._checkpointPolicy.every) {
    try {
      await host.createCheckpoint();
      host._patchesSinceCheckpoint = 0;
    } catch {
      // Checkpoint failure does not break materialize — continue silently
    }
  }
}

/**
 * Opens a detached graph handle for read-only materialization.
 *
 * @param {MaterializeHost} host
 * @returns {Promise<MaterializeHost>}
 */
async function openDetachedReadGraph(host) {
  const GraphClass = /** @type {typeof import('../../WarpRuntime.js').default} */ (host.constructor);
  return await GraphClass.open({
    persistence: host._persistence,
    graphName: host._graphName,
    writerId: host._writerId,
    gcPolicy: host._gcPolicy,
    ...(host._checkpointPolicy ? { checkpointPolicy: host._checkpointPolicy } : {}),
    autoMaterialize: false,
    onDeleteWithData: host._onDeleteWithData,
    ...(host._logger ? { logger: host._logger } : {}),
    clock: host._clock,
    crypto: host._crypto,
    codec: host._codec,
    ...(host._seekCache ? { seekCache: host._seekCache } : {}),
    audit: false,
    ...(host._blobStorage ? { blobStorage: host._blobStorage } : {}),
    ...(host._patchBlobStorage ? { patchBlobStorage: host._patchBlobStorage } : {}),
    ...(host._trustConfig !== undefined ? { trust: host._trustConfig } : {}),
    ...(host._checkpointStore !== undefined && host._checkpointStore !== null ? { checkpointStore: host._checkpointStore } : {}),
    ...(host._patchJournal !== undefined && host._patchJournal !== null ? { patchJournal: /** @type {import('../../../ports/PatchJournalPort.ts').default} */ (host._patchJournal) } : {}),
    ...(host._indexStore !== undefined && host._indexStore !== null ? { indexStore: host._indexStore } : {}),
  });
}

/**
 * Normalizes a frontier input to a sorted Map of writerId-to-tipSha pairs.
 *
 * @param {Map<string, string>|Record<string, string>} frontierInput
 * @returns {Map<string, string>}
 */
function normalizeFrontierInput(frontierInput) {
  /** @type {Array<[string, string]>} */
  let entries;

  if (frontierInput instanceof Map) {
    entries = [...frontierInput.entries()];
  } else if (typeof frontierInput === 'object' && frontierInput !== null && !Array.isArray(frontierInput)) {
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
 * Validates and normalizes an explicit Lamport ceiling value.
 *
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
 * Checks whether two frontier maps are structurally equal.
 *
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
 * Attempts to read a materialized state from the seek cache for a coordinate.
 *
 * @param {MaterializeHost} host
 * @param {Map<string, string>} frontier
 * @param {number|null} ceiling
 * @param {number} t0
 * @returns {Promise<{state: WarpStateV5|null, cacheKey: string|null}|null>}
 */
async function tryReadCoordinateCache(host, frontier, ceiling, t0) {
  if (!host._seekCache || ceiling === null) {
    return null;
  }

  let cacheKey = null;
  try {
    cacheKey = await buildSeekCacheKey(ceiling, frontier);
  } catch {
    return null;
  }

  try {
    const cached = await host._seekCache.get(cacheKey);
    if (!cached) {
      return { state: null, cacheKey };
    }

    const state = deserializeFullStateV5(cached.buffer, { codec: host._codec });
    host._provenanceIndex = new ProvenanceIndex();
    host._provenanceDegraded = true;
    await host._setMaterializedState(state);
    host._cachedCeiling = ceiling;
    host._cachedFrontier = new Map(frontier);
    if (typeof cached.indexTreeOid === 'string' && cached.indexTreeOid.length > 0) {
      await host._restoreIndexFromCache(cached.indexTreeOid);
    }
    host._logTiming('materialize', t0, { metrics: `cache hit (coordinate ceiling=${ceiling})` });
    return { state, cacheKey };
  } catch {
    if (typeof cacheKey === 'string' && cacheKey.length > 0) {
      try { await host._seekCache.delete(cacheKey); } catch { /* best-effort */ }
    }
    return { state: null, cacheKey };
  }
}

/**
 * Collects all patch entries for writers in a frontier, filtered by optional ceiling.
 *
 * @param {MaterializeHost} host
 * @param {Map<string, string>} frontier
 * @param {number|null} ceiling
 * @returns {Promise<Array<{ patch: import('../../types/Patch.ts').default, sha: string }>>}
 */
async function collectPatchesForFrontier(host, frontier, ceiling) {
  const allPatches = [];
  for (const writerId of frontier.keys()) {
    const tipSha = frontier.get(writerId);
    if (typeof tipSha !== 'string' || tipSha.length === 0) {
      continue;
    }
    const writerPatches = await host._loadPatchChainFromSha(tipSha);
    for (const entry of writerPatches) {
      if (ceiling === null || entry.patch.lamport <= ceiling) {
        allPatches.push(entry);
      }
    }
  }
  return allPatches;
}

// ── MaterializeController class ─────────────────────────────────────────────

/**
 * @typedef {{ outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>> }} AdjacencyMap
 * @typedef {{ state: WarpStateV5, stateHash: string|null, adjacency: AdjacencyMap }} MaterializedResult
 */

export default class MaterializeController {
  /** @type {MaterializeHost} */
  _host;

  /**
   * Creates a MaterializeController bound to a WarpRuntime host.
   * @param {MaterializeHost} host
   */
  constructor(host) {
    this._host = host;
  }

  /**
   * Materializes the current graph state.
   *
   * Discovers all writers, collects all patches from each writer's ref chain,
   * and reduces them to produce the current state.
   *
   * Checks if a checkpoint exists and uses incremental materialization if so.
   *
   * When `options.receipts` is true, returns `{ state, receipts }` where
   * receipts is an array of TickReceipt objects (one per applied patch).
   * When false or omitted (default), returns just the state for backward
   * compatibility with zero receipt overhead.
   *
   * When a Lamport ceiling is active (via `options.ceiling` or the
   * instance-level `_seekCeiling`), delegates to a ceiling-aware path
   * that replays only patches with `lamport <= ceiling`, bypassing
   * checkpoints, auto-checkpoint, and GC.
   *
   * Side effects: Updates internal cached state, version vector, last frontier,
   * and patches-since-checkpoint counter. May trigger auto-checkpoint and GC
   * based on configured policies. Notifies subscribers if state changed.
   *
   * @param {{receipts?: boolean, ceiling?: number|null}} [options] - Optional configuration
   * @returns {Promise<WarpStateV5|{state: WarpStateV5, receipts: TickReceipt[]}>} The materialized graph state, or { state, receipts } when receipts enabled
   * @throws {Error} If checkpoint loading fails or patch decoding fails
   * @throws {Error} If writer ref access or patch blob reading fails
   */
  async materialize(options) {
    const h = this._host;
    const t0 = h._clock.now();
    // ZERO-COST: only resolve receipts flag when options provided
    const collectReceipts = options?.receipts;
    // Resolve ceiling: explicit option > instance-level seek ceiling > null (latest)
    const ceiling = this._resolveCeiling(options);

    try {
      // When ceiling is active, delegate to ceiling-aware path (with its own cache)
      if (ceiling !== null) {
        const result = await this._materializeWithCeiling(ceiling, collectReceipts === true, t0);
        if (collectReceipts === true) {
          const withReceipts = /** @type {{state: WarpStateV5, receipts: TickReceipt[]}} */ (result);
          return freezePublicStateWithReceipts(withReceipts.state, withReceipts.receipts);
        }
        return freezePublicState(/** @type {WarpStateV5} */ (result));
      }

      // Check for checkpoint
      const checkpoint = await h._loadLatestCheckpoint();

      /** @type {WarpStateV5|undefined} */
      let state;
      /** @type {TickReceipt[]|undefined} */
      let receipts;
      /** @type {PatchDiff|undefined} */
      let diff;
      let patchCount = 0;
      const wantDiff = collectReceipts !== true && h._cachedIndexTree !== null && h._cachedIndexTree !== undefined;

      // If checkpoint exists, use incremental materialization
      if (isV5CheckpointSchema(checkpoint?.schema)) {
        const ck = /** @type {NonNullable<typeof checkpoint>} */ (checkpoint);
        const patches = await h._loadPatchesSince(ck);
        // Update max observed Lamport so _nextLamport() issues globally-monotonic ticks.
        // Read the checkpoint frontier's tip commit messages to capture the pre-checkpoint max,
        // then scan the incremental patches for anything newer.
        if (ck.frontier instanceof Map) {
          await scanFrontierForMaxLamport(h, ck.frontier);
        }
        scanPatchesForMaxLamport(h, patches);
        if (collectReceipts === true) {
          const result = /** @type {{state: WarpStateV5, receipts: TickReceipt[]}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (patches), ck.state, { receipts: true }));
          state = result.state;
          receipts = result.receipts;
        } else if (wantDiff) {
          const result = /** @type {{state: WarpStateV5, diff: PatchDiff}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (patches), ck.state, { trackDiff: true }));
          state = result.state;
          diff = result.diff;
        } else {
          state = /** @type {WarpStateV5} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (patches), ck.state));
        }
        patchCount = patches.length;

        // Build provenance index: start from checkpoint index if present, then add new patches
        const ckPI = /** @type {{provenanceIndex?: import('../provenance/ProvenanceIndex.js').ProvenanceIndex}} */ (ck).provenanceIndex;
        h._provenanceIndex = ckPI
          ? ckPI.clone()
          : new ProvenanceIndex();
        for (const { patch, sha } of patches) {
          /** @type {import('../provenance/ProvenanceIndex.js').ProvenanceIndex} */ (h._provenanceIndex).addPatch(sha, patch.reads, patch.writes);
        }
      } else {
        // 1. Discover all writers
        const writerIds = await h.discoverWriters();

        // 2. If no writers, return empty state
        if (writerIds.length === 0) {
          state = createEmptyStateV5();
          h._provenanceIndex = new ProvenanceIndex();
          if (collectReceipts === true) {
            receipts = [];
          }
        } else {
          // 3. For each writer, collect all patches
          const allPatches = [];
          for (const writerId of writerIds) {
            const writerPatches = await h._loadWriterPatches(writerId);
            for (const p of writerPatches) {
              allPatches.push(p);
            }
          }

          // 4. If no patches, return empty state
          if (allPatches.length === 0) {
            state = createEmptyStateV5();
            h._provenanceIndex = new ProvenanceIndex();
            if (collectReceipts === true) {
              receipts = [];
            }
          } else {
            // Update max observed Lamport from all loaded patches.
            scanPatchesForMaxLamport(h, allPatches);
            // 5. Reduce all patches to state
            if (collectReceipts === true) {
              const result = /** @type {{state: WarpStateV5, receipts: TickReceipt[]}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, { receipts: true }));
              state = result.state;
              receipts = result.receipts;
            } else if (wantDiff) {
              const result = /** @type {{state: WarpStateV5, diff: PatchDiff}} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches), undefined, { trackDiff: true }));
              state = result.state;
              diff = result.diff;
            } else {
              state = /** @type {WarpStateV5} */ (reduceV5(/** @type {Parameters<typeof reduceV5>[0]} */ (allPatches)));
            }
            patchCount = allPatches.length;

            // Build provenance index from all patches
            h._provenanceIndex = new ProvenanceIndex();
            for (const { patch, sha } of allPatches) {
              h._provenanceIndex.addPatch(sha, patch.reads, patch.writes);
            }
          }
        }
      }

      await this._setMaterializedState(state, diff ? { diff } : {});
      h._provenanceDegraded = false;
      h._cachedCeiling = null;
      h._cachedFrontier = null;
      h._lastFrontier = await h.getFrontier();
      h._patchesSinceCheckpoint = patchCount;

      await _maybeAutoCheckpoint(h, patchCount);

      h._maybeRunGC(state);

      // Notify subscribers if state changed since last notification
      // Also handles deferred replay for subscribers added with replay: true before cached state
      if (h._subscribers.length > 0) {
        const hasPendingReplay = h._subscribers.some(s => s.pendingReplay === true);
        const stateDelta = diffStates(h._lastNotifiedState, state);
        if (!isEmptyDiff(stateDelta) || hasPendingReplay) {
          h._notifySubscribers(stateDelta, state);
        }
      }
      // Clone state to prevent eager path mutations from affecting the baseline
      h._lastNotifiedState = cloneStateV5(state);

      h._logTiming('materialize', t0, { metrics: `${patchCount} patches` });

      if (collectReceipts === true) {
        return freezePublicStateWithReceipts(
          /** @type {WarpStateV5} */ (state),
          /** @type {TickReceipt[]} */ (receipts),
        );
      }
      return freezePublicState(/** @type {WarpStateV5} */ (state));
    } catch (err) {
      h._logTiming('materialize', t0, { error: /** @type {Error} */ (err) });
      throw err;
    }
  }

  /**
   * Materializes the graph and returns the materialized graph details.
   *
   * @returns {Promise<object>}
   * @public — called via host delegation (defineProperty in WarpRuntime)
   */
  async _materializeGraph() {
    const h = this._host;
    if (!h._stateDirty && h._materializedGraph) {
      return h._materializedGraph;
    }
    // Route through host so test mocks on graph.materialize are respected.
    const materialized = await h.materialize();
    const state = h._stateDirty
      ? /** @type {WarpStateV5} */ (materialized)
      : (h._cachedState
        || /** @type {WarpStateV5} */ (materialized));
    if (state === undefined || state === null) {
      return /** @type {object} */ (h._materializedGraph);
    }
    if (!h._materializedGraph || h._materializedGraph.state !== state) {
      await this._setMaterializedState(/** @type {WarpStateV5} */ (state));
    }
    return /** @type {object} */ (h._materializedGraph);
  }

  /**
   * Resolves the effective ceiling from options and instance state.
   *
   * Precedence: explicit `ceiling` in options overrides the instance-level
   * `_seekCeiling`. Uses the `'ceiling' in options` check, so passing
   * `{ ceiling: null }` explicitly clears the seek ceiling for that call
   * (returns `null`), while omitting the key falls through to `_seekCeiling`.
   *
   * @param {{ceiling?: number|null}} [options] - Options object; when the
   *   `ceiling` key is present (even if `null`), its value takes precedence
   * @returns {number|null} Lamport ceiling to apply, or `null` for latest
   * @private
   */
  _resolveCeiling(options) {
    const h = this._host;
    if (options && 'ceiling' in options) {
      return options.ceiling ?? null;
    }
    return h._seekCeiling;
  }

  /**
   * Builds a deterministic adjacency map for the logical graph.
   *
   * @param {WarpStateV5} state
   * @returns {{outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}}
   * @private
   */
  _buildAdjacency(state) {
    /** @type {Map<string, Array<{neighborId: string, label: string}>>} */
    const outgoing = new Map();
    /** @type {Map<string, Array<{neighborId: string, label: string}>>} */
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

      /** @type {Array<{neighborId: string, label: string}>} */ (outgoing.get(from)).push({ neighborId: to, label });
      /** @type {Array<{neighborId: string, label: string}>} */ (incoming.get(to)).push({ neighborId: from, label });
    }

    /**
     * Sorts a neighbor list by neighborId then label for deterministic output.
     *
     * @param {Array<{neighborId: string, label: string}>} list
     */
    const sortNeighbors = (list) => {
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
   * @param {WarpStateV5} state
   * @param {PatchDiff|{diff?: PatchDiff|null}} [optionsOrDiff]
   *   Either a PatchDiff (legacy positional form) or options object.
   * @returns {Promise<MaterializedResult>}
   * @private
   */
  async _setMaterializedState(state, optionsOrDiff) {
    const h = this._host;
    /** @type {PatchDiff|undefined} */
    let diff;
    if (
      optionsOrDiff &&
      typeof optionsOrDiff === 'object' &&
      Object.prototype.hasOwnProperty.call(optionsOrDiff, 'diff')
    ) {
      diff = /** @type {{diff?: PatchDiff|null}} */ (optionsOrDiff).diff ?? undefined;
    } else {
      diff = /** @type {PatchDiff|undefined} */ (optionsOrDiff ?? undefined);
    }
    h._cachedState = state;
    h._stateDirty = false;
    h._versionVector = state.observedFrontier.clone();

    const stateHashService = /** @type {import('../state/StateHashService.js').default|null} */ (h._stateHashService);
    const stateHash = stateHashService
      ? await stateHashService.compute(state)
      : await computeStateHashV5(state, { crypto: h._crypto, codec: h._codec });
    let adjacency;

    if (h._adjacencyCache) {
      adjacency = h._adjacencyCache.get(stateHash);
      if (!adjacency) {
        adjacency = h._buildAdjacency(state);
        h._adjacencyCache.set(stateHash, adjacency);
      }
    } else {
      adjacency = this._buildAdjacency(state);
    }

    h._materializedGraph = { state, stateHash, adjacency };
    h._buildView(state, stateHash, diff);
    return h._materializedGraph;
  }

  /**
   * Builds the MaterializedView (logicalIndex + propertyReader) and attaches
   * a BitmapNeighborProvider to the materialized graph. Skips rebuild when
   * the stateHash matches the previous build. Uses incremental update when
   * a diff and cached index tree are available.
   *
   * @param {WarpStateV5} state
   * @param {string} stateHash
   * @param {PatchDiff} [diff] - Optional diff for incremental update
   * @public — called via host delegation (defineProperty in WarpRuntime)
   */
  _buildView(state, stateHash, diff) {
    const h = this._host;
    if (h._cachedViewHash === stateHash) {
      return;
    }
    try {
      /** @type {import('../MaterializedViewService.js').BuildResult} */
      let result;
      if (diff && h._cachedIndexTree) {
        result = h._viewService.applyDiff({
          existingTree: h._cachedIndexTree,
          diff,
          state,
        });
      } else {
        result = h._viewService.build(state);
      }

      h._logicalIndex = result.logicalIndex;
      h._propertyReader = result.propertyReader;
      h._cachedViewHash = stateHash;
      h._cachedIndexTree = result.tree;
      h._indexDegraded = false;

      const provider = new BitmapNeighborProvider({ logicalIndex: result.logicalIndex });
      if (h._materializedGraph) {
        h._materializedGraph.provider = provider;
      }
    } catch (err) {
      h._logger?.warn('[warp] index build failed, falling back to linear scan', {
        error: /** @type {Error} */ (err).message,
      });
      h._indexDegraded = true;
      h._logicalIndex = null;
      h._propertyReader = null;
      h._cachedIndexTree = null;
    }
  }

  /**
   * Materializes against an explicit observation coordinate.
   *
   * Unlike `materialize()`, this path does not infer the frontier from current
   * writer refs. The provided frontier snapshot is authoritative for the read.
   *
   * @param {{ frontier: Map<string, string>|Record<string, string>, ceiling?: number|null, receipts?: boolean }} options
   * @returns {Promise<WarpStateV5|{state: WarpStateV5, receipts: TickReceipt[]}>}
   */
  async materializeCoordinate(options) {
    const h = this._host;
    if (options === null || options === undefined || typeof options !== 'object') {
      throw new QueryError('materializeCoordinate() requires an options object', {
        code: 'E_QUERY_COORDINATE_INVALID',
      });
    }

    const frontier = normalizeFrontierInput(options.frontier);
    const ceiling = normalizeExplicitCeiling(options.ceiling ?? null);
    const collectReceipts = options.receipts === true;
    const detached = await openDetachedReadGraph(h);

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
   * @param {number} ceiling - Maximum Lamport tick to include (patches with
   *   `lamport <= ceiling` are replayed; `ceiling <= 0` yields empty state)
   * @param {boolean} collectReceipts - When `true`, return receipts alongside
   *   state and skip the ceiling cache
   * @param {number} t0 - Start timestamp for performance logging
   * @returns {Promise<WarpStateV5 |
   *   {state: WarpStateV5,
   *    receipts: TickReceipt[]}>}
   *   Plain state when `collectReceipts` is falsy; `{ state, receipts }`
   *   when truthy
   * @private
   */
  async _materializeWithCeiling(ceiling, collectReceipts, t0) {
    const h = this._host;
    const frontier = await h.getFrontier();
    return await this._materializeWithCoordinate(frontier, ceiling, collectReceipts, t0);
  }

  /**
   * Materializes the graph at an explicit frontier snapshot and optional ceiling.
   *
   * @param {Map<string, string>} frontier
   * @param {number|null} ceiling
   * @param {boolean} collectReceipts
   * @param {number} t0
   * @returns {Promise<WarpStateV5|{state: WarpStateV5, receipts: TickReceipt[]}>}
   * @private
   */
  async _materializeWithCoordinate(frontier, ceiling, collectReceipts, t0) {
    const h = this._host;
    if (
      h._cachedState &&
      !h._stateDirty &&
      ceiling === h._cachedCeiling &&
      !collectReceipts &&
      frontiersEqual(h._cachedFrontier, frontier)
    ) {
      return freezePublicState(h._cachedState);
    }

    const writerIds = [...frontier.keys()];
    if (writerIds.length === 0 || (ceiling !== null && ceiling <= 0)) {
      const state = createEmptyStateV5();
      h._provenanceIndex = new ProvenanceIndex();
      h._provenanceDegraded = false;
      await this._setMaterializedState(state);
      h._cachedCeiling = ceiling;
      h._cachedFrontier = new Map(frontier);
      h._logTiming('materialize', t0, { metrics: '0 patches (coordinate)' });
      if (collectReceipts) {
        return freezePublicStateWithReceipts(state, []);
      }
      return freezePublicState(state);
    }

    let cacheKey = null;
    if (!collectReceipts) {
      const cached = await tryReadCoordinateCache(h, frontier, ceiling, t0);
      if (cached?.state) {
        return freezePublicState(cached.state);
      }
      cacheKey = cached?.cacheKey ?? null;
    }

    const allPatches = await collectPatchesForFrontier(h, frontier, ceiling);

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

    h._provenanceIndex = new ProvenanceIndex();
    for (const { patch, sha } of allPatches) {
      h._provenanceIndex.addPatch(sha, /** @type {string[]|undefined} */ (patch.reads), /** @type {string[]|undefined} */ (patch.writes));
    }
    h._provenanceDegraded = false;

    await this._setMaterializedState(state);
    h._cachedCeiling = ceiling;
    h._cachedFrontier = new Map(frontier);

    if (h._seekCache && !collectReceipts && allPatches.length > 0 && ceiling !== null) {
      try {
        if (cacheKey === null || cacheKey === undefined) {
          cacheKey = await buildSeekCacheKey(ceiling, frontier);
        }
        const buf = serializeFullStateV5(state, { codec: h._codec });
        this._persistSeekCacheEntry(cacheKey, buf, state).catch(() => {});
      } catch {
        // crypto unavailable — skip cache write
      }
    }

    const ceilingLabel = ceiling === null ? 'latest' : String(ceiling);
    h._logTiming('materialize', t0, { metrics: `${allPatches.length} patches (coordinate ceiling=${ceilingLabel})` });

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
   * @param {string} cacheKey - Seek cache key
   * @param {Uint8Array} buf - Serialized WarpStateV5 buffer
   * @param {WarpStateV5} state
   * @returns {Promise<void>}
   * @private
   */
  async _persistSeekCacheEntry(cacheKey, buf, state) {
    const h = this._host;
    /** @type {{ indexTreeOid?: string }} */
    const opts = {};
    try {
      const { tree } = h._viewService.build(state);
      opts.indexTreeOid = await h._viewService.persistIndexTree(
        tree,
        h._persistence,
      );
    } catch {
      // Non-fatal — cache the state without the index
    }
    if (h._seekCache) {
      await h._seekCache.set(cacheKey, buf, opts);
    }
  }

  /**
   * Restores a LogicalIndex and PropertyReader from a cached index tree OID.
   *
   * Reads the tree entries from Git storage and delegates hydration to
   * the MaterializedViewService. Failure is non-fatal — the in-memory
   * index built by `_buildView` remains as fallback.
   *
   * @param {string} indexTreeOid - Git tree OID of the bitmap index snapshot
   * @returns {Promise<void>}
   * @public — called via host delegation (defineProperty in WarpRuntime)
   */
  async _restoreIndexFromCache(indexTreeOid) {
    const h = this._host;
    try {
      const shardOids = await h._persistence.readTreeOids(indexTreeOid);
      const { logicalIndex, propertyReader } =
        await h._viewService.loadFromOids(shardOids, h._persistence);
      h._logicalIndex = logicalIndex;
      h._propertyReader = propertyReader;
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
   * @param {string} checkpointSha - The checkpoint commit SHA
   * @returns {Promise<WarpStateV5>} The materialized graph state at the checkpoint
   * @throws {Error} If checkpoint SHA is invalid or not found
   * @throws {Error} If checkpoint loading or patch decoding fails
   *
   * @example
   * // Time-travel to a previous checkpoint
   * const oldState = await graph.materializeAt('abc123');
   * console.log('Nodes at checkpoint:', orsetElements(oldState.nodeAlive));
   */
  async materializeAt(checkpointSha) {
    const h = this._host;
    // 1. Discover current writers to build target frontier
    const writerIds = await h.discoverWriters();

    // 2. Build target frontier (current tips for all writers)
    const targetFrontier = createFrontier();
    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(h._graphName, writerId);
      const tipSha = await h._persistence.readRef(writerRef);
      if (typeof tipSha === 'string' && tipSha.length > 0) {
        updateFrontier(targetFrontier, writerId, tipSha);
      }
    }

    // 3. Create a patch loader function for incremental materialization
    /**
     * Loads patches between two SHAs in a writer's chain.
     *
     * @param {string} writerId - Writer identifier (unused, required by interface)
     * @param {string|null} fromSha - Starting SHA (exclusive) or null for full chain
     * @param {string} toSha - Ending SHA (inclusive)
     * @returns {Promise<Array<{ patch: import('../../types/Patch.ts').default, sha: string }>>}
     */
    const patchLoader = async (writerId, fromSha, toSha) => {
      void writerId;
      return await h._loadPatchChainFromSha(toSha, fromSha);
    };

    // 4. Call materializeIncremental with the checkpoint and target frontier
    /** @type {CorePersistence} */
    const persistence = h._persistence;
    const state = await materializeIncremental({
      persistence,
      graphName: h._graphName,
      checkpointSha,
      targetFrontier,
      patchLoader,
      codec: h._codec,
    });
    await this._setMaterializedState(state);
    return freezePublicState(state);
  }

  /**
   * Verifies the bitmap index against adjacency ground truth.
   *
   * @param {{ seed?: number, sampleRate?: number }} [options]
   * @returns {{ passed: number, failed: number, errors: Array<{nodeId: string, direction: string, expected: string[], actual: string[]}> }}
   */
  verifyIndex(options) {
    const h = this._host;
    if (h._logicalIndex === null || h._logicalIndex === undefined ||
        h._cachedState === null || h._cachedState === undefined ||
        h._viewService === null || h._viewService === undefined) {
      throw new QueryError('Cannot verify index: graph not materialized or index not built', {
        code: 'E_QUERY_NO_STATE',
      });
    }
    return h._viewService.verifyIndex({
      state: h._cachedState,
      logicalIndex: h._logicalIndex,
      ...(options !== undefined ? { options } : {}),
    });
  }

  /**
   * Clears the cached bitmap index, forcing a full rebuild on next materialize.
   */
  invalidateIndex() {
    const h = this._host;
    h._cachedIndexTree = null;
    h._cachedViewHash = null;
  }
}
