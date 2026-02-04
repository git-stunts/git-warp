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
import { reduceV5, createEmptyStateV5, joinStates, join as joinPatch, decodeEdgeKey, decodePropKey, isEdgePropKey, decodeEdgePropKey, encodeEdgeKey } from './services/JoinReducer.js';
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
import { checkAborted } from './utils/cancellation.js';
import OperationAbortedError from './errors/OperationAbortedError.js';
import { compareEventIds } from './utils/EventId.js';

const DEFAULT_SYNC_SERVER_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_SYNC_WITH_RETRIES = 3;
const DEFAULT_SYNC_WITH_BASE_DELAY_MS = 250;
const DEFAULT_SYNC_WITH_MAX_DELAY_MS = 2000;
const DEFAULT_SYNC_WITH_TIMEOUT_MS = 10_000;

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

function canonicalStringify(value) {
  return JSON.stringify(canonicalizeJson(value));
}

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
   * @param {import('../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging
   */
  constructor({ persistence, graphName, writerId, gcPolicy = {}, adjacencyCacheSize = DEFAULT_ADJACENCY_CACHE_SIZE, checkpointPolicy, autoMaterialize = false, logger }) {
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
   * @param {import('../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging
   * @returns {Promise<WarpGraph>} The opened graph instance
   * @throws {Error} If graphName, writerId, or checkpointPolicy is invalid
   *
   * @example
   * const graph = await WarpGraph.open({
   *   persistence: gitAdapter,
   *   graphName: 'events',
   *   writerId: 'node-1'
   * });
   */
  static async open({ persistence, graphName, writerId, gcPolicy = {}, adjacencyCacheSize, checkpointPolicy, autoMaterialize, logger }) {
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

    const graph = new WarpGraph({ persistence, graphName, writerId, gcPolicy, adjacencyCacheSize, checkpointPolicy, autoMaterialize, logger });

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
      onCommitSuccess: ({ patch, sha } = {}) => {
        vvIncrement(this._versionVector, this._writerId);
        this._patchesSinceCheckpoint++;
        // Eager re-materialize: apply the just-committed patch to cached state
        // Only when the cache is clean — applying a patch to stale state would be incorrect
        if (this._cachedState && !this._stateDirty && patch && sha) {
          joinPatch(this._cachedState, patch, sha);
          this._setMaterializedState(this._cachedState);
        } else {
          this._stateDirty = true;
        }
      },
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
   * @returns {Promise<import('./services/JoinReducer.js').WarpStateV5>} The materialized graph state
   */
  async materialize() {
    // Check for checkpoint
    const checkpoint = await this._loadLatestCheckpoint();

    let state;
    let patchCount = 0;

    // If checkpoint exists, use incremental materialization
    if (checkpoint?.schema === 2 || checkpoint?.schema === 3) {
      const patches = await this._loadPatchesSince(checkpoint);
      state = reduceV5(patches, checkpoint.state);
      patchCount = patches.length;
    } else {
      // 1. Discover all writers
      const writerIds = await this.discoverWriters();

      // 2. If no writers, return empty state
      if (writerIds.length === 0) {
        state = createEmptyStateV5();
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
        } else {
          // 5. Reduce all patches to state
          state = reduceV5(allPatches);
          patchCount = allPatches.length;
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

    return state;
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
   */
  async createCheckpoint() {
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

    // 4. Call CheckpointService.create()
    const checkpointSha = await createCheckpointCommit({
      persistence: this._persistence,
      graphName: this._graphName,
      state,
      frontier,
      parents,
    });

    // 5. Update checkpoint ref
    const checkpointRef = buildCheckpointRef(this._graphName);
    await this._persistence.updateRef(checkpointRef, checkpointSha);

    // 6. Return checkpoint SHA
    return checkpointSha;
  }

  /**
   * Syncs coverage information across writers.
   *
   * Creates an octopus anchor commit with all writer tips as parents,
   * then updates the coverage ref to point to this anchor.
   *
   * @returns {Promise<void>}
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
   * Lists all refs under refs/empty-graph/<graphName>/writers/ and
   * extracts writer IDs from the ref paths.
   *
   * @returns {Promise<string[]>} Sorted array of writer IDs
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

    return result;
  }

  /**
   * Gets current GC metrics for the cached state.
   *
   * @returns {Object|null} GC metrics or null if no cached state
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
   * The frontier maps each writer to their current tip SHA.
   *
   * @returns {Promise<Map<string, string>>} The current frontier
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
   * Creates a sync request to send to a remote peer.
   * The request contains the local frontier for comparison.
   *
   * @returns {Promise<{type: 'sync-request', frontier: Map<string, string>}>} The sync request
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

    // Track patches for GC
    this._patchesSinceGC += result.applied;

    return result;
  }

  /**
   * Checks if sync is needed with a remote frontier.
   *
   * @param {Map<string, string>} remoteFrontier - The remote peer's frontier
   * @returns {Promise<boolean>} True if sync would transfer any patches
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
   * @returns {Promise<{applied: number, attempts: number}>}
   * @throws {SyncError} If remote URL is invalid (code: `E_SYNC_REMOTE_URL`)
   * @throws {SyncError} If remote returns error or invalid response (code: `E_SYNC_REMOTE`, `E_SYNC_PROTOCOL`)
   * @throws {SyncError} If request times out (code: `E_SYNC_TIMEOUT`)
   * @throws {OperationAbortedError} If abort signal fires
   */
  async syncWith(remote, options = {}) {
    const {
      path = '/sync',
      retries = DEFAULT_SYNC_WITH_RETRIES,
      baseDelayMs = DEFAULT_SYNC_WITH_BASE_DELAY_MS,
      maxDelayMs = DEFAULT_SYNC_WITH_MAX_DELAY_MS,
      timeoutMs = DEFAULT_SYNC_WITH_TIMEOUT_MS,
      signal,
      onStatus,
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
      if (isDirectPeer) {
        return false;
      }
      if (err instanceof SyncError) {
        return ['E_SYNC_REMOTE', 'E_SYNC_TIMEOUT', 'E_SYNC_NETWORK'].includes(err.code);
      }
      if (err instanceof TimeoutError) {
        return true;
      }
      return false;
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
      return await retry(executeAttempt, {
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
    } catch (err) {
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
      onCommitSuccess: ({ patch, sha } = {}) => {
        vvIncrement(this._versionVector, resolvedWriterId);
        this._patchesSinceCheckpoint++;
        if (this._cachedState && !this._stateDirty && patch && sha) {
          joinPatch(this._cachedState, patch, sha);
          this._setMaterializedState(this._cachedState);
        } else {
          this._stateDirty = true;
        }
      },
    });
  }

  /**
   * Creates a new Writer with a fresh canonical ID.
   *
   * This always generates a new unique writer ID, regardless of any
   * existing configuration. Use this when you need a guaranteed fresh
   * identity (e.g., spawning a new writer process).
   *
   * @param {Object} [opts]
   * @param {'config'|'none'} [opts.persist='none'] - Whether to persist the new ID to git config
   * @param {string} [opts.alias] - Optional alias for config key (used with persist:'config')
   * @returns {Promise<Writer>} A Writer instance with new canonical ID
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
      onCommitSuccess: ({ patch, sha } = {}) => {
        vvIncrement(this._versionVector, freshWriterId);
        this._patchesSinceCheckpoint++;
        if (this._cachedState && !this._stateDirty && patch && sha) {
          joinPatch(this._cachedState, patch, sha);
          this._setMaterializedState(this._cachedState);
        } else {
          this._stateDirty = true;
        }
      },
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
      throw new QueryError('No cached state. Call materialize() first.', {
        code: 'E_NO_STATE',
      });
    }
    if (this._stateDirty) {
      throw new QueryError('Cached state is dirty. Call materialize() to refresh.', {
        code: 'E_STALE_STATE',
      });
    }
  }

  // ============================================================================
  // Query API (Task 7) - Queries on Materialized WARP State
  // ============================================================================

  /**
   * Creates a fluent query builder for the logical graph.
   *
   * @returns {import('./services/QueryBuilder.js').default}
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
}
