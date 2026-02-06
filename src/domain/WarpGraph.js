/**
 * WarpGraph - Main API class for WARP multi-writer graph database.
 *
 * Provides a factory for opening multi-writer graphs and methods for
 * creating patches, materializing state, and managing checkpoints.
 *
 * @module domain/WarpGraph
 * @see WARP Spec Section 11
 */

import { validateGraphName, validateWriterId, buildWriterRef, buildCoverageRef, buildCheckpointRef, buildWritersPrefix, parseWriterIdFromRef } from './utils/RefLayout.js';
import { PatchBuilderV2 } from './services/PatchBuilderV2.js';
import { reduceV5, createEmptyStateV5, joinStates, join as joinPatch, decodeEdgeKey, decodePropKey, isEdgePropKey, decodeEdgePropKey, encodeEdgeKey, cloneStateV5 } from './services/JoinReducer.js';
import { ProvenanceIndex } from './services/ProvenanceIndex.js';
import { ProvenancePayload } from './services/ProvenancePayload.js';
import { diffStates, isEmptyDiff } from './services/StateDiff.js';
import { orsetContains, orsetElements } from './crdt/ORSet.js';
import { decode } from '../infrastructure/codecs/CborCodec.js';
import { decodePatchMessage, detectMessageKind, encodeAnchorMessage } from './services/WarpMessageCodec.js';
import { loadCheckpoint, materializeIncremental, create as createCheckpointCommit } from './services/CheckpointService.js';
import { createFrontier, updateFrontier } from './services/Frontier.js';
import { createVersionVector, vvClone, vvIncrement } from './crdt/VersionVector.js';
import { DEFAULT_GC_POLICY, shouldRunGC, executeGC } from './services/GCPolicy.js';
import { collectGCMetrics } from './services/GCMetrics.js';
import { computeAppliedVV } from './services/CheckpointSerializerV5.js';
import { computeStateHashV5 } from './services/StateSerializerV5.js';
import {
  createSyncRequest,
  processSyncRequest,
  applySyncResponse,
  syncNeeded,
} from './services/SyncProtocol.js';
import { retry, timeout, RetryExhaustedError, TimeoutError } from '@git-stunts/alfred';
import { Writer } from './warp/Writer.js';
import { generateWriterId, resolveWriterId } from './utils/WriterId.js';
import QueryBuilder from './services/QueryBuilder.js';
import LogicalTraversal from './services/LogicalTraversal.js';
import LRUCache from './utils/LRUCache.js';
import SyncError from './errors/SyncError.js';
import QueryError from './errors/QueryError.js';
import ForkError from './errors/ForkError.js';
import { createWormhole as createWormholeImpl } from './services/WormholeService.js';
import { checkAborted } from './utils/cancellation.js';
import OperationAbortedError from './errors/OperationAbortedError.js';
import { compareEventIds } from './utils/EventId.js';
import PerformanceClockAdapter from '../infrastructure/adapters/PerformanceClockAdapter.js';

const DEFAULT_SYNC_SERVER_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_SYNC_WITH_RETRIES = 3;
const DEFAULT_SYNC_WITH_BASE_DELAY_MS = 250;
const DEFAULT_SYNC_WITH_MAX_DELAY_MS = 2000;
const DEFAULT_SYNC_WITH_TIMEOUT_MS = 10_000;

/**
 * Recursively canonicalizes a JSON value by sorting object keys alphabetically.
 * Arrays are processed element-by-element; primitives pass through unchanged.
 * Used to produce deterministic JSON output for sync request/response hashing.
 *
 * @param {*} value - Any JSON-serializable value
 * @returns {*} The canonicalized value with sorted object keys
 * @private
 */
function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalizeJson(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Produces a canonical JSON string with sorted keys for deterministic comparison.
 * Wraps canonicalizeJson + JSON.stringify for sync protocol use.
 *
 * @param {*} value - Any JSON-serializable value
 * @returns {string} Canonical JSON string
 * @private
 */
function canonicalStringify(value) {
  return JSON.stringify(canonicalizeJson(value));
}

/**
 * Normalizes a sync endpoint path to ensure it starts with '/'.
 * Returns '/sync' if no path is provided.
 *
 * @param {string|undefined|null} path - The sync path to normalize
 * @returns {string} Normalized path starting with '/'
 * @private
 */
function normalizeSyncPath(path) {
  if (!path) {
    return '/sync';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

const DEFAULT_ADJACENCY_CACHE_SIZE = 3;

/**
 * @typedef {Object} MaterializedGraph
 * @property {import('./services/JoinReducer.js').WarpStateV5} state
 * @property {string} stateHash
 * @property {{outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}} adjacency
 */

/**
 * WarpGraph class for interacting with a WARP multi-writer graph.
 */
export default class WarpGraph {
  /**
   * @private
   * @param {Object} options
   * @param {import('../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   * @param {Object} [options.gcPolicy] - GC policy configuration (overrides defaults)
   * @param {number} [options.adjacencyCacheSize] - Max materialized adjacency cache entries
   * @param {{every: number}} [options.checkpointPolicy] - Auto-checkpoint policy; creates a checkpoint every N patches
   * @param {boolean} [options.autoMaterialize=false] - If true, query methods auto-materialize instead of throwing
   * @param {'reject'|'cascade'|'warn'} [options.onDeleteWithData='warn'] - Policy when deleting a node that still has edges or properties
   * @param {import('../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging
   * @param {import('../ports/ClockPort.js').default} [options.clock] - Clock for timing instrumentation (defaults to PerformanceClockAdapter)
   */
  constructor({ persistence, graphName, writerId, gcPolicy = {}, adjacencyCacheSize = DEFAULT_ADJACENCY_CACHE_SIZE, checkpointPolicy, autoMaterialize = false, onDeleteWithData = 'warn', logger, clock }) {
    /** @type {import('../ports/GraphPersistencePort.js').default} */
    this._persistence = persistence;

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;

    /** @type {import('./crdt/VersionVector.js').VersionVector} */
    this._versionVector = createVersionVector();

    /** @type {import('./services/JoinReducer.js').WarpStateV5|null} */
    this._cachedState = null;

    /** @type {boolean} */
    this._stateDirty = false;

    /** @type {Object} */
    this._gcPolicy = { ...DEFAULT_GC_POLICY, ...gcPolicy };

    /** @type {number} */
    this._lastGCTime = 0;

    /** @type {number} */
    this._patchesSinceGC = 0;

    /** @type {number} */
    this._patchesSinceCheckpoint = 0;

    /** @type {{every: number}|null} */
    this._checkpointPolicy = checkpointPolicy || null;

    /** @type {boolean} */
    this._checkpointing = false;

    /** @type {boolean} */
    this._autoMaterialize = autoMaterialize;

    /** @type {LogicalTraversal} */
    this.traverse = new LogicalTraversal(this);

    /** @type {MaterializedGraph|null} */
    this._materializedGraph = null;

    /** @type {import('./utils/LRUCache.js').default|null} */
    this._adjacencyCache = adjacencyCacheSize > 0 ? new LRUCache(adjacencyCacheSize) : null;

    /** @type {Map<string, string>|null} */
    this._lastFrontier = null;

    /** @type {import('../ports/LoggerPort.js').default|null} */
    this._logger = logger || null;

    /** @type {import('../ports/ClockPort.js').default} */
    this._clock = clock || new PerformanceClockAdapter();

    /** @type {'reject'|'cascade'|'warn'} */
    this._onDeleteWithData = onDeleteWithData;

    /** @type {Array<{onChange: Function, onError?: Function}>} */
    this._subscribers = [];

    /** @type {import('./services/JoinReducer.js').WarpStateV5|null} */
    this._lastNotifiedState = null;

    /** @type {import('./services/ProvenanceIndex.js').ProvenanceIndex|null} */
    this._provenanceIndex = null;
  }

  /**
   * Logs a timing message for a completed or failed operation.
   * @param {string} op - Operation name (e.g. 'materialize')
   * @param {number} t0 - Start timestamp from this._clock.now()
   * @param {Object} [opts] - Options
   * @param {string} [opts.metrics] - Extra metrics string to append in parentheses
   * @param {Error} [opts.error] - If set, logs a failure message instead
   * @private
   */
  _logTiming(op, t0, { metrics, error } = {}) {
    if (!this._logger) {
      return;
    }
    const elapsed = Math.round(this._clock.now() - t0);
    if (error) {
      this._logger.info(`[warp] ${op} failed in ${elapsed}ms`, { error: error.message });
    } else {
      const suffix = metrics ? ` (${metrics})` : '';
      this._logger.info(`[warp] ${op} completed in ${elapsed}ms${suffix}`);
    }
  }

  /**
   * Opens a multi-writer graph.
   *
   * @param {Object} options
   * @param {import('../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   * @param {Object} [options.gcPolicy] - GC policy configuration (overrides defaults)
   * @param {number} [options.adjacencyCacheSize] - Max materialized adjacency cache entries
   * @param {{every: number}} [options.checkpointPolicy] - Auto-checkpoint policy; creates a checkpoint every N patches
   * @param {boolean} [options.autoMaterialize] - If true, query methods auto-materialize instead of throwing
   * @param {'reject'|'cascade'|'warn'} [options.onDeleteWithData] - Policy when deleting a node that still has edges or properties (default: 'warn')
   * @param {import('../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging
   * @param {import('../ports/ClockPort.js').default} [options.clock] - Clock for timing instrumentation (defaults to PerformanceClockAdapter)
   * @returns {Promise<WarpGraph>} The opened graph instance
   * @throws {Error} If graphName, writerId, checkpointPolicy, or onDeleteWithData is invalid
   *
   * @example
   * const graph = await WarpGraph.open({
   *   persistence: gitAdapter,
   *   graphName: 'events',
   *   writerId: 'node-1'
   * });
   */
  static async open({ persistence, graphName, writerId, gcPolicy = {}, adjacencyCacheSize, checkpointPolicy, autoMaterialize, onDeleteWithData, logger, clock }) {
    // Validate inputs
    validateGraphName(graphName);
    validateWriterId(writerId);

    if (!persistence) {
      throw new Error('persistence is required');
    }

    // Validate checkpointPolicy
    if (checkpointPolicy !== undefined && checkpointPolicy !== null) {
      if (typeof checkpointPolicy !== 'object' || checkpointPolicy === null) {
        throw new Error('checkpointPolicy must be an object with { every: number }');
      }
      if (!Number.isInteger(checkpointPolicy.every) || checkpointPolicy.every <= 0) {
        throw new Error('checkpointPolicy.every must be a positive integer');
      }
    }

    // Validate autoMaterialize
    if (autoMaterialize !== undefined && typeof autoMaterialize !== 'boolean') {
      throw new Error('autoMaterialize must be a boolean');
    }

    // Validate onDeleteWithData
    if (onDeleteWithData !== undefined) {
      const valid = ['reject', 'cascade', 'warn'];
      if (!valid.includes(onDeleteWithData)) {
        throw new Error(`onDeleteWithData must be one of: ${valid.join(', ')}`);
      }
    }

    const graph = new WarpGraph({ persistence, graphName, writerId, gcPolicy, adjacencyCacheSize, checkpointPolicy, autoMaterialize, onDeleteWithData, logger, clock });

    // Validate migration boundary
    await graph._validateMigrationBoundary();

    return graph;
  }

  /**
   * Gets the graph name.
   * @returns {string} The graph name
   */
  get graphName() {
    return this._graphName;
  }

  /**
   * Gets the writer ID.
   * @returns {string} The writer ID
   */
  get writerId() {
    return this._writerId;
  }

  /**
   * Gets the persistence adapter.
   * @returns {import('../ports/GraphPersistencePort.js').default} The persistence adapter
   */
  get persistence() {
    return this._persistence;
  }

  /**
   * Gets the onDeleteWithData policy.
   * @returns {'reject'|'cascade'|'warn'} The delete-with-data policy
   */
  get onDeleteWithData() {
    return this._onDeleteWithData;
  }

  /**
   * Creates a new PatchBuilder for building and committing patches.
   *
   * On successful commit, the internal `onCommitSuccess` callback receives
   * `{ patch, sha }` where `patch` is the committed patch object and `sha`
   * is the Git commit SHA. This updates the version vector and applies the
   * patch to cached state for eager re-materialization.
   *
   * @returns {Promise<PatchBuilderV2>} A fluent patch builder
   *
   * @example
   * const commitSha = await (await graph.createPatch())
   *   .addNode('user:alice')
   *   .setProperty('user:alice', 'name', 'Alice')
   *   .addEdge('user:alice', 'user:bob', 'follows')
   *   .commit();
   */
  async createPatch() {
    const { lamport, parentSha } = await this._nextLamport();
    return new PatchBuilderV2({
      persistence: this._persistence,
      graphName: this._graphName,
      writerId: this._writerId,
      lamport,
      versionVector: this._versionVector,
      getCurrentState: () => this._cachedState,
      expectedParentSha: parentSha,
      onDeleteWithData: this._onDeleteWithData,
      onCommitSuccess: (opts) => this._onPatchCommitted(this._writerId, opts),
    });
  }

  /**
   * Returns patches from a writer's ref chain.
   *
   * @param {string} writerId - The writer ID to load patches for
   * @param {string|null} [stopAtSha=null] - Stop walking when reaching this SHA (exclusive)
   * @returns {Promise<Array<{patch: import('./types/WarpTypes.js').PatchV1, sha: string}>>} Array of patches
   */
  async getWriterPatches(writerId, stopAtSha = null) {
    return await this._loadWriterPatches(writerId, stopAtSha);
  }

  /**
   * Gets the next lamport timestamp and current parent SHA for this writer.
   * Reads from the current ref chain to determine values.
   *
   * @returns {Promise<{lamport: number, parentSha: string|null}>} The next lamport and current parent
   * @private
   */
  async _nextLamport() {
    const writerRef = buildWriterRef(this._graphName, this._writerId);
    const currentRefSha = await this._persistence.readRef(writerRef);

    if (!currentRefSha) {
      // First commit for this writer
      return { lamport: 1, parentSha: null };
    }

    // Read the current patch commit to get its lamport timestamp
    const commitMessage = await this._persistence.showNode(currentRefSha);
    const kind = detectMessageKind(commitMessage);

    if (kind !== 'patch') {
      // Writer ref doesn't point to a patch commit - treat as first commit
      return { lamport: 1, parentSha: currentRefSha };
    }

    try {
      const patchInfo = decodePatchMessage(commitMessage);
      return { lamport: patchInfo.lamport + 1, parentSha: currentRefSha };
    } catch {
      // Malformed message - error with actionable message
      throw new Error(
        `Failed to parse lamport from writer ref ${writerRef}: ` +
        `commit ${currentRefSha} has invalid patch message format`
      );
    }
  }

  /**
   * Loads all patches from a writer's ref chain.
   *
   * Walks commits from the tip SHA back to the first patch commit,
   * collecting all patches along the way.
   *
   * @param {string} writerId - The writer ID to load patches for
   * @param {string|null} [stopAtSha=null] - Stop walking when reaching this SHA (exclusive)
   * @returns {Promise<Array<{patch: import('./types/WarpTypes.js').PatchV1, sha: string}>>} Array of patches
   * @private
   */
  async _loadWriterPatches(writerId, stopAtSha = null) {
    const writerRef = buildWriterRef(this._graphName, writerId);
    const tipSha = await this._persistence.readRef(writerRef);

    if (!tipSha) {
      return [];
    }

    const patches = [];
    let currentSha = tipSha;

    while (currentSha && currentSha !== stopAtSha) {
      // Get commit info and message
      const nodeInfo = await this._persistence.getNodeInfo(currentSha);
      const {message} = nodeInfo;

      // Check if this is a patch commit
      const kind = detectMessageKind(message);
      if (kind !== 'patch') {
        // Not a patch commit, stop walking
        break;
      }

      // Decode the patch message to get patchOid
      const patchMeta = decodePatchMessage(message);

      // Read the patch blob
      const patchBuffer = await this._persistence.readBlob(patchMeta.patchOid);
      const patch = decode(patchBuffer);

      patches.push({ patch, sha: currentSha });

      // Move to parent commit
      if (nodeInfo.parents && nodeInfo.parents.length > 0) {
        currentSha = nodeInfo.parents[0];
      } else {
        break;
      }
    }

    // Patches are collected in reverse order (newest first), reverse them
    return patches.reverse();
  }

  /**
   * Builds a deterministic adjacency map for the logical graph.
   * @param {import('./services/JoinReducer.js').WarpStateV5} state
   * @returns {{outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}}
   * @private
   */
  _buildAdjacency(state) {
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

    const sortNeighbors = (list) => {
      list.sort((a, b) => {
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
   * @param {import('./services/JoinReducer.js').WarpStateV5} state
   * @returns {MaterializedGraph}
   * @private
   */
  _setMaterializedState(state) {
    this._cachedState = state;
    this._stateDirty = false;
    this._versionVector = vvClone(state.observedFrontier);

    const stateHash = computeStateHashV5(state);
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
   * Callback invoked after a patch is successfully committed.
   *
   * Updates version vector, patch count, cached state (if clean),
   * provenance index, and frontier tracking.
   *
   * @param {string} writerId - The writer ID that committed the patch
   * @param {{patch?: Object, sha?: string}} [opts] - Commit details
   * @private
   */
  _onPatchCommitted(writerId, { patch, sha } = {}) {
    vvIncrement(this._versionVector, writerId);
    this._patchesSinceCheckpoint++;
    // Eager re-materialize: apply the just-committed patch to cached state
    // Only when the cache is clean — applying a patch to stale state would be incorrect
    if (this._cachedState && !this._stateDirty && patch && sha) {
      joinPatch(this._cachedState, patch, sha);
      this._setMaterializedState(this._cachedState);
      // Update provenance index with new patch
      if (this._provenanceIndex) {
        this._provenanceIndex.addPatch(sha, patch.reads, patch.writes);
      }
      // Keep _lastFrontier in sync so hasFrontierChanged() won't misreport stale
      if (this._lastFrontier) {
        this._lastFrontier.set(writerId, sha);
      }
    } else {
      this._stateDirty = true;
    }
  }

  /**
   * Materializes the graph and returns the materialized graph details.
   * @returns {Promise<MaterializedGraph>}
   * @private
   */
  async _materializeGraph() {
    const state = await this.materialize();
    if (!this._materializedGraph || this._materializedGraph.state !== state) {
      this._setMaterializedState(state);
    }
    return this._materializedGraph;
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
   * Side effects: Updates internal cached state, version vector, last frontier,
   * and patches-since-checkpoint counter. May trigger auto-checkpoint and GC
   * based on configured policies. Notifies subscribers if state changed.
   *
   * @param {{receipts?: boolean}} [options] - Optional configuration
   * @returns {Promise<import('./services/JoinReducer.js').WarpStateV5|{state: import('./services/JoinReducer.js').WarpStateV5, receipts: import('../types/TickReceipt.js').TickReceipt[]}>} The materialized graph state, or { state, receipts } when receipts enabled
   * @throws {Error} If checkpoint loading fails or patch decoding fails
   * @throws {Error} If writer ref access or patch blob reading fails
   */
  async materialize(options) {
    const t0 = this._clock.now();
    // ZERO-COST: only resolve receipts flag when options provided
    const collectReceipts = options && options.receipts;

    try {
      // Check for checkpoint
      const checkpoint = await this._loadLatestCheckpoint();

      let state;
      let receipts;
      let patchCount = 0;

      // If checkpoint exists, use incremental materialization
      if (checkpoint?.schema === 2 || checkpoint?.schema === 3) {
        const patches = await this._loadPatchesSince(checkpoint);
        if (collectReceipts) {
          const result = reduceV5(patches, checkpoint.state, { receipts: true });
          state = result.state;
          receipts = result.receipts;
        } else {
          state = reduceV5(patches, checkpoint.state);
        }
        patchCount = patches.length;

        // Build provenance index: start from checkpoint index if present, then add new patches
        this._provenanceIndex = checkpoint.provenanceIndex
          ? checkpoint.provenanceIndex.clone()
          : new ProvenanceIndex();
        for (const { patch, sha } of patches) {
          this._provenanceIndex.addPatch(sha, patch.reads, patch.writes);
        }
      } else {
        // 1. Discover all writers
        const writerIds = await this.discoverWriters();

        // 2. If no writers, return empty state
        if (writerIds.length === 0) {
          state = createEmptyStateV5();
          this._provenanceIndex = new ProvenanceIndex();
          if (collectReceipts) {
            receipts = [];
          }
        } else {
          // 3. For each writer, collect all patches
          const allPatches = [];
          for (const writerId of writerIds) {
            const writerPatches = await this._loadWriterPatches(writerId);
            allPatches.push(...writerPatches);
          }

          // 4. If no patches, return empty state
          if (allPatches.length === 0) {
            state = createEmptyStateV5();
            this._provenanceIndex = new ProvenanceIndex();
            if (collectReceipts) {
              receipts = [];
            }
          } else {
            // 5. Reduce all patches to state
            if (collectReceipts) {
              const result = reduceV5(allPatches, undefined, { receipts: true });
              state = result.state;
              receipts = result.receipts;
            } else {
              state = reduceV5(allPatches);
            }
            patchCount = allPatches.length;

            // Build provenance index from all patches
            this._provenanceIndex = new ProvenanceIndex();
            for (const { patch, sha } of allPatches) {
              this._provenanceIndex.addPatch(sha, patch.reads, patch.writes);
            }
          }
        }
      }

      this._setMaterializedState(state);
      this._lastFrontier = await this.getFrontier();
      this._patchesSinceCheckpoint = patchCount;

      // Auto-checkpoint if policy is set and threshold exceeded.
      // Guard prevents recursion: createCheckpoint() calls materialize() internally.
      if (this._checkpointPolicy && !this._checkpointing && patchCount >= this._checkpointPolicy.every) {
        try {
          await this.createCheckpoint();
          this._patchesSinceCheckpoint = 0;
        } catch {
          // Checkpoint failure does not break materialize — continue silently
        }
      }

      this._maybeRunGC(state);

      // Notify subscribers if state changed since last notification
      // Also handles deferred replay for subscribers added with replay: true before cached state
      if (this._subscribers.length > 0) {
        const hasPendingReplay = this._subscribers.some(s => s.pendingReplay);
        const diff = diffStates(this._lastNotifiedState, state);
        if (!isEmptyDiff(diff) || hasPendingReplay) {
          this._notifySubscribers(diff, state);
        }
      }
      // Clone state to prevent eager path mutations from affecting the baseline
      this._lastNotifiedState = cloneStateV5(state);

      this._logTiming('materialize', t0, { metrics: `${patchCount} patches` });

      if (collectReceipts) {
        return { state, receipts };
      }
      return state;
    } catch (err) {
      this._logTiming('materialize', t0, { error: err });
      throw err;
    }
  }

  /**
   * Joins (merges) another state into the current cached state.
   *
   * This method allows manual merging of two graph states using the
   * CRDT join semantics defined in JoinReducer. The merge is deterministic
   * and commutative - joining A with B produces the same result as B with A.
   *
   * @param {import('./services/JoinReducer.js').WarpStateV5} otherState - The state to merge in
   * @returns {{
   *   state: import('./services/JoinReducer.js').WarpStateV5,
   *   receipt: {
   *     nodesAdded: number,
   *     nodesRemoved: number,
   *     edgesAdded: number,
   *     edgesRemoved: number,
   *     propsChanged: number,
   *     frontierMerged: boolean
   *   }
   * }} The merged state and a receipt describing the merge
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   *
   * @example
   * const graph = await WarpGraph.open({ persistence, graphName, writerId });
   * await graph.materialize(); // Cache state first
   *
   * // Get state from another source (e.g., remote sync)
   * const remoteState = await fetchRemoteState();
   *
   * // Merge the states
   * const { state, receipt } = graph.join(remoteState);
   * console.log(`Merged: ${receipt.nodesAdded} nodes added, ${receipt.propsChanged} props changed`);
   */
  join(otherState) {
    if (!this._cachedState) {
      throw new QueryError('No cached state. Call materialize() first.', {
        code: 'E_NO_STATE',
      });
    }

    if (!otherState || !otherState.nodeAlive || !otherState.edgeAlive) {
      throw new Error('Invalid state: must be a valid WarpStateV5 object');
    }

    // Capture pre-merge counts for receipt
    const beforeNodes = this._cachedState.nodeAlive.elements.size;
    const beforeEdges = this._cachedState.edgeAlive.elements.size;
    const beforeFrontierSize = this._cachedState.observedFrontier.size;

    // Perform the join
    const mergedState = joinStates(this._cachedState, otherState);

    // Calculate receipt
    const afterNodes = mergedState.nodeAlive.elements.size;
    const afterEdges = mergedState.edgeAlive.elements.size;
    const afterFrontierSize = mergedState.observedFrontier.size;

    // Count property changes (keys that existed in both but have different values)
    let propsChanged = 0;
    for (const [key, reg] of mergedState.prop) {
      const oldReg = this._cachedState.prop.get(key);
      if (!oldReg || oldReg.value !== reg.value) {
        propsChanged++;
      }
    }

    const receipt = {
      nodesAdded: Math.max(0, afterNodes - beforeNodes),
      nodesRemoved: Math.max(0, beforeNodes - afterNodes),
      edgesAdded: Math.max(0, afterEdges - beforeEdges),
      edgesRemoved: Math.max(0, beforeEdges - afterEdges),
      propsChanged,
      frontierMerged: afterFrontierSize !== beforeFrontierSize ||
        !this._frontierEquals(this._cachedState.observedFrontier, mergedState.observedFrontier),
    };

    // Update cached state
    this._cachedState = mergedState;

    return { state: mergedState, receipt };
  }

  /**
   * Compares two version vectors for equality.
   * @param {import('./crdt/VersionVector.js').VersionVector} a
   * @param {import('./crdt/VersionVector.js').VersionVector} b
   * @returns {boolean}
   * @private
   */
  _frontierEquals(a, b) {
    if (a.size !== b.size) {
      return false;
    }
    for (const [key, val] of a) {
      if (b.get(key) !== val) {
        return false;
      }
    }
    return true;
  }

  /**
   * Materializes the graph state at a specific checkpoint.
   *
   * Loads the checkpoint state and frontier, discovers current writers,
   * builds the target frontier from current writer tips, and applies
   * incremental patches since the checkpoint.
   *
   * @param {string} checkpointSha - The checkpoint commit SHA
   * @returns {Promise<import('./services/JoinReducer.js').WarpStateV5>} The materialized graph state at the checkpoint
   * @throws {Error} If checkpoint SHA is invalid or not found
   * @throws {Error} If checkpoint loading or patch decoding fails
   *
   * @example
   * // Time-travel to a previous checkpoint
   * const oldState = await graph.materializeAt('abc123');
   * console.log('Nodes at checkpoint:', [...oldState.nodeAlive.elements.keys()]);
   */
  async materializeAt(checkpointSha) {
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
    const patchLoader = async (writerId, fromSha, toSha) => {
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
        const patch = decode(patchBuffer);

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
      persistence: this._persistence,
      graphName: this._graphName,
      checkpointSha,
      targetFrontier,
      patchLoader,
    });
    this._setMaterializedState(state);
    return state;
  }

  /**
   * Creates a new checkpoint of the current graph state.
   *
   * Materializes the current state, creates a checkpoint commit with
   * frontier information, and updates the checkpoint ref.
   *
   * @returns {Promise<string>} The checkpoint commit SHA
   * @throws {Error} If materialization fails
   * @throws {Error} If checkpoint commit creation fails
   * @throws {Error} If ref update fails
   */
  async createCheckpoint() {
    const t0 = this._clock.now();
    try {
      // 1. Discover all writers
      const writers = await this.discoverWriters();

      // 2. Build frontier (map of writerId → tip SHA)
      const frontier = createFrontier();
      const parents = [];

      for (const writerId of writers) {
        const writerRef = buildWriterRef(this._graphName, writerId);
        const sha = await this._persistence.readRef(writerRef);
        if (sha) {
          updateFrontier(frontier, writerId, sha);
          parents.push(sha);
        }
      }

      // 3. Materialize current state (reuse cached if fresh, guard against recursion)
      const prevCheckpointing = this._checkpointing;
      this._checkpointing = true;
      let state;
      try {
        state = (this._cachedState && !this._stateDirty)
          ? this._cachedState
          : await this.materialize();
      } finally {
        this._checkpointing = prevCheckpointing;
      }

      // 4. Call CheckpointService.create() with provenance index if available
      const checkpointSha = await createCheckpointCommit({
        persistence: this._persistence,
        graphName: this._graphName,
        state,
        frontier,
        parents,
        provenanceIndex: this._provenanceIndex,
      });

      // 5. Update checkpoint ref
      const checkpointRef = buildCheckpointRef(this._graphName);
      await this._persistence.updateRef(checkpointRef, checkpointSha);

      this._logTiming('createCheckpoint', t0);

      // 6. Return checkpoint SHA
      return checkpointSha;
    } catch (err) {
      this._logTiming('createCheckpoint', t0, { error: err });
      throw err;
    }
  }

  /**
   * Syncs coverage information across writers.
   *
   * Creates an octopus anchor commit with all writer tips as parents,
   * then updates the coverage ref to point to this anchor. The "octopus anchor"
   * is a merge commit that records which writer tips have been observed,
   * enabling efficient replication and consistency checks.
   *
   * @returns {Promise<void>}
   * @throws {Error} If ref access or commit creation fails
   */
  async syncCoverage() {
    // 1. Discover all writers
    const writers = await this.discoverWriters();

    // If no writers exist, do nothing
    if (writers.length === 0) {
      return;
    }

    // 2. Get tip SHA for each writer's ref
    const parents = [];
    for (const writerId of writers) {
      const writerRef = buildWriterRef(this._graphName, writerId);
      const sha = await this._persistence.readRef(writerRef);
      if (sha) {
        parents.push(sha);
      }
    }

    // If no refs have SHAs, do nothing
    if (parents.length === 0) {
      return;
    }

    // 3. Create octopus anchor commit with all tips as parents
    const message = encodeAnchorMessage({ graph: this._graphName });
    const anchorSha = await this._persistence.commitNode({ message, parents });

    // 4. Update coverage ref
    const coverageRef = buildCoverageRef(this._graphName);
    await this._persistence.updateRef(coverageRef, anchorSha);
  }

  /**
   * Discovers all writers that have contributed to this graph.
   *
   * Lists all refs under refs/warp/<graphName>/writers/ and
   * extracts writer IDs from the ref paths.
   *
   * @returns {Promise<string[]>} Sorted array of writer IDs
   * @throws {Error} If listing refs fails
   */
  async discoverWriters() {
    const prefix = buildWritersPrefix(this._graphName);
    const refs = await this._persistence.listRefs(prefix);

    const writerIds = [];
    for (const refPath of refs) {
      const writerId = parseWriterIdFromRef(refPath);
      if (writerId) {
        writerIds.push(writerId);
      }
    }

    return writerIds.sort();
  }

  // ============================================================================
  // Schema Migration Support
  // ============================================================================

  /**
   * Validates migration boundary for graphs.
   *
   * Graphs cannot be opened if there is schema:1 history without
   * a migration checkpoint. This ensures data consistency during migration.
   *
   * @returns {Promise<void>}
   * @throws {Error} If v1 history exists without migration checkpoint
   * @private
   */
  async _validateMigrationBoundary() {
    const checkpoint = await this._loadLatestCheckpoint();
    if (checkpoint?.schema === 2 || checkpoint?.schema === 3) {
      return;  // Already migrated
    }

    const hasSchema1History = await this._hasSchema1Patches();
    if (hasSchema1History) {
      throw new Error(
        'Cannot open graph with v1 history. ' +
        'Run MigrationService.migrate() first to create migration checkpoint.'
      );
    }
  }

  /**
   * Loads the latest checkpoint for this graph.
   *
   * @returns {Promise<{state: Object, frontier: Map, stateHash: string, schema: number}|null>} The checkpoint or null
   * @private
   */
  async _loadLatestCheckpoint() {
    const checkpointRef = buildCheckpointRef(this._graphName);
    const checkpointSha = await this._persistence.readRef(checkpointRef);

    if (!checkpointSha) {
      return null;
    }

    try {
      return await loadCheckpoint(this._persistence, checkpointSha);
    } catch {
      return null;
    }
  }

  /**
   * Checks if there are any schema:1 patches in the graph.
   *
   * @returns {Promise<boolean>} True if schema:1 patches exist
   * @private
   */
  async _hasSchema1Patches() {
    const writerIds = await this.discoverWriters();

    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(this._graphName, writerId);
      const tipSha = await this._persistence.readRef(writerRef);

      if (!tipSha) {
        continue;
      }

      // Check the first (most recent) patch from this writer
      const nodeInfo = await this._persistence.getNodeInfo(tipSha);
      const kind = detectMessageKind(nodeInfo.message);

      if (kind === 'patch') {
        const patchMeta = decodePatchMessage(nodeInfo.message);
        const patchBuffer = await this._persistence.readBlob(patchMeta.patchOid);
        const patch = decode(patchBuffer);

        // If any patch has schema:1, we have v1 history
        if (patch.schema === 1 || patch.schema === undefined) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Loads patches since a checkpoint for incremental materialization.
   *
   * @param {{state: Object, frontier: Map<string, string>, stateHash: string, schema: number}} checkpoint - The checkpoint to start from
   * @returns {Promise<Array<{patch: import('./types/WarpTypes.js').PatchV1, sha: string}>>} Patches since checkpoint
   * @private
   */
  async _loadPatchesSince(checkpoint) {
    const writerIds = await this.discoverWriters();
    const allPatches = [];

    for (const writerId of writerIds) {
      const checkpointSha = checkpoint.frontier?.get(writerId) || null;
      const patches = await this._loadWriterPatches(writerId, checkpointSha);

      // Validate each patch against checkpoint frontier
      for (const { sha } of patches) {
        await this._validatePatchAgainstCheckpoint(writerId, sha, checkpoint);
      }

      allPatches.push(...patches);
    }

    return allPatches;
  }

  // ============================================================================
  // Backfill Rejection and Divergence Detection
  // ============================================================================

  /**
   * Checks if ancestorSha is an ancestor of descendantSha.
   * Walks the commit graph (linear per-writer chain assumption).
   *
   * @param {string} ancestorSha - The potential ancestor commit SHA
   * @param {string} descendantSha - The potential descendant commit SHA
   * @returns {Promise<boolean>} True if ancestorSha is an ancestor of descendantSha
   * @private
   */
  async _isAncestor(ancestorSha, descendantSha) {
    if (!ancestorSha || !descendantSha) {
      return false;
    }
    if (ancestorSha === descendantSha) {
      return true;
    }

    let cur = descendantSha;
    while (cur) {
      const nodeInfo = await this._persistence.getNodeInfo(cur);
      const parent = nodeInfo.parents?.[0] ?? null;
      if (parent === ancestorSha) {
        return true;
      }
      cur = parent;
    }
    return false;
  }

  /**
   * Determines relationship between incoming patch and checkpoint head.
   *
   * @param {string} ckHead - The checkpoint head SHA for this writer
   * @param {string} incomingSha - The incoming patch commit SHA
   * @returns {Promise<'same' | 'ahead' | 'behind' | 'diverged'>} The relationship
   * @private
   */
  async _relationToCheckpointHead(ckHead, incomingSha) {
    if (incomingSha === ckHead) {
      return 'same';
    }
    if (await this._isAncestor(ckHead, incomingSha)) {
      return 'ahead';
    }
    if (await this._isAncestor(incomingSha, ckHead)) {
      return 'behind';
    }
    return 'diverged';
  }

  /**
   * Validates an incoming patch against checkpoint frontier.
   * Uses graph reachability, NOT lamport timestamps.
   *
   * @param {string} writerId - The writer ID for this patch
   * @param {string} incomingSha - The incoming patch commit SHA
   * @param {{state: Object, frontier: Map<string, string>, stateHash: string, schema: number}} checkpoint - The checkpoint to validate against
   * @returns {Promise<void>}
   * @throws {Error} If patch is behind/same as checkpoint frontier (backfill rejected)
   * @throws {Error} If patch does not extend checkpoint head (writer fork detected)
   * @private
   */
  async _validatePatchAgainstCheckpoint(writerId, incomingSha, checkpoint) {
    if (!checkpoint || (checkpoint.schema !== 2 && checkpoint.schema !== 3)) {
      return;
    }

    const ckHead = checkpoint.frontier?.get(writerId);
    if (!ckHead) {
      return;  // Checkpoint didn't include this writer
    }

    const relation = await this._relationToCheckpointHead(ckHead, incomingSha);

    if (relation === 'same' || relation === 'behind') {
      throw new Error(
        `Backfill rejected for writer ${writerId}: ` +
        `incoming patch is ${relation} checkpoint frontier`
      );
    }

    if (relation === 'diverged') {
      throw new Error(
        `Writer fork detected for ${writerId}: ` +
        `incoming patch does not extend checkpoint head`
      );
    }
    // relation === 'ahead' => OK
  }

  // ============================================================================
  // Garbage Collection
  // ============================================================================

  /**
   * Post-materialize GC check. Warn by default; execute only when enabled.
   * GC failure never breaks materialize.
   *
   * @param {import('./services/JoinReducer.js').WarpStateV5} state
   * @private
   */
  _maybeRunGC(state) {
    try {
      const metrics = collectGCMetrics(state);
      const inputMetrics = {
        ...metrics,
        patchesSinceCompaction: this._patchesSinceGC,
        timeSinceCompaction: Date.now() - this._lastGCTime,
      };
      const { shouldRun, reasons } = shouldRunGC(inputMetrics, this._gcPolicy);

      if (!shouldRun) {
        return;
      }

      if (this._gcPolicy.enabled) {
        const appliedVV = computeAppliedVV(state);
        const result = executeGC(state, appliedVV);
        this._lastGCTime = Date.now();
        this._patchesSinceGC = 0;
        if (this._logger) {
          this._logger.info('Auto-GC completed', { ...result, reasons });
        }
      } else if (this._logger) {
        this._logger.warn(
          'GC thresholds exceeded but auto-GC is disabled. Set gcPolicy: { enabled: true } to auto-compact.',
          { reasons },
        );
      }
    } catch {
      // GC failure never breaks materialize
    }
  }

  /**
   * Checks if GC should run based on current metrics and policy.
   * If thresholds are exceeded, runs GC on the cached state.
   *
   * **Requires a cached state.**
   *
   * @returns {{ran: boolean, result: Object|null, reasons: string[]}} GC result
   *
   * @example
   * await graph.materialize();
   * const { ran, result, reasons } = graph.maybeRunGC();
   * if (ran) {
   *   console.log(`GC ran: ${result.tombstonesRemoved} tombstones removed`);
   * }
   */
  maybeRunGC() {
    if (!this._cachedState) {
      return { ran: false, result: null, reasons: [] };
    }

    const metrics = collectGCMetrics(this._cachedState);
    metrics.patchesSinceCompaction = this._patchesSinceGC;
    metrics.lastCompactionTime = this._lastGCTime;

    const { shouldRun, reasons } = shouldRunGC(metrics, this._gcPolicy);

    if (!shouldRun) {
      return { ran: false, result: null, reasons: [] };
    }

    const result = this.runGC();
    return { ran: true, result, reasons };
  }

  /**
   * Explicitly runs GC on the cached state.
   * Compacts tombstoned dots that are covered by the appliedVV.
   *
   * **Requires a cached state.**
   *
   * @returns {{nodesCompacted: number, edgesCompacted: number, tombstonesRemoved: number, durationMs: number}}
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   *
   * @example
   * await graph.materialize();
   * const result = graph.runGC();
   * console.log(`Removed ${result.tombstonesRemoved} tombstones in ${result.durationMs}ms`);
   */
  runGC() {
    const t0 = this._clock.now();
    try {
      if (!this._cachedState) {
        throw new QueryError('No cached state. Call materialize() first.', {
          code: 'E_NO_STATE',
        });
      }

      // Compute appliedVV from current state
      const appliedVV = computeAppliedVV(this._cachedState);

      // Execute GC (mutates cached state)
      const result = executeGC(this._cachedState, appliedVV);

      // Update GC tracking
      this._lastGCTime = Date.now();
      this._patchesSinceGC = 0;

      this._logTiming('runGC', t0, { metrics: `${result.tombstonesRemoved} tombstones removed` });

      return result;
    } catch (err) {
      this._logTiming('runGC', t0, { error: err });
      throw err;
    }
  }

  /**
   * Gets current GC metrics for the cached state.
   *
   * @returns {{
   *   nodeCount: number,
   *   edgeCount: number,
   *   tombstoneCount: number,
   *   tombstoneRatio: number,
   *   patchesSinceCompaction: number,
   *   lastCompactionTime: number
   * }|null} GC metrics or null if no cached state
   */
  getGCMetrics() {
    if (!this._cachedState) {
      return null;
    }

    const metrics = collectGCMetrics(this._cachedState);
    metrics.patchesSinceCompaction = this._patchesSinceGC;
    metrics.lastCompactionTime = this._lastGCTime;
    return metrics;
  }

  /**
   * Gets the current GC policy.
   *
   * @returns {Object} The GC policy configuration
   */
  get gcPolicy() {
    return { ...this._gcPolicy };
  }

  // ============================================================================
  // Network Sync API
  // ============================================================================

  /**
   * Gets the current frontier for this graph.
   * The frontier maps each writer ID to their current tip SHA.
   *
   * @returns {Promise<Map<string, string>>} Map of writerId to tip SHA
   * @throws {Error} If listing refs fails
   */
  async getFrontier() {
    const writerIds = await this.discoverWriters();
    const frontier = createFrontier();

    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(this._graphName, writerId);
      const tipSha = await this._persistence.readRef(writerRef);
      if (tipSha) {
        updateFrontier(frontier, writerId, tipSha);
      }
    }

    return frontier;
  }

  /**
   * Checks whether any writer tip has changed since the last materialize.
   *
   * O(writers) comparison of stored writer tip SHAs against current refs.
   * Cheap "has anything changed?" check without materialization.
   *
   * @returns {Promise<boolean>} True if frontier has changed (or never materialized)
   * @throws {Error} If listing refs fails
   */
  async hasFrontierChanged() {
    if (this._lastFrontier === null) {
      return true;
    }

    const current = await this.getFrontier();

    if (current.size !== this._lastFrontier.size) {
      return true;
    }

    for (const [writerId, tipSha] of current) {
      if (this._lastFrontier.get(writerId) !== tipSha) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns a lightweight status snapshot of the graph's operational state.
   *
   * This method is O(writers) and does NOT trigger materialization.
   *
   * @returns {Promise<{
   *   cachedState: 'fresh' | 'stale' | 'none',
   *   patchesSinceCheckpoint: number,
   *   tombstoneRatio: number,
   *   writers: number,
   *   frontier: Record<string, string>,
   * }>} The graph status
   * @throws {Error} If listing refs fails
   */
  async status() {
    // Determine cachedState
    let cachedState;
    if (this._cachedState === null) {
      cachedState = 'none';
    } else if (this._stateDirty || await this.hasFrontierChanged()) {
      cachedState = 'stale';
    } else {
      cachedState = 'fresh';
    }

    // patchesSinceCheckpoint
    const patchesSinceCheckpoint = this._patchesSinceCheckpoint;

    // tombstoneRatio
    let tombstoneRatio = 0;
    if (this._cachedState) {
      const metrics = collectGCMetrics(this._cachedState);
      tombstoneRatio = metrics.tombstoneRatio;
    }

    // writers and frontier
    const frontier = await this.getFrontier();
    const writers = frontier.size;

    // Convert frontier Map to plain object
    const frontierObj = Object.fromEntries(frontier);

    return {
      cachedState,
      patchesSinceCheckpoint,
      tombstoneRatio,
      writers,
      frontier: frontierObj,
    };
  }

  /**
   * Subscribes to graph changes.
   *
   * The `onChange` handler is called after each `materialize()` that results in
   * state changes. The handler receives a diff object describing what changed.
   *
   * When `replay: true` is set and `_cachedState` is available, immediately
   * fires `onChange` with a diff from empty state to current state. If
   * `_cachedState` is null, replay is deferred until the first materialize.
   *
   * Errors thrown by handlers are caught and forwarded to `onError` if provided.
   * One handler's error does not prevent other handlers from being called.
   *
   * @param {Object} options - Subscription options
   * @param {(diff: import('./services/StateDiff.js').StateDiff) => void} options.onChange - Called with diff when graph changes
   * @param {(error: Error) => void} [options.onError] - Called if onChange throws an error
   * @param {boolean} [options.replay=false] - If true, immediately fires onChange with initial state diff
   * @returns {{unsubscribe: () => void}} Subscription handle
   * @throws {Error} If onChange is not a function
   *
   * @example
   * const { unsubscribe } = graph.subscribe({
   *   onChange: (diff) => {
   *     console.log('Nodes added:', diff.nodes.added);
   *     console.log('Nodes removed:', diff.nodes.removed);
   *   },
   *   onError: (err) => console.error('Handler error:', err),
   * });
   *
   * // Later, to stop receiving updates:
   * unsubscribe();
   *
   * @example
   * // With replay: get initial state immediately
   * await graph.materialize();
   * graph.subscribe({
   *   onChange: (diff) => console.log('Initial or changed:', diff),
   *   replay: true, // Immediately fires with current state as additions
   * });
   */
  subscribe({ onChange, onError, replay = false }) {
    if (typeof onChange !== 'function') {
      throw new Error('onChange must be a function');
    }

    const subscriber = { onChange, onError, pendingReplay: replay && !this._cachedState };
    this._subscribers.push(subscriber);

    // Immediate replay if requested and cached state is available
    if (replay && this._cachedState) {
      const diff = diffStates(null, this._cachedState);
      if (!isEmptyDiff(diff)) {
        try {
          onChange(diff);
        } catch (err) {
          if (onError) {
            try {
              onError(err);
            } catch {
              // onError itself threw — swallow to prevent cascade
            }
          }
        }
      }
    }

    return {
      unsubscribe: () => {
        const index = this._subscribers.indexOf(subscriber);
        if (index !== -1) {
          this._subscribers.splice(index, 1);
        }
      },
    };
  }

  /**
   * Watches for graph changes matching a pattern.
   *
   * Like `subscribe()`, but only fires for changes where node IDs match the
   * provided glob pattern. Uses the same pattern syntax as `query().match()`.
   *
   * - Nodes: filters `added` and `removed` to matching IDs
   * - Edges: filters to edges where `from` or `to` matches the pattern
   * - Props: filters to properties where `nodeId` matches the pattern
   *
   * If all changes are filtered out, the handler is not called.
   *
   * When `poll` is set, periodically checks `hasFrontierChanged()` and auto-materializes
   * if the frontier has changed (e.g., remote writes detected). The poll interval must
   * be at least 1000ms.
   *
   * @param {string} pattern - Glob pattern (e.g., 'user:*', 'order:123', '*')
   * @param {Object} options - Watch options
   * @param {(diff: import('./services/StateDiff.js').StateDiff) => void} options.onChange - Called with filtered diff when matching changes occur
   * @param {(error: Error) => void} [options.onError] - Called if onChange throws an error
   * @param {number} [options.poll] - Poll interval in ms (min 1000); checks frontier and auto-materializes
   * @returns {{unsubscribe: () => void}} Subscription handle
   * @throws {Error} If pattern is not a string
   * @throws {Error} If onChange is not a function
   * @throws {Error} If poll is provided but less than 1000
   *
   * @example
   * const { unsubscribe } = graph.watch('user:*', {
   *   onChange: (diff) => {
   *     // Only user node changes arrive here
   *     console.log('User nodes added:', diff.nodes.added);
   *   },
   * });
   *
   * @example
   * // With polling: checks every 5s for remote changes
   * const { unsubscribe } = graph.watch('user:*', {
   *   onChange: (diff) => console.log('User changed:', diff),
   *   poll: 5000,
   * });
   *
   * // Later, to stop receiving updates:
   * unsubscribe();
   */
  watch(pattern, { onChange, onError, poll }) {
    if (typeof pattern !== 'string') {
      throw new Error('pattern must be a string');
    }
    if (typeof onChange !== 'function') {
      throw new Error('onChange must be a function');
    }
    if (poll !== undefined) {
      if (typeof poll !== 'number' || poll < 1000) {
        throw new Error('poll must be a number >= 1000');
      }
    }

    // Pattern matching: same logic as QueryBuilder.match()
    // Pre-compile pattern matcher once for performance
    let matchesPattern;
    if (pattern === '*') {
      matchesPattern = () => true;
    } else if (pattern.includes('*')) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
      matchesPattern = (nodeId) => regex.test(nodeId);
    } else {
      matchesPattern = (nodeId) => nodeId === pattern;
    }

    // Filtered onChange that only passes matching changes
    const filteredOnChange = (diff) => {
      const filteredDiff = {
        nodes: {
          added: diff.nodes.added.filter(matchesPattern),
          removed: diff.nodes.removed.filter(matchesPattern),
        },
        edges: {
          added: diff.edges.added.filter(e => matchesPattern(e.from) || matchesPattern(e.to)),
          removed: diff.edges.removed.filter(e => matchesPattern(e.from) || matchesPattern(e.to)),
        },
        props: {
          set: diff.props.set.filter(p => matchesPattern(p.nodeId)),
          removed: diff.props.removed.filter(p => matchesPattern(p.nodeId)),
        },
      };

      // Only call handler if there are matching changes
      const hasChanges =
        filteredDiff.nodes.added.length > 0 ||
        filteredDiff.nodes.removed.length > 0 ||
        filteredDiff.edges.added.length > 0 ||
        filteredDiff.edges.removed.length > 0 ||
        filteredDiff.props.set.length > 0 ||
        filteredDiff.props.removed.length > 0;

      if (hasChanges) {
        onChange(filteredDiff);
      }
    };

    // Reuse subscription infrastructure
    const subscription = this.subscribe({ onChange: filteredOnChange, onError });

    // Polling: periodically check frontier and auto-materialize if changed
    let pollIntervalId = null;
    let pollInFlight = false;
    if (poll) {
      pollIntervalId = setInterval(async () => {
        if (pollInFlight) {
          return;
        }
        pollInFlight = true;
        try {
          const changed = await this.hasFrontierChanged();
          if (changed) {
            await this.materialize();
            // Subscription system will notify via filteredOnChange
          }
        } catch (err) {
          if (onError) {
            try {
              onError(err);
            } catch {
              // onError itself threw — swallow to prevent cascade
            }
          }
        } finally {
          pollInFlight = false;
        }
      }, poll);
    }

    return {
      unsubscribe: () => {
        if (pollIntervalId !== null) {
          clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
        subscription.unsubscribe();
      },
    };
  }

  /**
   * Notifies all subscribers of state changes.
   * Handles deferred replay for subscribers added with `replay: true` before
   * cached state was available.
   * @param {import('./services/StateDiff.js').StateDiffResult} diff
   * @param {import('./services/JoinReducer.js').WarpStateV5} currentState - The current state for deferred replay
   * @private
   */
  _notifySubscribers(diff, currentState) {
    for (const subscriber of this._subscribers) {
      try {
        // Handle deferred replay: on first notification, send full state diff instead
        if (subscriber.pendingReplay) {
          subscriber.pendingReplay = false;
          const replayDiff = diffStates(null, currentState);
          if (!isEmptyDiff(replayDiff)) {
            subscriber.onChange(replayDiff);
          }
        } else {
          // Skip non-replay subscribers when diff is empty
          if (isEmptyDiff(diff)) {
            continue;
          }
          subscriber.onChange(diff);
        }
      } catch (err) {
        if (subscriber.onError) {
          try {
            subscriber.onError(err);
          } catch {
            // onError itself threw — swallow to prevent cascade
          }
        }
      }
    }
  }

  /**
   * Creates a sync request to send to a remote peer.
   * The request contains the local frontier for comparison.
   *
   * @returns {Promise<{type: 'sync-request', frontier: Map<string, string>}>} The sync request
   * @throws {Error} If listing refs fails
   *
   * @example
   * const request = await graph.createSyncRequest();
   * // Send request to remote peer...
   */
  async createSyncRequest() {
    const frontier = await this.getFrontier();
    return createSyncRequest(frontier);
  }

  /**
   * Processes an incoming sync request and returns patches the requester needs.
   *
   * @param {{type: 'sync-request', frontier: Map<string, string>}} request - The incoming sync request
   * @returns {Promise<{type: 'sync-response', frontier: Map, patches: Map}>} The sync response
   * @throws {Error} If listing refs or reading patches fails
   *
   * @example
   * // Receive request from remote peer
   * const response = await graph.processSyncRequest(request);
   * // Send response back to requester...
   */
  async processSyncRequest(request) {
    const localFrontier = await this.getFrontier();
    return await processSyncRequest(
      request,
      localFrontier,
      this._persistence,
      this._graphName
    );
  }

  /**
   * Applies a sync response to the local graph state.
   * Updates the cached state with received patches.
   *
   * **Requires a cached state.**
   *
   * @param {{type: 'sync-response', frontier: Map, patches: Map}} response - The sync response
   * @returns {{state: Object, frontier: Map, applied: number}} Result with updated state
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   *
   * @example
   * await graph.materialize(); // Cache state first
   * const result = graph.applySyncResponse(response);
   * console.log(`Applied ${result.applied} patches from remote`);
   */
  applySyncResponse(response) {
    if (!this._cachedState) {
      throw new QueryError('No cached state. Call materialize() first.', {
        code: 'E_NO_STATE',
      });
    }

    const currentFrontier = this._cachedState.observedFrontier;
    const result = applySyncResponse(response, this._cachedState, currentFrontier);

    // Update cached state
    this._cachedState = result.state;

    // Keep _lastFrontier in sync so hasFrontierChanged() won't misreport stale.
    // Merge the response's per-writer tips into the stored frontier snapshot.
    if (this._lastFrontier && Array.isArray(response.patches)) {
      for (const { writerId, sha } of response.patches) {
        if (writerId && sha) {
          this._lastFrontier.set(writerId, sha);
        }
      }
    }

    // Track patches for GC
    this._patchesSinceGC += result.applied;

    return result;
  }

  /**
   * Checks if sync is needed with a remote frontier.
   *
   * @param {Map<string, string>} remoteFrontier - The remote peer's frontier
   * @returns {Promise<boolean>} True if sync would transfer any patches
   * @throws {Error} If listing refs fails
   */
  async syncNeeded(remoteFrontier) {
    const localFrontier = await this.getFrontier();
    return syncNeeded(localFrontier, remoteFrontier);
  }

  /**
   * Syncs with a remote peer (HTTP or direct graph instance).
   *
   * @param {string|WarpGraph} remote - URL or peer graph instance
   * @param {Object} [options]
   * @param {string} [options.path='/sync'] - Sync path (HTTP mode)
   * @param {number} [options.retries=3] - Retry count for retryable failures
   * @param {number} [options.baseDelayMs=250] - Base backoff delay
   * @param {number} [options.maxDelayMs=2000] - Max backoff delay
   * @param {number} [options.timeoutMs=10000] - Request timeout (HTTP mode)
   * @param {AbortSignal} [options.signal] - Optional abort signal to cancel sync
   * @param {(event: {type: string, attempt: number, durationMs?: number, status?: number, error?: Error}) => void} [options.onStatus]
   * @param {boolean} [options.materialize=false] - If true, auto-materialize after sync and include state in result
   * @returns {Promise<{applied: number, attempts: number, state?: import('./services/JoinReducer.js').WarpStateV5}>}
   * @throws {SyncError} If remote URL is invalid (code: `E_SYNC_REMOTE_URL`)
   * @throws {SyncError} If remote returns error or invalid response (code: `E_SYNC_REMOTE`, `E_SYNC_PROTOCOL`)
   * @throws {SyncError} If request times out (code: `E_SYNC_TIMEOUT`)
   * @throws {OperationAbortedError} If abort signal fires
   */
  async syncWith(remote, options = {}) {
    const t0 = this._clock.now();
    const {
      path = '/sync',
      retries = DEFAULT_SYNC_WITH_RETRIES,
      baseDelayMs = DEFAULT_SYNC_WITH_BASE_DELAY_MS,
      maxDelayMs = DEFAULT_SYNC_WITH_MAX_DELAY_MS,
      timeoutMs = DEFAULT_SYNC_WITH_TIMEOUT_MS,
      signal,
      onStatus,
      materialize: materializeAfterSync = false,
    } = options;

    const hasPathOverride = Object.prototype.hasOwnProperty.call(options, 'path');
    const isDirectPeer = remote && typeof remote === 'object' &&
      typeof remote.processSyncRequest === 'function';
    let targetUrl = null;
    if (!isDirectPeer) {
      try {
        targetUrl = remote instanceof URL ? new URL(remote.toString()) : new URL(remote);
      } catch {
        throw new SyncError('Invalid remote URL', {
          code: 'E_SYNC_REMOTE_URL',
        context: { remote },
        });
      }

      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        throw new SyncError('Unsupported remote URL protocol', {
          code: 'E_SYNC_REMOTE_URL',
          context: { protocol: targetUrl.protocol },
        });
      }

      const normalizedPath = normalizeSyncPath(path);
      if (!targetUrl.pathname || targetUrl.pathname === '/') {
        targetUrl.pathname = normalizedPath;
      } else if (hasPathOverride) {
        targetUrl.pathname = normalizedPath;
      }
      targetUrl.hash = '';
    }

    let attempt = 0;
    const emit = (type, payload = {}) => {
      if (typeof onStatus === 'function') {
        onStatus({ type, attempt, ...payload });
      }
    };

    const shouldRetry = (err) => {
      if (isDirectPeer) { return false; }
      if (err instanceof SyncError) {
        return ['E_SYNC_REMOTE', 'E_SYNC_TIMEOUT', 'E_SYNC_NETWORK'].includes(err.code);
      }
      return err instanceof TimeoutError;
    };

    const executeAttempt = async () => {
      checkAborted(signal, 'syncWith');
      attempt += 1;
      const attemptStart = Date.now();
      emit('connecting');

      const request = await this.createSyncRequest();
      emit('requestBuilt');

      let response;
      if (isDirectPeer) {
        emit('requestSent');
        response = await remote.processSyncRequest(request);
        emit('responseReceived');
      } else {
        emit('requestSent');
        let res;
        try {
          res = await timeout(timeoutMs, (timeoutSignal) => {
            const combinedSignal = signal
              ? AbortSignal.any([timeoutSignal, signal])
              : timeoutSignal;
            return fetch(targetUrl.toString(), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'accept': 'application/json',
              },
              body: JSON.stringify(request),
              signal: combinedSignal,
            });
          });
        } catch (err) {
          if (err?.name === 'AbortError') {
            throw new OperationAbortedError('syncWith', { reason: 'Signal received' });
          }
          if (err instanceof TimeoutError) {
            throw new SyncError('Sync request timed out', {
              code: 'E_SYNC_TIMEOUT',
              context: { timeoutMs },
            });
          }
          throw new SyncError('Network error', {
            code: 'E_SYNC_NETWORK',
            context: { message: err?.message },
          });
        }

        emit('responseReceived', { status: res.status });

        if (res.status >= 500) {
          throw new SyncError(`Remote error: ${res.status}`, {
            code: 'E_SYNC_REMOTE',
            context: { status: res.status },
          });
        }

        if (res.status >= 400) {
          throw new SyncError(`Protocol error: ${res.status}`, {
            code: 'E_SYNC_PROTOCOL',
            context: { status: res.status },
          });
        }

        try {
          response = await res.json();
        } catch {
          throw new SyncError('Invalid JSON response', {
            code: 'E_SYNC_PROTOCOL',
            context: { status: res.status },
          });
        }
      }

      if (!this._cachedState) {
        await this.materialize();
        emit('materialized');
      }

      if (!response || typeof response !== 'object' ||
        response.type !== 'sync-response' ||
        !response.frontier || typeof response.frontier !== 'object' || Array.isArray(response.frontier) ||
        !Array.isArray(response.patches)) {
        throw new SyncError('Invalid sync response', {
          code: 'E_SYNC_PROTOCOL',
        });
      }

      const result = this.applySyncResponse(response);
      emit('applied', { applied: result.applied });

      const durationMs = Date.now() - attemptStart;
      emit('complete', { durationMs, applied: result.applied });
      return { applied: result.applied, attempts: attempt };
    };

    try {
      const syncResult = await retry(executeAttempt, {
        retries,
        delay: baseDelayMs,
        maxDelay: maxDelayMs,
        backoff: 'exponential',
        jitter: 'decorrelated',
        signal,
        shouldRetry,
        onRetry: (error, attemptNumber, delayMs) => {
          if (typeof onStatus === 'function') {
            onStatus({ type: 'retrying', attempt: attemptNumber, delayMs, error });
          }
        },
      });

      this._logTiming('syncWith', t0, { metrics: `${syncResult.applied} patches applied` });

      if (materializeAfterSync) {
        if (!this._cachedState) { await this.materialize(); }
        return { ...syncResult, state: this._cachedState };
      }
      return syncResult;
    } catch (err) {
      this._logTiming('syncWith', t0, { error: err });
      if (err?.name === 'AbortError') {
        const abortedError = new OperationAbortedError('syncWith', { reason: 'Signal received' });
        if (typeof onStatus === 'function') {
          onStatus({ type: 'failed', attempt, error: abortedError });
        }
        throw abortedError;
      }
      if (err instanceof RetryExhaustedError) {
        const cause = err.cause || err;
        if (typeof onStatus === 'function') {
          onStatus({ type: 'failed', attempt: err.attempts, error: cause });
        }
        throw cause;
      }
      if (typeof onStatus === 'function') {
        onStatus({ type: 'failed', attempt, error: err });
      }
      throw err;
    }
  }

  /**
   * Starts a built-in sync server for this graph.
   *
   * @param {Object} options
   * @param {number} options.port - Port to listen on
   * @param {string} [options.host='127.0.0.1'] - Host to bind
   * @param {string} [options.path='/sync'] - Path to handle sync requests
   * @param {number} [options.maxRequestBytes=4194304] - Max request size in bytes
   * @returns {Promise<{close: () => Promise<void>, url: string}>} Server handle
   * @throws {Error} If port is not a number
   */
  async serve({ port, host = '127.0.0.1', path = '/sync', maxRequestBytes = DEFAULT_SYNC_SERVER_MAX_BYTES } = {}) {
    if (typeof port !== 'number') {
      throw new Error('serve() requires a numeric port');
    }

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const { createServer } = await import('node:http');

    const server = createServer((req, res) => {
      const contentType = (req.headers['content-type'] || '').toLowerCase();
      if (contentType && !contentType.startsWith('application/json')) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(canonicalStringify({ error: 'Expected application/json' }));
        return;
      }

      let requestUrl;
      try {
        requestUrl = new URL(req.url || '/', `http://${req.headers.host || host}`);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(canonicalStringify({ error: 'Invalid URL' }));
        return;
      }

      if (requestUrl.pathname !== normalizedPath) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(canonicalStringify({ error: 'Not Found' }));
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' });
        res.end(canonicalStringify({ error: 'Method Not Allowed' }));
        return;
      }

      let total = 0;
      let body = '';
      let aborted = false;

      req.on('data', (chunk) => {
        if (aborted) {
          return;
        }
        total += chunk.length;
        if (total > maxRequestBytes) {
          aborted = true;
          res.writeHead(413, { 'content-type': 'application/json' });
          res.end(canonicalStringify({ error: 'Request too large' }));
          req.destroy();
          return;
        }
        body += chunk.toString('utf-8');
      });

      req.on('end', async () => {
        if (aborted) {
          return;
        }
        let request;
        try {
          request = body ? JSON.parse(body) : null;
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(canonicalStringify({ error: 'Invalid JSON' }));
          return;
        }

        if (!request || typeof request !== 'object' || request.type !== 'sync-request' ||
          !request.frontier || typeof request.frontier !== 'object' || Array.isArray(request.frontier)) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(canonicalStringify({ error: 'Invalid sync request' }));
          return;
        }

        try {
          const response = await this.processSyncRequest(request);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(canonicalStringify(response));
        } catch (err) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(canonicalStringify({ error: err?.message || 'Sync failed' }));
        }
      });
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });

    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const url = `http://${host}:${actualPort}${normalizedPath}`;

    return {
      url,
      close: () => new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }),
    };
  }

  // ============================================================================
  // Writer Factory Methods
  // ============================================================================

  /**
   * Gets or creates a Writer for this graph.
   *
   * If an explicit writerId is provided, it is validated and used directly.
   * Otherwise, the writerId is resolved from git config using the key
   * `warp.writerId.<graphName>`. If no config exists, a new canonical ID
   * is generated and persisted.
   *
   * @param {string} [writerId] - Optional explicit writer ID. If not provided, resolves stable ID from git config.
   * @returns {Promise<Writer>} A Writer instance
   * @throws {Error} If writerId is invalid
   *
   * @example
   * // Use explicit writer ID
   * const writer = await graph.writer('alice');
   *
   * @example
   * // Resolve from git config (or generate new)
   * const writer = await graph.writer();
   */
  async writer(writerId) {
    // Build config adapters for resolveWriterId
    const configGet = async (key) => await this._persistence.configGet(key);
    const configSet = async (key, value) => await this._persistence.configSet(key, value);

    // Resolve the writer ID
    const resolvedWriterId = await resolveWriterId({
      graphName: this._graphName,
      explicitWriterId: writerId,
      configGet,
      configSet,
    });

    return new Writer({
      persistence: this._persistence,
      graphName: this._graphName,
      writerId: resolvedWriterId,
      versionVector: this._versionVector,
      getCurrentState: () => this._cachedState,
      onDeleteWithData: this._onDeleteWithData,
      onCommitSuccess: (opts) => this._onPatchCommitted(resolvedWriterId, opts),
    });
  }

  /**
   * Creates a new Writer with a fresh canonical ID.
   *
   * This always generates a new unique writer ID, regardless of any
   * existing configuration. Use this when you need a guaranteed fresh
   * identity (e.g., spawning a new writer process).
   *
   * @deprecated Use `writer()` to resolve a stable ID from git config, or `writer(id)` with an explicit ID.
   * @param {Object} [opts]
   * @param {'config'|'none'} [opts.persist='none'] - Whether to persist the new ID to git config
   * @param {string} [opts.alias] - Optional alias for config key (used with persist:'config')
   * @returns {Promise<Writer>} A Writer instance with new canonical ID
   * @throws {Error} If config operations fail (when persist:'config')
   *
   * @example
   * // Create ephemeral writer (not persisted)
   * const writer = await graph.createWriter();
   *
   * @example
   * // Create and persist to git config
   * const writer = await graph.createWriter({ persist: 'config' });
   */
  async createWriter(opts = {}) {
    if (this._logger) {
      this._logger.warn('[warp] createWriter() is deprecated. Use writer() or writer(id) instead.');
    }
    // eslint-disable-next-line no-console
    console.warn('[warp] createWriter() is deprecated. Use writer() or writer(id) instead.');

    const { persist = 'none', alias } = opts;

    // Generate new canonical writerId
    const freshWriterId = generateWriterId();

    // Optionally persist to git config
    if (persist === 'config') {
      const configKey = alias
        ? `warp.writerId.${alias}`
        : `warp.writerId.${this._graphName}`;
      await this._persistence.configSet(configKey, freshWriterId);
    }

    return new Writer({
      persistence: this._persistence,
      graphName: this._graphName,
      writerId: freshWriterId,
      versionVector: this._versionVector,
      getCurrentState: () => this._cachedState,
      onDeleteWithData: this._onDeleteWithData,
      onCommitSuccess: (commitOpts) => this._onPatchCommitted(freshWriterId, commitOpts),
    });
  }

  // ============================================================================
  // Auto-Materialize Guard
  // ============================================================================

  /**
   * Ensures cached state is fresh. When autoMaterialize is enabled,
   * materializes if state is null or dirty. Otherwise throws.
   *
   * @returns {Promise<void>}
   * @throws {QueryError} If no cached state and autoMaterialize is off (code: `E_NO_STATE`)
   * @throws {QueryError} If cached state is dirty and autoMaterialize is off (code: `E_STALE_STATE`)
   * @private
   */
  async _ensureFreshState() {
    if (this._autoMaterialize && (!this._cachedState || this._stateDirty)) {
      await this.materialize();
      return;
    }
    if (!this._cachedState) {
      throw new QueryError(
        'No cached state. Call materialize() to load initial state, or pass autoMaterialize: true to WarpGraph.open().',
        { code: 'E_NO_STATE' },
      );
    }
    if (this._stateDirty) {
      throw new QueryError(
        'Cached state is stale. Call materialize() to refresh, or enable autoMaterialize.',
        { code: 'E_STALE_STATE' },
      );
    }
  }

  // ============================================================================
  // Query API (Task 7) - Queries on Materialized WARP State
  // ============================================================================

  /**
   * Creates a fluent query builder for the logical graph.
   *
   * The query builder provides a chainable API for querying nodes, filtering
   * by patterns and properties, traversing edges, and selecting results.
   *
   * **Requires a cached state.** Call materialize() first if not already cached,
   * or use autoMaterialize option when opening the graph.
   *
   * @returns {import('./services/QueryBuilder.js').default} A fluent query builder
   *
   * @example
   * await graph.materialize();
   * const users = await graph.query()
   *   .match('user:*')
   *   .where('active', true)
   *   .outgoing('follows')
   *   .select('*');
   */
  query() {
    return new QueryBuilder(this);
  }

  /**
   * Checks if a node exists in the materialized graph state.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @param {string} nodeId - The node ID to check
   * @returns {Promise<boolean>} True if the node exists in the materialized state
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   * @throws {QueryError} If cached state is dirty (code: `E_STALE_STATE`)
   *
   * @example
   * await graph.materialize();
   * if (await graph.hasNode('user:alice')) {
   *   console.log('Alice exists in the graph');
   * }
   */
  async hasNode(nodeId) {
    await this._ensureFreshState();
    return orsetContains(this._cachedState.nodeAlive, nodeId);
  }

  /**
   * Gets all properties for a node from the materialized state.
   *
   * Returns properties as a Map of key → value. Only returns properties
   * for nodes that exist in the materialized state.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @param {string} nodeId - The node ID to get properties for
   * @returns {Promise<Map<string, *>|null>} Map of property key → value, or null if node doesn't exist
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   * @throws {QueryError} If cached state is dirty (code: `E_STALE_STATE`)
   *
   * @example
   * await graph.materialize();
   * const props = await graph.getNodeProps('user:alice');
   * if (props) {
   *   console.log('Name:', props.get('name'));
   * }
   */
  async getNodeProps(nodeId) {
    await this._ensureFreshState();

    // Check if node exists
    if (!orsetContains(this._cachedState.nodeAlive, nodeId)) {
      return null;
    }

    // Collect all properties for this node
    const props = new Map();
    for (const [propKey, register] of this._cachedState.prop) {
      const decoded = decodePropKey(propKey);
      if (decoded.nodeId === nodeId) {
        props.set(decoded.propKey, register.value);
      }
    }

    return props;
  }

  /**
   * Gets all properties for an edge from the materialized state.
   *
   * Returns properties as a plain object of key → value. Only returns
   * properties for edges that exist in the materialized state.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label
   * @returns {Promise<Record<string, *>|null>} Object of property key → value, or null if edge doesn't exist
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   * @throws {QueryError} If cached state is dirty (code: `E_STALE_STATE`)
   *
   * @example
   * await graph.materialize();
   * const props = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
   * if (props) {
   *   console.log('Weight:', props.weight);
   * }
   */
  async getEdgeProps(from, to, label) {
    await this._ensureFreshState();

    // Check if edge exists
    const edgeKey = encodeEdgeKey(from, to, label);
    if (!orsetContains(this._cachedState.edgeAlive, edgeKey)) {
      return null;
    }

    // Check node liveness for both endpoints
    if (!orsetContains(this._cachedState.nodeAlive, from) ||
        !orsetContains(this._cachedState.nodeAlive, to)) {
      return null;
    }

    // Determine the birth EventId for clean-slate filtering
    const birthEvent = this._cachedState.edgeBirthEvent?.get(edgeKey);

    // Collect all properties for this edge, filtering out stale props
    // (props set before the edge's most recent re-add)
    const props = {};
    for (const [propKey, register] of this._cachedState.prop) {
      if (!isEdgePropKey(propKey)) {
        continue;
      }
      const decoded = decodeEdgePropKey(propKey);
      if (decoded.from === from && decoded.to === to && decoded.label === label) {
        if (birthEvent && register.eventId && compareEventIds(register.eventId, birthEvent) < 0) {
          continue; // stale prop from before the edge's current incarnation
        }
        props[decoded.propKey] = register.value;
      }
    }

    return props;
  }

  /**
   * Gets neighbors of a node from the materialized state.
   *
   * Returns node IDs connected to the given node by edges in the specified direction.
   * Direction 'outgoing' returns nodes where the given node is the edge source.
   * Direction 'incoming' returns nodes where the given node is the edge target.
   * Direction 'both' returns all connected nodes.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @param {string} nodeId - The node ID to get neighbors for
   * @param {'outgoing' | 'incoming' | 'both'} [direction='both'] - Edge direction to follow
   * @param {string} [edgeLabel] - Optional edge label filter
   * @returns {Promise<Array<{nodeId: string, label: string, direction: 'outgoing' | 'incoming'}>>} Array of neighbor info
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   * @throws {QueryError} If cached state is dirty (code: `E_STALE_STATE`)
   *
   * @example
   * await graph.materialize();
   * // Get all outgoing neighbors
   * const outgoing = await graph.neighbors('user:alice', 'outgoing');
   * // Get neighbors connected by 'follows' edges
   * const follows = await graph.neighbors('user:alice', 'outgoing', 'follows');
   */
  async neighbors(nodeId, direction = 'both', edgeLabel = undefined) {
    await this._ensureFreshState();

    const neighbors = [];

    // Iterate over all visible edges
    for (const edgeKey of orsetElements(this._cachedState.edgeAlive)) {
      const { from, to, label } = decodeEdgeKey(edgeKey);

      // Filter by label if specified
      if (edgeLabel !== undefined && label !== edgeLabel) {
        continue;
      }

      // Check edge direction and collect neighbors
      if ((direction === 'outgoing' || direction === 'both') && from === nodeId) {
        // Ensure target node is visible
        if (orsetContains(this._cachedState.nodeAlive, to)) {
          neighbors.push({ nodeId: to, label, direction: 'outgoing' });
        }
      }

      if ((direction === 'incoming' || direction === 'both') && to === nodeId) {
        // Ensure source node is visible
        if (orsetContains(this._cachedState.nodeAlive, from)) {
          neighbors.push({ nodeId: from, label, direction: 'incoming' });
        }
      }
    }

    return neighbors;
  }

  /**
   * Gets all visible nodes in the materialized state.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @returns {Promise<string[]>} Array of node IDs
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   * @throws {QueryError} If cached state is dirty (code: `E_STALE_STATE`)
   *
   * @example
   * await graph.materialize();
   * for (const nodeId of await graph.getNodes()) {
   *   console.log(nodeId);
   * }
   */
  async getNodes() {
    await this._ensureFreshState();
    return [...orsetElements(this._cachedState.nodeAlive)];
  }

  /**
   * Gets all visible edges in the materialized state.
   *
   * Each edge includes a `props` object containing any edge properties
   * from the materialized state.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @returns {Promise<Array<{from: string, to: string, label: string, props: Record<string, *>}>>} Array of edge info
   * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
   * @throws {QueryError} If cached state is dirty (code: `E_STALE_STATE`)
   *
   * @example
   * await graph.materialize();
   * for (const edge of await graph.getEdges()) {
   *   console.log(`${edge.from} --${edge.label}--> ${edge.to}`, edge.props);
   * }
   */
  async getEdges() {
    await this._ensureFreshState();

    // Pre-collect edge props into a lookup: "from\0to\0label" → {propKey: value}
    // Filters out stale props using full EventId ordering via compareEventIds
    // against the edge's birth EventId (clean-slate semantics on re-add)
    const edgePropsByKey = new Map();
    for (const [propKey, register] of this._cachedState.prop) {
      if (!isEdgePropKey(propKey)) {
        continue;
      }
      const decoded = decodeEdgePropKey(propKey);
      const ek = encodeEdgeKey(decoded.from, decoded.to, decoded.label);

      // Clean-slate filter: skip props from before the edge's current incarnation
      const birthEvent = this._cachedState.edgeBirthEvent?.get(ek);
      if (birthEvent && register.eventId && compareEventIds(register.eventId, birthEvent) < 0) {
        continue;
      }

      let bag = edgePropsByKey.get(ek);
      if (!bag) {
        bag = {};
        edgePropsByKey.set(ek, bag);
      }
      bag[decoded.propKey] = register.value;
    }

    const edges = [];
    for (const edgeKey of orsetElements(this._cachedState.edgeAlive)) {
      const { from, to, label } = decodeEdgeKey(edgeKey);
      // Only include edges where both endpoints are visible
      if (orsetContains(this._cachedState.nodeAlive, from) &&
          orsetContains(this._cachedState.nodeAlive, to)) {
        const props = edgePropsByKey.get(edgeKey) || {};
        edges.push({ from, to, label, props });
      }
    }
    return edges;
  }

  // ============================================================================
  // Fork API (HOLOGRAM)
  // ============================================================================

  /**
   * Creates a fork of this graph at a specific point in a writer's history.
   *
   * A fork creates a new WarpGraph instance that shares history up to the
   * specified patch SHA. Due to Git's content-addressed storage, the shared
   * history is automatically deduplicated. The fork gets a new writer ID and
   * operates independently from the original graph.
   *
   * **Key Properties:**
   * - Fork materializes the same state as the original at the fork point
   * - Writes to the fork don't appear in the original
   * - Writes to the original after fork don't appear in the fork
   * - History up to the fork point is shared (content-addressed dedup)
   *
   * @param {Object} options - Fork configuration
   * @param {string} options.from - Writer ID whose chain to fork from
   * @param {string} options.at - Patch SHA to fork at (must be in the writer's chain)
   * @param {string} [options.forkName] - Name for the forked graph. Defaults to `<graphName>-fork-<timestamp>`
   * @param {string} [options.forkWriterId] - Writer ID for the fork. Defaults to a new canonical ID.
   * @returns {Promise<WarpGraph>} A new WarpGraph instance for the fork
   * @throws {ForkError} If `from` writer does not exist (code: `E_FORK_WRITER_NOT_FOUND`)
   * @throws {ForkError} If `at` SHA does not exist (code: `E_FORK_PATCH_NOT_FOUND`)
   * @throws {ForkError} If `at` SHA is not in the writer's chain (code: `E_FORK_PATCH_NOT_IN_CHAIN`)
   * @throws {ForkError} If fork graph name is invalid (code: `E_FORK_NAME_INVALID`)
   * @throws {ForkError} If a graph with the fork name already has refs (code: `E_FORK_ALREADY_EXISTS`)
   *
   * @example
   * // Fork from alice's chain at a specific commit
   * const fork = await graph.fork({
   *   from: 'alice',
   *   at: 'abc123def456',
   * });
   *
   * // Fork materializes same state as original at that point
   * const originalState = await graph.materializeAt('abc123def456');
   * const forkState = await fork.materialize();
   * // originalState and forkState are equivalent
   *
   * @example
   * // Fork with custom name and writer ID
   * const fork = await graph.fork({
   *   from: 'alice',
   *   at: 'abc123def456',
   *   forkName: 'events-experiment',
   *   forkWriterId: 'experiment-writer',
   * });
   */
  async fork({ from, at, forkName, forkWriterId }) {
    const t0 = this._clock.now();

    try {
      // Validate required parameters
      if (!from || typeof from !== 'string') {
        throw new ForkError("Required parameter 'from' is missing or not a string", {
          code: 'E_FORK_INVALID_ARGS',
          context: { from },
        });
      }

      if (!at || typeof at !== 'string') {
        throw new ForkError("Required parameter 'at' is missing or not a string", {
          code: 'E_FORK_INVALID_ARGS',
          context: { at },
        });
      }

      // 1. Validate that the `from` writer exists
      const writers = await this.discoverWriters();
      if (!writers.includes(from)) {
        throw new ForkError(`Writer '${from}' does not exist in graph '${this._graphName}'`, {
          code: 'E_FORK_WRITER_NOT_FOUND',
          context: { writerId: from, graphName: this._graphName, existingWriters: writers },
        });
      }

      // 2. Validate that `at` SHA exists in the repository
      const nodeExists = await this._persistence.nodeExists(at);
      if (!nodeExists) {
        throw new ForkError(`Patch SHA '${at}' does not exist`, {
          code: 'E_FORK_PATCH_NOT_FOUND',
          context: { patchSha: at, writerId: from },
        });
      }

      // 3. Validate that `at` SHA is in the writer's chain
      const writerRef = buildWriterRef(this._graphName, from);
      const tipSha = await this._persistence.readRef(writerRef);

      if (!tipSha) {
        throw new ForkError(`Writer '${from}' has no commits`, {
          code: 'E_FORK_WRITER_NOT_FOUND',
          context: { writerId: from },
        });
      }

      // Walk the chain to verify `at` is reachable from the tip
      const isInChain = await this._isAncestor(at, tipSha);
      if (!isInChain) {
        throw new ForkError(`Patch SHA '${at}' is not in writer '${from}' chain`, {
          code: 'E_FORK_PATCH_NOT_IN_CHAIN',
          context: { patchSha: at, writerId: from, tipSha },
        });
      }

      // 4. Generate or validate fork name (add random suffix to prevent collisions)
      const resolvedForkName =
        forkName ?? `${this._graphName}-fork-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        validateGraphName(resolvedForkName);
      } catch (err) {
        throw new ForkError(`Invalid fork name: ${err.message}`, {
          code: 'E_FORK_NAME_INVALID',
          context: { forkName: resolvedForkName, originalError: err.message },
        });
      }

      // 5. Check that the fork graph doesn't already exist (has any refs)
      const forkWritersPrefix = buildWritersPrefix(resolvedForkName);
      const existingForkRefs = await this._persistence.listRefs(forkWritersPrefix);
      if (existingForkRefs.length > 0) {
        throw new ForkError(`Graph '${resolvedForkName}' already exists`, {
          code: 'E_FORK_ALREADY_EXISTS',
          context: { forkName: resolvedForkName, existingRefs: existingForkRefs },
        });
      }

      // 6. Generate or validate fork writer ID
      const resolvedForkWriterId = forkWriterId || generateWriterId();
      try {
        validateWriterId(resolvedForkWriterId);
      } catch (err) {
        throw new ForkError(`Invalid fork writer ID: ${err.message}`, {
          code: 'E_FORK_WRITER_ID_INVALID',
          context: { forkWriterId: resolvedForkWriterId, originalError: err.message },
        });
      }

      // 7. Create the fork's writer ref pointing to the `at` commit
      const forkWriterRef = buildWriterRef(resolvedForkName, resolvedForkWriterId);
      await this._persistence.updateRef(forkWriterRef, at);

      // 8. Open and return a new WarpGraph instance for the fork
      const forkGraph = await WarpGraph.open({
        persistence: this._persistence,
        graphName: resolvedForkName,
        writerId: resolvedForkWriterId,
        gcPolicy: this._gcPolicy,
        adjacencyCacheSize: this._adjacencyCache?.maxSize ?? DEFAULT_ADJACENCY_CACHE_SIZE,
        checkpointPolicy: this._checkpointPolicy,
        autoMaterialize: this._autoMaterialize,
        onDeleteWithData: this._onDeleteWithData,
        logger: this._logger,
        clock: this._clock,
      });

      this._logTiming('fork', t0, {
        metrics: `from=${from} at=${at.slice(0, 7)} name=${resolvedForkName}`,
      });

      return forkGraph;
    } catch (err) {
      this._logTiming('fork', t0, { error: err });
      throw err;
    }
  }

  // ============================================================================
  // Wormhole API (HOLOGRAM)
  // ============================================================================

  /**
   * Creates a wormhole compressing a range of patches.
   *
   * A wormhole is a compressed representation of a contiguous range of patches
   * from a single writer. It preserves provenance by storing the original
   * patches as a ProvenancePayload that can be replayed during materialization.
   *
   * **Key Properties:**
   * - **Provenance Preservation**: The wormhole contains the full sub-payload,
   *   allowing exact replay of the compressed segment.
   * - **Monoid Composition**: Two consecutive wormholes can be composed by
   *   concatenating their sub-payloads (use `WormholeService.composeWormholes`).
   * - **Materialization Equivalence**: A wormhole + remaining patches produces
   *   the same state as materializing all patches.
   *
   * @param {string} fromSha - SHA of the first (oldest) patch commit in the range
   * @param {string} toSha - SHA of the last (newest) patch commit in the range
   * @returns {Promise<{fromSha: string, toSha: string, writerId: string, payload: import('./services/ProvenancePayload.js').default, patchCount: number}>} The created wormhole edge
   * @throws {WormholeError} If fromSha or toSha doesn't exist (E_WORMHOLE_SHA_NOT_FOUND)
   * @throws {WormholeError} If fromSha is not an ancestor of toSha (E_WORMHOLE_INVALID_RANGE)
   * @throws {WormholeError} If commits span multiple writers (E_WORMHOLE_MULTI_WRITER)
   * @throws {WormholeError} If a commit is not a patch commit (E_WORMHOLE_NOT_PATCH)
   *
   * @example
   * // Compress a range of patches into a wormhole
   * const wormhole = await graph.createWormhole('abc123...', 'def456...');
   * console.log(`Compressed ${wormhole.patchCount} patches`);
   *
   * // The wormhole payload can be replayed to get the same state
   * const state = wormhole.payload.replay();
   *
   * @example
   * // Compress first 50 patches, then materialize with remaining
   * const patches = await graph.getWriterPatches('alice');
   * const wormhole = await graph.createWormhole(patches[0].sha, patches[49].sha);
   *
   * // Replay wormhole then remaining patches produces same state
   * const wormholeState = wormhole.payload.replay();
   * const remainingPayload = new ProvenancePayload(patches.slice(50));
   * const finalState = remainingPayload.replay(wormholeState);
   */
  async createWormhole(fromSha, toSha) {
    const t0 = this._clock.now();

    try {
      const wormhole = await createWormholeImpl({
        persistence: this._persistence,
        graphName: this._graphName,
        fromSha,
        toSha,
      });

      this._logTiming('createWormhole', t0, {
        metrics: `${wormhole.patchCount} patches from=${fromSha.slice(0, 7)} to=${toSha.slice(0, 7)}`,
      });

      return wormhole;
    } catch (err) {
      this._logTiming('createWormhole', t0, { error: err });
      throw err;
    }
  }

  // ============================================================================
  // Provenance Index API (HG/IO/2)
  // ============================================================================

  /**
   * Returns all patch SHAs that affected a given node or edge.
   *
   * "Affected" means the patch either read from or wrote to the entity
   * (based on the patch's I/O declarations from HG/IO/1).
   *
   * If `autoMaterialize` is enabled, this will automatically materialize
   * the state if dirty. Otherwise, call `materialize()` first.
   *
   * @param {string} entityId - The node ID or edge key to query
   * @returns {Promise<string[]>} Array of patch SHAs that affected the entity, sorted alphabetically
   * @throws {QueryError} If no cached state exists and autoMaterialize is off (code: `E_NO_STATE`)
   *
   * @example
   * const shas = await graph.patchesFor('user:alice');
   * console.log(`Node user:alice was affected by ${shas.length} patches:`, shas);
   *
   * @example
   * // Query which patches affected an edge
   * const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
   * const edgeShas = await graph.patchesFor(edgeKey);
   */
  async patchesFor(entityId) {
    await this._ensureFreshState();

    if (!this._provenanceIndex) {
      throw new QueryError('No provenance index. Call materialize() first.', {
        code: 'E_NO_STATE',
      });
    }
    return this._provenanceIndex.patchesFor(entityId);
  }

  // ============================================================================
  // Slice Materialization (HG/SLICE/1)
  // ============================================================================

  /**
   * Materializes only the backward causal cone for a specific node.
   *
   * This implements the slicing theorem from Paper III (Computational Holography):
   * Given a target node v, compute its backward causal cone D(v) - the set of
   * all patches that contributed to v's current state - and replay only those.
   *
   * The algorithm:
   * 1. Start with patches that directly wrote to the target node
   * 2. For each patch in the cone, find patches it depends on (via reads)
   * 3. Recursively gather all dependencies
   * 4. Topologically sort by Lamport timestamp (causal order)
   * 5. Replay the sorted patches against empty state
   *
   * **Requires a cached state.** Call materialize() first to build the provenance index.
   *
   * @param {string} nodeId - The target node ID to materialize the cone for
   * @param {{receipts?: boolean}} [options] - Optional configuration
   * @returns {Promise<{state: import('./services/JoinReducer.js').WarpStateV5, patchCount: number, receipts?: import('../types/TickReceipt.js').TickReceipt[]}>}
   *   Returns the sliced state with the patch count (for comparison with full materialization)
   * @throws {QueryError} If no provenance index exists (code: `E_NO_STATE`)
   * @throws {Error} If patch loading fails
   *
   * @example
   * await graph.materialize();
   *
   * // Materialize only the causal cone for a specific node
   * const slice = await graph.materializeSlice('user:alice');
   * console.log(`Slice required ${slice.patchCount} patches`);
   *
   * // The sliced state contains only the target node and its dependencies
   * const props = slice.state.prop;
   *
   * @example
   * // Compare with full materialization
   * const fullState = await graph.materialize();
   * const slice = await graph.materializeSlice('node:target');
   *
   * // Slice should have fewer patches (unless the entire graph is connected)
   * console.log(`Full: all patches, Slice: ${slice.patchCount} patches`);
   */
  async materializeSlice(nodeId, options) {
    const t0 = this._clock.now();
    const collectReceipts = options && options.receipts;

    try {
      // Ensure fresh state before accessing provenance index
      await this._ensureFreshState();

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
        const result = reduceV5(sortedPatches, undefined, { receipts: true });
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
      this._logTiming('materializeSlice', t0, { error: err });
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
   * Returns a Map of SHA → patch to avoid double-loading (the cone
   * computation needs to read patches for their read-dependencies,
   * so we cache them for later replay).
   *
   * @param {string} nodeId - The target node ID
   * @returns {Promise<Map<string, Object>>} Map of patch SHA to loaded patch object
   * @private
   */
  async _computeBackwardCone(nodeId) {
    const cone = new Map(); // sha → patch (cache loaded patches)
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
      const patchShas = this._provenanceIndex.patchesFor(entityId);

      for (const sha of patchShas) {
        if (cone.has(sha)) {
          continue;
        }

        // Load the patch and cache it
        const patch = await this._loadPatchBySha(sha);
        cone.set(sha, patch);

        // Add read dependencies to the queue
        if (patch && patch.reads) {
          for (const readEntity of patch.reads) {
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
   * @param {string} sha - The patch commit SHA
   * @returns {Promise<Object>} The decoded patch object
   * @throws {Error} If the commit is not a patch or loading fails
   * @private
   */
  async _loadPatchBySha(sha) {
    const nodeInfo = await this._persistence.getNodeInfo(sha);
    const kind = detectMessageKind(nodeInfo.message);

    if (kind !== 'patch') {
      throw new Error(`Commit ${sha} is not a patch`);
    }

    const patchMeta = decodePatchMessage(nodeInfo.message);
    const patchBuffer = await this._persistence.readBlob(patchMeta.patchOid);
    return decode(patchBuffer);
  }

  /**
   * Loads multiple patches by their SHAs.
   *
   * @param {string[]} shas - Array of patch commit SHAs
   * @returns {Promise<Array<{patch: Object, sha: string}>>} Array of patch entries
   * @throws {Error} If any SHA is not a patch or loading fails
   * @private
   */
  async _loadPatchesBySha(shas) {
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
   * @param {Array<{patch: Object, sha: string}>} patches - Unsorted patch entries
   * @returns {Array<{patch: Object, sha: string}>} Sorted patch entries
   * @private
   */
  _sortPatchesCausally(patches) {
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

  /**
   * Gets the current provenance index for this graph.
   *
   * The provenance index maps node/edge IDs to the patch SHAs that affected them.
   * It is built during materialization from the patches' I/O declarations.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @returns {import('./services/ProvenanceIndex.js').ProvenanceIndex|null} The provenance index, or null if not materialized
   *
   * @example
   * await graph.materialize();
   * const index = graph.provenanceIndex;
   * if (index) {
   *   console.log(`Index contains ${index.size} entities`);
   * }
   */
  get provenanceIndex() {
    return this._provenanceIndex;
  }
}
