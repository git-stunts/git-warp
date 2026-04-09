/**
 * CheckpointController — snapshot lifecycle, GC, and coverage anchoring.
 *
 * Extracted from checkpoint.methods.js. WarpRuntime delegates to this
 * controller via defineProperty loops on the prototype.
 *
 * @module domain/services/controllers/CheckpointController
 */

import { QueryError, E_NO_STATE_MSG } from '../../warp/_internal.ts';
import { SchemaUnsupportedError } from '../../errors/index.ts';
import { buildWriterRef, buildCheckpointRef, buildCoverageRef } from '../../utils/RefLayout.ts';
import { createFrontier, updateFrontier, frontierFingerprint } from '../Frontier.js';
import { loadCheckpoint, create as createCheckpointCommit, isV5CheckpointSchema } from '../state/CheckpointService.js';
import { decodePatchMessage, detectMessageKind, encodeAnchorMessage } from '../codec/WarpMessageCodec.js';
import executeGC from '../executeGC.ts';
import GCMetrics from '../GCMetrics.ts';

/** @typedef {import('../GCPolicy.ts').default} GCPolicy */
import { computeAppliedVV } from '../state/CheckpointSerializerV5.js';
import { cloneState } from '../JoinReducer.ts';

/**
 * @typedef {import('../../WarpRuntime.js').default} CheckpointHost
 * @typedef {import('../../types/WarpPersistence.ts').CorePersistence} CorePersistence
 */

export default class CheckpointController {
  /** @type {CheckpointHost} */
  _host;

  /**
   * Creates a CheckpointController bound to a WarpRuntime host.
   * @param {CheckpointHost} host
   */
  constructor(host) {
    this._host = host;
  }

  /**
   * Creates a checkpoint of the current graph state.
   *
   * @returns {Promise<string>}
   */
  async createCheckpoint() {
    const h = this._host;
    const t0 = h._clock.now();
    try {
      const writers = await h.discoverWriters();

      const frontier = createFrontier();
      const parents = [];

      for (const writerId of writers) {
        const writerRef = buildWriterRef(h._graphName, writerId);
        const sha = await h._persistence.readRef(writerRef);
        if (typeof sha === 'string' && sha.length > 0) {
          updateFrontier(frontier, writerId, sha);
          parents.push(sha);
        }
      }

      const prevCheckpointing = h._checkpointing;
      h._checkpointing = true;
      /** @type {import('../JoinReducer.ts').WarpState} */
      let state;
      try {
        state = /** @type {import('../JoinReducer.ts').WarpState} */ ((h._cachedState && !h._stateDirty)
          ? h._cachedState
          : await h.materialize());
      } finally {
        h._checkpointing = prevCheckpointing;
      }

      let indexTree = h._cachedIndexTree;
      if ((indexTree === null || indexTree === undefined) && h._viewService !== null && h._viewService !== undefined) {
        try {
          const { tree } = h._viewService.build(state);
          indexTree = tree;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          h._logger?.warn('[warp] checkpoint index build failed; saving checkpoint without index', {
            error: message,
          });
          indexTree = null;
        }
      }

      /** @type {CorePersistence} */
      const persistence = h._persistence;
      /** @type {import('../../../ports/CheckpointStorePort.ts').default|null} */
      const checkpointStore = /** @type {import('../../../ports/CheckpointStorePort.ts').default|null} */ (h._checkpointStore);
      const stateHashService = /** @type {import('../state/StateHashService.js').default|null} */ (h._stateHashService);
      const checkpointSha = await createCheckpointCommit({
        persistence,
        graphName: h._graphName,
        state,
        frontier,
        parents,
        ...(h._provenanceIndex ? { provenanceIndex: h._provenanceIndex } : {}),
        crypto: h._crypto,
        codec: h._codec,
        ...(indexTree ? { indexTree } : {}),
        ...(checkpointStore ? { checkpointStore } : {}),
        ...(stateHashService ? { stateHashService } : {}),
      });

      const checkpointRef = buildCheckpointRef(h._graphName);
      await h._persistence.updateRef(checkpointRef, checkpointSha);

      h._logTiming('createCheckpoint', t0);

      return checkpointSha;
    } catch (err) {
      h._logTiming('createCheckpoint', t0, { error: /** @type {Error} */ (err) });
      throw err;
    }
  }

  /**
   * Syncs coverage information across writers.
   *
   * @returns {Promise<void>}
   */
  async syncCoverage() {
    const h = this._host;
    const writers = await h.discoverWriters();

    if (writers.length === 0) {
      return;
    }

    const parents = [];
    for (const writerId of writers) {
      const writerRef = buildWriterRef(h._graphName, writerId);
      const sha = await h._persistence.readRef(writerRef);
      if (typeof sha === 'string' && sha.length > 0) {
        parents.push(sha);
      }
    }

    if (parents.length === 0) {
      return;
    }

    const message = encodeAnchorMessage({ graph: h._graphName });
    const anchorSha = await h._persistence.commitNode({ message, parents });

    const coverageRef = buildCoverageRef(h._graphName);
    await h._persistence.updateRef(coverageRef, anchorSha);
  }

  /**
   * Loads the latest checkpoint for this graph.
   *
   * @returns {Promise<{state: import('../JoinReducer.ts').WarpState, frontier: Map<string, string>, stateHash: string, schema: number, provenanceIndex?: import('../provenance/ProvenanceIndex.js').ProvenanceIndex, indexShardOids?: Record<string, string>|null}|null>}
   */
  async _loadLatestCheckpoint() {
    const h = this._host;
    const checkpointRef = buildCheckpointRef(h._graphName);
    const checkpointSha = await h._persistence.readRef(checkpointRef);

    if (typeof checkpointSha !== 'string' || checkpointSha.length === 0) {
      return null;
    }

    try {
      /** @type {import('../../../ports/CheckpointStorePort.ts').default|null} */
      const checkpointStore = /** @type {import('../../../ports/CheckpointStorePort.ts').default|null} */ (h._checkpointStore);
      return await loadCheckpoint(h._persistence, checkpointSha, { codec: h._codec, ...(checkpointStore ? { checkpointStore } : {}) });
    } catch (err) {
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
   * @param {{state: import('../JoinReducer.ts').WarpState, frontier: Map<string, string>, stateHash: string, schema: number}} checkpoint
   * @returns {Promise<Array<{patch: import('../../types/Patch.ts').default, sha: string}>>}
   */
  async _loadPatchesSince(checkpoint) {
    const h = this._host;
    const writerIds = await h.discoverWriters();
    const allPatches = [];

    for (const writerId of writerIds) {
      const checkpointSha = checkpoint.frontier?.get(writerId) ?? null;
      const patches = await h._loadWriterPatches(writerId, checkpointSha);

      const lastPatch = patches[patches.length - 1];
      if (lastPatch !== undefined) {
        const tipSha = lastPatch.sha;
        await h._validatePatchAgainstCheckpoint(writerId, tipSha, checkpoint);
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
   * @returns {Promise<void>}
   */
  async _validateMigrationBoundary() {
    const checkpoint = await this._loadLatestCheckpoint();
    if (isV5CheckpointSchema(checkpoint?.schema)) {
      return;
    }

    const hasSchema1History = await this._hasSchema1Patches();
    if (hasSchema1History) {
      throw new SchemaUnsupportedError(
        'Cannot open graph with v1 history. Run MigrationService.migrate() first to create migration checkpoint.',
      );
    }
  }

  /**
   * Checks whether any writer tip contains a schema:1 patch.
   *
   * @returns {Promise<boolean>}
   */
  async _hasSchema1Patches() {
    const h = this._host;
    const writerIds = await h.discoverWriters();

    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(h._graphName, writerId);
      const tipSha = await h._persistence.readRef(writerRef);

      if (typeof tipSha !== 'string' || tipSha.length === 0) {
        continue;
      }

      const nodeInfo = await h._persistence.getNodeInfo(tipSha);
      const kind = detectMessageKind(nodeInfo.message);

      if (kind === 'patch') {
        const patchMeta = decodePatchMessage(nodeInfo.message);
        const host = /** @type {import('../../warp/_internal.ts').WarpGraphWithMixins} */ (/** @type {unknown} */ (h));
        const patchBuffer = await host._readPatchBlob(patchMeta);
        const decoded = /** @type {{schema?: number}} */ (host._codec.decode(patchBuffer));

        if (decoded.schema === 1 || decoded.schema === undefined) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Post-materialize GC check. Warn by default; execute only when enabled.
   *
   * @param {import('../JoinReducer.ts').WarpState} state
   */
  _maybeRunGC(state) {
    const h = this._host;
    try {
      const metrics = GCMetrics.fromState(state);
      /** @type {GCPolicy} */
      const policy = h._gcPolicy;
      const { shouldRun, reasons } = policy.evaluate({
        tombstoneRatio: metrics.tombstoneRatio,
        totalEntries: metrics.totalEntries,
        patchesSinceCompaction: h._patchesSinceGC,
        timeSinceCompaction: h._lastGCTime > 0 ? h._clock.now() - h._lastGCTime : 0,
      });

      if (!shouldRun) {
        return;
      }

      if (policy.enabled) {
        const preGcFingerprint = h._lastFrontier
          ? frontierFingerprint(h._lastFrontier)
          : null;

        const clonedState = cloneState(state);
        const appliedVV = computeAppliedVV(clonedState);
        const result = executeGC(clonedState, appliedVV);

        const postGcFingerprint = h._lastFrontier
          ? frontierFingerprint(h._lastFrontier)
          : null;

        if (preGcFingerprint !== postGcFingerprint) {
          h._stateDirty = true;
          h._cachedViewHash = null;
          if (h._logger) {
            h._logger.warn(
              'Auto-GC discarded: frontier changed during compaction (concurrent write)',
              { reasons, preGcFingerprint, postGcFingerprint },
            );
          }
          return;
        }

        h._cachedState = clonedState;
        h._lastGCTime = h._clock.now();
        h._patchesSinceGC = 0;
        if (h._logger) {
          h._logger.info('Auto-GC completed', { ...result, reasons });
        }
      } else if (h._logger) {
        h._logger.warn(
          'GC thresholds exceeded but auto-GC is disabled. Set gcPolicy: { enabled: true } to auto-compact.',
          { reasons },
        );
      }
    } catch {
      // GC failure never breaks materialize
    }
  }

  /**
   * Checks if GC should run and runs it if thresholds are exceeded.
   *
   * @returns {{ran: boolean, result: import('../GCExecuteResult.ts').default|null, reasons: string[]}}
   */
  maybeRunGC() {
    const h = this._host;
    if (!h._cachedState) {
      return { ran: false, result: null, reasons: [] };
    }

    const rawMetrics = GCMetrics.fromState(h._cachedState);
    /** @type {GCPolicy} */
    const policy = h._gcPolicy;
    const { shouldRun, reasons } = policy.evaluate({
      tombstoneRatio: rawMetrics.tombstoneRatio,
      totalEntries: rawMetrics.totalEntries,
      patchesSinceCompaction: h._patchesSinceGC,
      timeSinceCompaction: h._lastGCTime > 0 ? h._clock.now() - h._lastGCTime : 0,
    });

    if (!shouldRun) {
      return { ran: false, result: null, reasons: [] };
    }

    const result = this.runGC();
    return { ran: true, result, reasons };
  }

  /**
   * Explicitly runs GC on the cached state.
   *
   * @returns {{nodesCompacted: number, edgesCompacted: number, tombstonesRemoved: number, durationMs: number}}
   */
  runGC() {
    const h = this._host;
    const t0 = h._clock.now();
    try {
      if (!h._cachedState) {
        throw new QueryError(E_NO_STATE_MSG, { code: 'E_NO_STATE' });
      }

      const preGcFingerprint = h._lastFrontier
        ? frontierFingerprint(h._lastFrontier)
        : null;

      const clonedState = cloneState(h._cachedState);
      const appliedVV = computeAppliedVV(clonedState);
      const result = executeGC(clonedState, appliedVV);

      const postGcFingerprint = h._lastFrontier
        ? frontierFingerprint(h._lastFrontier)
        : null;

      if (preGcFingerprint !== postGcFingerprint) {
        throw new QueryError(
          'GC aborted: frontier changed during compaction (concurrent write detected)',
          { code: 'E_GC_STALE' },
        );
      }

      h._cachedState = clonedState;
      h._lastGCTime = h._clock.now();
      h._patchesSinceGC = 0;

      h._logTiming('runGC', t0, { metrics: `${result.tombstonesRemoved} tombstones removed` });

      return result;
    } catch (err) {
      h._logTiming('runGC', t0, { error: /** @type {Error} */ (err) });
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
   * }|null}
   */
  getGCMetrics() {
    const h = this._host;
    if (!h._cachedState) {
      return null;
    }

    const rawMetrics = GCMetrics.fromState(h._cachedState);
    return {
      nodeCount: rawMetrics.nodeLiveDots,
      edgeCount: rawMetrics.edgeLiveDots,
      tombstoneCount: rawMetrics.totalTombstones,
      tombstoneRatio: rawMetrics.tombstoneRatio,
      patchesSinceCompaction: h._patchesSinceGC,
      lastCompactionTime: h._lastGCTime,
    };
  }
}
