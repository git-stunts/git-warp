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
import { createFrontier, updateFrontier, frontierFingerprint } from '../services/Frontier.js';
import { loadCheckpoint, create as createCheckpointCommit } from '../services/CheckpointService.js';
import { decodePatchMessage, detectMessageKind, encodeAnchorMessage } from '../services/WarpMessageCodec.js';
import { shouldRunGC, executeGC } from '../services/GCPolicy.js';
import { collectGCMetrics } from '../services/GCMetrics.js';
import { computeAppliedVV } from '../services/CheckpointSerializerV5.js';
import { cloneStateV5 } from '../services/JoinReducer.js';

/** @typedef {import('../types/WarpPersistence.js').CorePersistence} CorePersistence */

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

    // 4. Reuse cached index tree or rebuild from view service
    let indexTree = this._cachedIndexTree;
    if (!indexTree && this._viewService) {
      try {
        const { tree } = this._viewService.build(state);
        indexTree = tree;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this._logger?.warn('[warp] checkpoint index build failed; saving checkpoint without index', {
          error: message,
        });
        indexTree = null;
      }
    }

    // 5. Create checkpoint commit with provenance index + index tree
    /** @type {CorePersistence} */
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
      indexTree: indexTree || undefined,
    });

    // 6. Update checkpoint ref
    const checkpointRef = buildCheckpointRef(this._graphName);
    await this._persistence.updateRef(checkpointRef, checkpointSha);

    this._logTiming('createCheckpoint', t0);

    // 7. Return checkpoint SHA
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
 * @returns {Promise<{state: import('../services/JoinReducer.js').WarpStateV5, frontier: Map<string, string>, stateHash: string, schema: number, provenanceIndex?: import('../services/ProvenanceIndex.js').ProvenanceIndex, indexShardOids?: Record<string, string>|null}|null>} The checkpoint or null
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
  } catch (err) {
    // "Not found" conditions (missing tree entries, missing blobs) are expected
    // when a checkpoint ref exists but the objects have been pruned or are
    // unreachable. In that case, fall back to full replay by returning null.
    // Decode/corruption errors (e.g., CBOR parse failure, schema mismatch)
    // should propagate so callers see the real problem.
    // These string-contains checks match specific error messages from the
    // persistence layer and codec:
    //   "missing"          — git cat-file on pruned/unreachable objects
    //   "not found"        — readTree entry lookup failures
    //   "ENOENT"           — filesystem-level missing path (bare repo edge case)
    //   "non-empty string" — readRef/getNodeInfo called with empty/null SHA
    const msg = err instanceof Error ? err.message : '';
    if (
      msg.includes('missing') ||
      msg.includes('not found') ||
      msg.includes('ENOENT') ||
      msg.includes('non-empty string')
    ) {
      return null;
    }
    throw err;
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

    // Validate ancestry once at the writer tip; chain-order patches are then
    // transitively valid between checkpointSha and tipSha.
    if (patches.length > 0) {
      const tipSha = patches[patches.length - 1].sha;
      await this._validatePatchAgainstCheckpoint(writerId, tipSha, checkpoint);
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
  if (checkpoint?.schema === 2 || checkpoint?.schema === 3 || checkpoint?.schema === 4) {
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
 * Checks whether any writer tip contains a schema:1 patch.
 *
 * **Heuristic only** — inspects the most recent patch per writer (the tip),
 * not the full history chain. Older schema:1 patches buried deeper in a
 * writer's chain will NOT be detected. This is acceptable because migration
 * typically writes a new tip, so a schema:2+ tip implies the writer has
 * been migrated.
 *
 * @this {import('./_internal.js').WarpGraphWithMixins}
 * @returns {Promise<boolean>} True if any writer tip is schema:1 (or omits `schema`, treated as legacy v1)
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
      const patchBuffer = await this._readPatchBlob(patchMeta);
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
 * Uses clone-then-swap pattern for snapshot isolation (B63):
 * 1. Snapshot frontier fingerprint before GC
 * 2. Clone state, run executeGC on clone
 * 3. Compare frontier after GC — if changed, discard clone + mark dirty
 * 4. If unchanged, swap compacted clone into _cachedState
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
      // Snapshot frontier before GC
      const preGcFingerprint = this._lastFrontier
        ? frontierFingerprint(this._lastFrontier)
        : null;

      // Clone state so executeGC doesn't mutate live state
      const clonedState = cloneStateV5(state);
      const appliedVV = computeAppliedVV(clonedState);
      const result = executeGC(clonedState, appliedVV);

      // Check if frontier changed during GC (concurrent write)
      const postGcFingerprint = this._lastFrontier
        ? frontierFingerprint(this._lastFrontier)
        : null;

      if (preGcFingerprint !== postGcFingerprint) {
        // Frontier changed — discard compacted state, mark dirty
        this._stateDirty = true;
        this._cachedViewHash = null;
        if (this._logger) {
          this._logger.warn(
            'Auto-GC discarded: frontier changed during compaction (concurrent write)',
            { reasons, preGcFingerprint, postGcFingerprint },
          );
        }
        return;
      }

      // Frontier unchanged — swap in compacted state
      this._cachedState = clonedState;
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
 * @returns {{ran: boolean, result: import('../services/GCPolicy.js').GCExecuteResult|null, reasons: string[]}} GC result
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
 * Uses clone-then-swap pattern for snapshot isolation (B63):
 * clones state, runs executeGC on clone, verifies frontier unchanged,
 * then swaps in compacted clone. If frontier changed during GC,
 * throws E_GC_STALE so the caller can retry after re-materializing.
 *
 * **Requires a cached state.**
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {{nodesCompacted: number, edgesCompacted: number, tombstonesRemoved: number, durationMs: number}}
 * @throws {QueryError} If no cached state exists (code: `E_NO_STATE`)
 * @throws {QueryError} If frontier changed during GC (code: `E_GC_STALE`)
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

    // Snapshot frontier before GC
    const preGcFingerprint = this._lastFrontier
      ? frontierFingerprint(this._lastFrontier)
      : null;

    // Clone state so executeGC doesn't mutate live state until verified
    const clonedState = cloneStateV5(this._cachedState);
    const appliedVV = computeAppliedVV(clonedState);
    const result = executeGC(clonedState, appliedVV);

    // Verify frontier unchanged (concurrent write detection)
    const postGcFingerprint = this._lastFrontier
      ? frontierFingerprint(this._lastFrontier)
      : null;

    if (preGcFingerprint !== postGcFingerprint) {
      throw new QueryError(
        'GC aborted: frontier changed during compaction (concurrent write detected)',
        { code: 'E_GC_STALE' },
      );
    }

    // Frontier unchanged — swap in compacted state
    this._cachedState = clonedState;
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
