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
import { reduce, createEmptyState } from './services/Reducer.js';
import { decode } from '../infrastructure/codecs/CborCodec.js';
import { decodePatchMessage, detectMessageKind, encodeAnchorMessage } from './services/WarpMessageCodec.js';
import { loadCheckpoint, materializeIncremental, create as createCheckpointCommit } from './services/CheckpointService.js';
import { createFrontier, updateFrontier } from './services/Frontier.js';

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
   */
  constructor({ persistence, graphName, writerId }) {
    /** @type {import('../ports/GraphPersistencePort.js').default} */
    this._persistence = persistence;

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;
  }

  /**
   * Opens a multi-writer graph.
   *
   * @param {Object} options
   * @param {import('../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
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
  static async open({ persistence, graphName, writerId }) {
    // Validate inputs
    validateGraphName(graphName);
    validateWriterId(writerId);

    if (!persistence) {
      throw new Error('persistence is required');
    }

    return new MultiWriterGraph({ persistence, graphName, writerId });
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
   * @returns {PatchBuilder} A fluent patch builder
   *
   * @example
   * const commitSha = await graph.createPatch()
   *   .addNode('user:alice')
   *   .setProperty('user:alice', 'name', 'Alice')
   *   .addEdge('user:alice', 'user:bob', 'follows')
   *   .commit();
   */
  createPatch() {
    return new PatchBuilder({
      persistence: this._persistence,
      graphName: this._graphName,
      writerId: this._writerId,
    });
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
   * @returns {Promise<import('./services/Reducer.js').WarpState>} The materialized graph state
   */
  async materialize() {
    // 1. Discover all writers
    const writerIds = await this.discoverWriters();

    // 2. If no writers, return empty state
    if (writerIds.length === 0) {
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
      return createEmptyState();
    }

    // 5. Reduce all patches to state
    return reduce(allPatches);
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
}
