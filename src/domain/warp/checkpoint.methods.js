/**
 * Checkpoint, GC, and coverage methods for WarpGraph.
 *
 * Every function uses `this` bound to a WarpGraph instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/checkpoint.methods
 */

import { QueryError, E_NO_STATE_MSG } from './_internal.js';
import { buildWriterRef, buildCheckpointRef, buildCoverageRef } from '../utils/RefLayout.js';
import { createFrontier, updateFrontier } from '../services/Frontier.js';
import { loadCheckpoint, create as createCheckpointCommit } from '../services/CheckpointService.js';
import { decodePatchMessage, detectMessageKind, encodeAnchorMessage } from '../services/WarpMessageCodec.js';
import { shouldRunGC, executeGC } from '../services/GCPolicy.js';
import { collectGCMetrics } from '../services/GCMetrics.js';
import { computeAppliedVV } from '../services/CheckpointSerializerV5.js';

/** @typedef {import('../types/WarpPersistence.js').CheckpointPersistence} CheckpointPersistence */

/**
 * Creates a checkpoint of the current graph state.
 *
 * Discovers all writers, builds a frontier of writer tips, materializes
 * the current state, and creates a checkpoint commit with provenance.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<string>} The checkpoint commit SHA
 * @throws {Error} If materialization or commit creation fails
 */
export async function createCheckpoint() {
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
    /** @type {import('../services/JoinReducer.js').WarpStateV5} */
    let state;
    try {
      state = /** @type {import('../services/JoinReducer.js').WarpStateV5} */ ((this._cachedState && !this._stateDirty)
        ? this._cachedState
        : await this.materialize());
    } finally {
      this._checkpointing = prevCheckpointing;
    }

    // 4. Call CheckpointService.create() with provenance index if available
    /** @type {CheckpointPersistence} */
    const persistence = this._persistence;
    const checkpointSha = await createCheckpointCommit({
      persistence,
      graphName: this._graphName,
      state,
      frontier,
      parents,
      provenanceIndex: this._provenanceIndex || undefined,
      crypto: this._crypto,
      codec: this._codec,
    });

    // 5. Update checkpoint ref
    const checkpointRef = buildCheckpointRef(this._graphName);
    await this._persistence.updateRef(checkpointRef, checkpointSha);

    this._logTiming('createCheckpoint', t0);

    // 6. Return checkpoint SHA
    return checkpointSha;
  } catch (err) {
    this._logTiming('createCheckpoint', t0, { error: /** @type {Error} */ (err) });
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
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<void>}
 * @throws {Error} If ref access or commit creation fails
 */
export async function syncCoverage() {
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
 * Loads the latest checkpoint for this graph.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<{state: import('../services/JoinReducer.js').WarpStateV5, frontier: Map<string, string>, stateHash: string, schema: number, provenanceIndex?: import('../services/ProvenanceIndex.js').ProvenanceIndex}|null>} The checkpoint or null
 * @private
 */
export async function _loadLatestCheckpoint() {
  const checkpointRef = buildCheckpointRef(this._graphName);
  const checkpointSha = await this._persistence.readRef(checkpointRef);

  if (!checkpointSha) {
    return null;
  }

  try {
    return await loadCheckpoint(this._persistence, checkpointSha, { codec: this._codec });
  } catch {
    return null;
  }
}

/**
 * Loads patches since a checkpoint for incremental materialization.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {{state: import('../services/JoinReducer.js').WarpStateV5, frontier: Map<string, string>, stateHash: string, schema: number}} checkpoint - The checkpoint to start from
 * @returns {Promise<Array<{patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}>>} Patches since checkpoint
 * @private
 */
export async function _loadPatchesSince(checkpoint) {
  const writerIds = await this.discoverWriters();
  const allPatches = [];

  for (const writerId of writerIds) {
    const checkpointSha = checkpoint.frontier?.get(writerId) || null;
    const patches = await this._loadWriterPatches(writerId, checkpointSha);

    // Validate each patch against checkpoint frontier
    for (const { sha } of patches) {
      await this._validatePatchAgainstCheckpoint(writerId, sha, checkpoint);
    }

    for (const p of patches) {
      allPatches.push(p);
    }
  }

  return allPatches;
}

/**
 * Validates migration boundary for graphs.
 *
 * Graphs cannot be opened if there is schema:1 history without
 * a migration checkpoint. This ensures data consistency during migration.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<void>}
 * @throws {Error} If v1 history exists without migration checkpoint
 * @private
 */
export async function _validateMigrationBoundary() {
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
 * Checks if there are any schema:1 patches in the graph.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<boolean>} True if schema:1 patches exist
 * @private
 */
export async function _hasSchema1Patches() {
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
      const patch = /** @type {{schema?: number}} */ (this._codec.decode(patchBuffer));

      // If any patch has schema:1, we have v1 history
      if (patch.schema === 1 || patch.schema === undefined) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Post-materialize GC check. Warn by default; execute only when enabled.
 * GC failure never breaks materialize.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/JoinReducer.js').WarpStateV5} state
 * @private
 */
export function _maybeRunGC(state) {
  try {
    const metrics = collectGCMetrics(state);
    /** @type {import('../services/GCPolicy.js').GCInputMetrics} */
    const inputMetrics = {
      ...metrics,
      patchesSinceCompaction: this._patchesSinceGC,
      timeSinceCompaction: this._lastGCTime > 0 ? this._clock.now() - this._lastGCTime : 0,
    };
    const { shouldRun, reasons } = shouldRunGC(inputMetrics, /** @type {import('../services/GCPolicy.js').GCPolicy} */ (this._gcPolicy));

    if (!shouldRun) {
      return;
    }

    if (/** @type {import('../services/GCPolicy.js').GCPolicy} */ (this._gcPolicy).enabled) {
      const appliedVV = computeAppliedVV(state);
      const result = executeGC(state, appliedVV);
      this._lastGCTime = this._clock.now();
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
 * @this {import('../WarpGraph.js').default}
 * @returns {{ran: boolean, result: Object|null, reasons: string[]}} GC result
 *
 * @example
 * await graph.materialize();
 * const { ran, result, reasons } = graph.maybeRunGC();
 * if (ran) {
 *   console.log(`GC ran: ${result.tombstonesRemoved} tombstones removed`);
 * }
 */
export function maybeRunGC() {
  if (!this._cachedState) {
    return { ran: false, result: null, reasons: [] };
  }

  const rawMetrics = collectGCMetrics(this._cachedState);
  /** @type {import('../services/GCPolicy.js').GCInputMetrics} */
  const metrics = {
    ...rawMetrics,
    patchesSinceCompaction: this._patchesSinceGC,
    timeSinceCompaction: this._lastGCTime > 0 ? this._clock.now() - this._lastGCTime : 0,
  };

  const { shouldRun, reasons } = shouldRunGC(metrics, /** @type {import('../services/GCPolicy.js').GCPolicy} */ (this._gcPolicy));

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
 * @this {import('../WarpGraph.js').default}
 * @returns {{nodesCompacted: number, edgesCompacted: number, tombstonesRemoved: number, durationMs: number}}
 * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
 *
 * @example
 * await graph.materialize();
 * const result = graph.runGC();
 * console.log(`Removed ${result.tombstonesRemoved} tombstones in ${result.durationMs}ms`);
 */
export function runGC() {
  const t0 = this._clock.now();
  try {
    if (!this._cachedState) {
      throw new QueryError(E_NO_STATE_MSG, {
        code: 'E_NO_STATE',
      });
    }

    // Compute appliedVV from current state
    const appliedVV = computeAppliedVV(this._cachedState);

    // Execute GC (mutates cached state)
    const result = executeGC(this._cachedState, appliedVV);

    // Update GC tracking
    this._lastGCTime = this._clock.now();
    this._patchesSinceGC = 0;

    this._logTiming('runGC', t0, { metrics: `${result.tombstonesRemoved} tombstones removed` });

    return result;
  } catch (err) {
    this._logTiming('runGC', t0, { error: /** @type {Error} */ (err) });
    throw err;
  }
}

/**
 * Gets current GC metrics for the cached state.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {{
 *   nodeCount: number,
 *   edgeCount: number,
 *   tombstoneCount: number,
 *   tombstoneRatio: number,
 *   patchesSinceCompaction: number,
 *   lastCompactionTime: number
 * }|null} GC metrics or null if no cached state
 */
export function getGCMetrics() {
  if (!this._cachedState) {
    return null;
  }

  const rawMetrics = collectGCMetrics(this._cachedState);
  return {
    nodeCount: rawMetrics.nodeLiveDots,
    edgeCount: rawMetrics.edgeLiveDots,
    tombstoneCount: rawMetrics.totalTombstones,
    tombstoneRatio: rawMetrics.tombstoneRatio,
    patchesSinceCompaction: this._patchesSinceGC,
    lastCompactionTime: this._lastGCTime,
  };
}
