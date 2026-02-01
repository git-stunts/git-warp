/**
 * MultiWriterGraph - Main API class for WARP multi-writer graph database.
 *
 * Provides a factory for opening multi-writer graphs and methods for
 * creating patches, materializing state, and managing checkpoints.
 *
 * @module domain/MultiWriterGraph
 * @see WARP Spec Section 11
 */

import { validateGraphName, validateWriterId, buildWriterRef, buildCoverageRef, buildCheckpointRef, buildWritersPrefix, parseWriterIdFromRef } from './utils/RefLayout.js';
import PatchBuilder from './services/PatchBuilder.js';
import { PatchBuilderV2 } from './services/PatchBuilderV2.js';
import { reduce, createEmptyState } from './services/Reducer.js';
import { reduceV5, createEmptyStateV5, joinStates, cloneStateV5 } from './services/JoinReducer.js';
import { decode } from '../infrastructure/codecs/CborCodec.js';
import { decodePatchMessage, detectMessageKind, encodeAnchorMessage } from './services/WarpMessageCodec.js';
import { loadCheckpoint, materializeIncremental, create as createCheckpointCommit } from './services/CheckpointService.js';
import { createFrontier, updateFrontier } from './services/Frontier.js';
import { createVersionVector, vvClone } from './crdt/VersionVector.js';
import { DEFAULT_GC_POLICY, shouldRunGC, executeGC } from './services/GCPolicy.js';
import { collectGCMetrics } from './services/GCMetrics.js';
import { computeAppliedVV } from './services/CheckpointSerializerV5.js';
import {
  createSyncRequest,
  processSyncRequest,
  applySyncResponse,
  syncNeeded,
} from './services/SyncProtocol.js';

/**
 * MultiWriterGraph class for interacting with a WARP multi-writer graph.
 */
export default class MultiWriterGraph {
  /**
   * @private
   * @param {Object} options
   * @param {import('../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   * @param {number} [options.schema=1] - Schema version (1 for v4, 2 for v5)
   * @param {Object} [options.gcPolicy] - GC policy configuration (overrides defaults)
   */
  constructor({ persistence, graphName, writerId, schema = 1, gcPolicy = {} }) {
    /** @type {number} */
    this._schema = schema;

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

    /** @type {Object} */
    this._gcPolicy = { ...DEFAULT_GC_POLICY, ...gcPolicy };

    /** @type {number} */
    this._lastGCTime = 0;

    /** @type {number} */
    this._patchesSinceGC = 0;
  }

  /**
   * Opens a multi-writer graph.
   *
   * @param {Object} options
   * @param {import('../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   * @param {number} [options.schema=1] - Schema version (1 for v4, 2 for v5)
   * @param {Object} [options.gcPolicy] - GC policy configuration (overrides defaults)
   * @returns {Promise<MultiWriterGraph>} The opened graph instance
   * @throws {Error} If graphName or writerId is invalid
   *
   * @example
   * const graph = await MultiWriterGraph.open({
   *   persistence: gitAdapter,
   *   graphName: 'events',
   *   writerId: 'node-1'
   * });
   */
  static async open({ persistence, graphName, writerId, schema = 1, gcPolicy = {} }) {
    // Validate inputs
    validateGraphName(graphName);
    validateWriterId(writerId);

    if (!persistence) {
      throw new Error('persistence is required');
    }

    const graph = new MultiWriterGraph({ persistence, graphName, writerId, schema, gcPolicy });

    // Validate migration boundary for schema:2
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
   * @returns {PatchBuilder|PatchBuilderV2} A fluent patch builder
   *
   * @example
   * const commitSha = await graph.createPatch()
   *   .addNode('user:alice')
   *   .setProperty('user:alice', 'name', 'Alice')
   *   .addEdge('user:alice', 'user:bob', 'follows')
   *   .commit();
   */
  createPatch() {
    if (this._schema === 2) {
      return new PatchBuilderV2({
        writerId: this._writerId,
        lamport: this._nextLamport(),
        versionVector: this._versionVector,
        getCurrentState: () => this._cachedState,
      });
    }
    return new PatchBuilder({
      persistence: this._persistence,
      graphName: this._graphName,
      writerId: this._writerId,
    });
  }

  /**
   * Gets the next lamport timestamp for this writer.
   * Reads from the current ref chain to determine the next value.
   *
   * @returns {number} The next lamport timestamp
   * @private
   */
  _nextLamport() {
    // For now, return 1; proper implementation would read from current ref
    // The commit() method in PatchBuilder handles this properly
    return 1;
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
      const message = nodeInfo.message;

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
   * Materializes the current graph state.
   *
   * Discovers all writers, collects all patches from each writer's ref chain,
   * and reduces them to produce the current state.
   *
   * For schema:2, checks if a checkpoint exists and uses the appropriate reducer.
   *
   * @returns {Promise<import('./services/Reducer.js').WarpState|import('./services/JoinReducer.js').WarpStateV5>} The materialized graph state
   */
  async materialize() {
    // Check for checkpoint and schema
    const checkpoint = await this._loadLatestCheckpoint();

    // If checkpoint is schema:2, use v5 reducer
    if (checkpoint?.schema === 2) {
      const patches = await this._loadPatchesSince(checkpoint);
      const state = reduceV5(patches, checkpoint.state);
      this._cachedState = state;
      return state;
    }

    // 1. Discover all writers
    const writerIds = await this.discoverWriters();

    // 2. If no writers, return empty state (schema-aware)
    if (writerIds.length === 0) {
      if (this._schema === 2) {
        const emptyState = createEmptyStateV5();
        this._cachedState = emptyState;
        return emptyState;
      }
      return createEmptyState();
    }

    // 3. For each writer, collect all patches
    const allPatches = [];
    for (const writerId of writerIds) {
      const writerPatches = await this._loadWriterPatches(writerId);
      allPatches.push(...writerPatches);
    }

    // 4. If no patches, return empty state
    if (allPatches.length === 0) {
      if (this._schema === 2) {
        const emptyState = createEmptyStateV5();
        this._cachedState = emptyState;
        return emptyState;
      }
      return createEmptyState();
    }

    // 5. Reduce all patches to state using appropriate reducer
    if (this._schema === 2) {
      const state = reduceV5(allPatches);
      this._cachedState = state;
      return state;
    }

    return reduce(allPatches);
  }

  /**
   * Joins (merges) another state into the current cached state.
   *
   * This method allows manual merging of two graph states using the
   * CRDT join semantics defined in JoinReducer. The merge is deterministic
   * and commutative - joining A with B produces the same result as B with A.
   *
   * **Requires schema:2 (WARP v5)**
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
   * @throws {Error} If schema is not 2 or if no cached state exists
   *
   * @example
   * const graph = await MultiWriterGraph.open({ persistence, graphName, writerId, schema: 2 });
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
    if (this._schema !== 2) {
      throw new Error('join() requires schema:2 (WARP v5)');
    }

    if (!this._cachedState) {
      throw new Error('No cached state. Call materialize() first.');
    }

    if (!otherState || !otherState.nodeAlive || !otherState.edgeAlive) {
      throw new Error('Invalid state: must be a valid WarpStateV5 object');
    }

    // Capture pre-merge counts for receipt
    const beforeNodes = this._cachedState.nodeAlive.elements.size;
    const beforeEdges = this._cachedState.edgeAlive.elements.size;
    const beforeProps = this._cachedState.prop.size;
    const beforeFrontierSize = this._cachedState.observedFrontier.size;

    // Perform the join
    const mergedState = joinStates(this._cachedState, otherState);

    // Calculate receipt
    const afterNodes = mergedState.nodeAlive.elements.size;
    const afterEdges = mergedState.edgeAlive.elements.size;
    const afterProps = mergedState.prop.size;
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
    if (a.size !== b.size) return false;
    for (const [key, val] of a) {
      if (b.get(key) !== val) return false;
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
   * @returns {Promise<import('./services/Reducer.js').WarpState>} The materialized graph state at the checkpoint
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
        const message = nodeInfo.message;

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
    return materializeIncremental({
      persistence: this._persistence,
      graphName: this._graphName,
      checkpointSha,
      targetFrontier,
      patchLoader,
    });
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

    // 3. Materialize current state
    const state = await this.materialize();

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
   * Validates migration boundary for schema:2 graphs.
   *
   * Schema:2 graphs cannot be opened if there is schema:1 history without
   * a migration checkpoint. This ensures data consistency during migration.
   *
   * @throws {Error} If schema:2 is requested but v1 history exists without migration checkpoint
   * @private
   */
  async _validateMigrationBoundary() {
    if (this._schema !== 2) return;

    const checkpoint = await this._loadLatestCheckpoint();
    if (checkpoint?.schema === 2) return;  // Already migrated

    const hasSchema1History = await this._hasSchema1Patches();
    if (hasSchema1History) {
      throw new Error(
        'Cannot open schema:2 graph with v1 history. ' +
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

      if (!tipSha) continue;

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
   * @param {Object} checkpoint - The checkpoint to start from
   * @returns {Promise<Array<{patch: Object, sha: string}>>} Patches since checkpoint
   * @private
   */
  async _loadPatchesSince(checkpoint) {
    const writerIds = await this.discoverWriters();
    const allPatches = [];

    for (const writerId of writerIds) {
      const checkpointSha = checkpoint.frontier?.get(writerId) || null;
      const patches = await this._loadWriterPatches(writerId, checkpointSha);

      // Validate each patch against checkpoint frontier
      for (const { patch, sha } of patches) {
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
    if (!ancestorSha || !descendantSha) return false;
    if (ancestorSha === descendantSha) return true;

    let cur = descendantSha;
    while (cur) {
      const nodeInfo = await this._persistence.getNodeInfo(cur);
      const parent = nodeInfo.parents?.[0] ?? null;
      if (parent === ancestorSha) return true;
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
    if (incomingSha === ckHead) return 'same';
    if (await this._isAncestor(ckHead, incomingSha)) return 'ahead';
    if (await this._isAncestor(incomingSha, ckHead)) return 'behind';
    return 'diverged';
  }

  /**
   * Validates an incoming patch against checkpoint frontier.
   * Uses graph reachability, NOT lamport timestamps.
   *
   * @param {string} writerId - The writer ID for this patch
   * @param {string} incomingSha - The incoming patch commit SHA
   * @param {Object} checkpoint - The checkpoint to validate against
   * @throws {Error} if patch is backfill or diverged
   * @private
   */
  async _validatePatchAgainstCheckpoint(writerId, incomingSha, checkpoint) {
    if (!checkpoint || checkpoint.schema !== 2) return;

    const ckHead = checkpoint.frontier?.get(writerId);
    if (!ckHead) return;  // Checkpoint didn't include this writer

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
   * Checks if GC should run based on current metrics and policy.
   * If thresholds are exceeded, runs GC on the cached state.
   *
   * **Requires schema:2 (WARP v5) and a cached state.**
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
    if (this._schema !== 2 || !this._cachedState) {
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
   * **Requires schema:2 (WARP v5) and a cached state.**
   *
   * @returns {{nodesCompacted: number, edgesCompacted: number, tombstonesRemoved: number, durationMs: number}}
   * @throws {Error} If schema is not 2 or no cached state exists
   *
   * @example
   * await graph.materialize();
   * const result = graph.runGC();
   * console.log(`Removed ${result.tombstonesRemoved} tombstones in ${result.durationMs}ms`);
   */
  runGC() {
    if (this._schema !== 2) {
      throw new Error('runGC() requires schema:2 (WARP v5)');
    }

    if (!this._cachedState) {
      throw new Error('No cached state. Call materialize() first.');
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
    if (this._schema !== 2 || !this._cachedState) {
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
    return processSyncRequest(
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
   * **Requires schema:2 (WARP v5) and a cached state.**
   *
   * @param {{type: 'sync-response', frontier: Map, patches: Map}} response - The sync response
   * @returns {{state: Object, frontier: Map, applied: number}} Result with updated state
   * @throws {Error} If schema is not 2 or no cached state exists
   *
   * @example
   * await graph.materialize(); // Cache state first
   * const result = graph.applySyncResponse(response);
   * console.log(`Applied ${result.applied} patches from remote`);
   */
  applySyncResponse(response) {
    if (this._schema !== 2) {
      throw new Error('applySyncResponse() requires schema:2 (WARP v5)');
    }

    if (!this._cachedState) {
      throw new Error('No cached state. Call materialize() first.');
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
}
