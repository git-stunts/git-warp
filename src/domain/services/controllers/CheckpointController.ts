/**
 * CheckpointController — snapshot lifecycle, GC, and coverage anchoring.
 *
 * Extracted from checkpoint.methods.js. WarpRuntime delegates to this
 * controller via defineProperty loops on the prototype.
 *
 * @module domain/services/controllers/CheckpointController
 */

import QueryError from '../../errors/QueryError.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import { SchemaUnsupportedError } from '../../errors/index.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import { createFrontier, updateFrontier, frontierFingerprint } from '../Frontier.ts';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  isCurrentCheckpointSchema,
} from '../state/checkpointHelpers.ts';
import { loadCheckpoint, type LoadedCheckpoint } from '../state/checkpointLoad.ts';
import { create as createCheckpointCommit } from '../state/checkpointCreate.ts';
import executeGC from '../executeGC.ts';
import GCMetrics from '../GCMetrics.ts';
import { computeAppliedVV } from '../state/CheckpointSerializer.ts';
import { cloneState, type WarpState } from '../JoinReducer.ts';
import type Patch from '../../types/Patch.ts';
import type GCExecuteResult from '../GCExecuteResult.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type {
  WarpStateCoordinate,
  WarpStateSnapshotRecord,
} from '../../../ports/WarpStateCachePort.ts';
import type WarpStateCachePort from '../../../ports/WarpStateCachePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type StateHashService from '../state/StateHashService.ts';
import type MaterializedViewService from '../MaterializedViewService.ts';
import type GCPolicy from '../GCPolicy.ts';
import { E_NO_STATE_MSG } from './QueryStateMessages.ts';

type CheckpointFrontier = Pick<LoadedCheckpoint, 'schema' | 'frontier'>;

type CheckpointHost = {
  _graphName: string;
  _persistence: {
    readRef(ref: string): Promise<string | null>;
    getNodeInfo(sha: string): Promise<{ message: string }>;
  };
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _checkpointing: boolean;
  _viewService: MaterializedViewService | null;
  _checkpointStore: CheckpointStorePort;
  _stateHashService: StateHashService | null;
  _provenanceIndex: ProvenanceIndex | null;
  _materializedGraph?: object | null;
  _logicalIndex?: object | null;
  _propertyReader?: object | null;
  _cachedIndexTree: Record<string, Uint8Array> | null;
  _codec: CodecPort;
  _commitMessageCodec: CommitMessageCodecPort;
  _crypto: CryptoPort;
  _logger: LoggerPort | null;
  _gcPolicy: GCPolicy;
  _patchesSinceGC: number;
  _lastGCLamport: number;
  _maxObservedLamport: number;
  _lastFrontier: Map<string, string> | null;
  _cachedViewHash: string | null;
  _stateCache: WarpStateCachePort | null;
  _readPatch(patchMeta: ReturnType<CommitMessageCodecPort['decodePatch']>): Promise<Patch>;
  discoverWriters(): Promise<string[]>;
};

/**
 * CheckpointController expects the host to expose the patch-loader and
 * compatibility-mixin surfaces below. The assertions keep that contract
 * explicit without widening the host through casts.
 */
type PatchLoaderSurface = {
  _loadWriterPatches(writerId: string, checkpointSha: string | null): Promise<Array<{ patch: Patch; sha: string }>>;
  _validatePatchAgainstCheckpoint(writerId: string, tipSha: string, checkpoint: CheckpointFrontier): Promise<void>;
};

function assertPatchLoaderSurface(host: CheckpointHost): asserts host is CheckpointHost & PatchLoaderSurface {
  void host;
}

export default class CheckpointController {
  _host: CheckpointHost;

  constructor(host: CheckpointHost) {
    this._host = host;
  }

  async createCheckpoint(): Promise<string> {
    const h = this._host;
    const writers = await h.discoverWriters();

    const frontier = createFrontier();
    const parents: string[] = [];

    for (const writerId of writers) {
      const writerRef = buildWriterRef(h._graphName, writerId);
      const sha = await h._persistence.readRef(writerRef);
      if (typeof sha === 'string' && sha.length > 0) {
        updateFrontier(frontier, writerId, sha);
        parents.push(sha);
      }
    }

    const stateCache = h._stateCache ?? null;
    const coordinate = this._coordinateForCheckpoint(frontier);
    if (stateCache !== null) {
      const exactSnapshot = await stateCache.getExact(coordinate);
      if (exactSnapshot !== null) {
        const pinned = exactSnapshot.retention === 'pinned'
          ? exactSnapshot
          : await stateCache.pin(exactSnapshot.snapshotId);
        await stateCache.publishCheckpointHead(h._graphName, pinned.snapshotId);
        return pinned.snapshotId;
      }
    }

    const prevCheckpointing = h._checkpointing;
    h._checkpointing = true;
    let state: WarpState;
    try {
      state = this._requireCheckpointReadingState();
    } finally {
      h._checkpointing = prevCheckpointing;
    }

    if (stateCache !== null) {
      const stored = await stateCache.put(await this._buildSnapshotRecord({
        state,
        coordinate,
      }));
      const pinned = await stateCache.pin(stored.snapshotId);
      await stateCache.publishCheckpointHead(h._graphName, pinned.snapshotId);
      return pinned.snapshotId;
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

    const stateHashService = h._stateHashService ?? null;
    const checkpointSha = await createCheckpointCommit({
      checkpointStore: h._checkpointStore,
      graphName: h._graphName,
      state,
      frontier,
      parents,
      ...(h._provenanceIndex ? { provenanceIndex: h._provenanceIndex } : {}),
      crypto: h._crypto,
      codec: h._codec,
      ...(indexTree ? { indexTree } : {}),
      ...(stateHashService ? { stateHashService } : {}),
    });
    return checkpointSha;
  }

  async _readCheckpointSha(): Promise<string | null> {
    return await this._host._checkpointStore.resolveHead(this._host._graphName);
  }

  private _requireCheckpointReadingState(): WarpState {
    const h = this._host;
    if (h._cachedState !== null && !h._stateDirty) {
      return h._cachedState;
    }
    throw new QueryError(E_NO_STATE_MSG, { code: 'E_NO_STATE' });
  }

  private _coordinateForCheckpoint(frontier: Map<string, string>): WarpStateCoordinate {
    return {
      frontier,
      ceiling: null,
    };
  }

  private async _buildSnapshotRecord(params: {
    state: WarpState;
    coordinate: WarpStateCoordinate;
  }): Promise<WarpStateSnapshotRecord> {
    const stateHash = await this._computeStateHash(params.state, params.coordinate);
    return {
      snapshotId: `snapshot:${stateHash}`,
      coordinate: params.coordinate,
      retention: 'evictable',
      provenancePosture: 'degraded',
      stateHash,
      payloadRef: `snapshot:${stateHash}`,
      createdAt: 'checkpoint-create',
      state: params.state,
    };
  }

  private async _computeStateHash(state: WarpState, coordinate: WarpStateCoordinate): Promise<string> {
    const h = this._host;
    if (h._stateHashService !== null && h._stateHashService !== undefined) {
      return await h._stateHashService.compute(state);
    }
    return `frontier:${frontierFingerprint(coordinate.frontier)}:${coordinate.ceiling === null ? 'head' : String(coordinate.ceiling)}`;
  }

  async syncCoverage(): Promise<void> {
    const h = this._host;
    const writers = await h.discoverWriters();

    if (writers.length === 0) { return; }

    const parents: string[] = [];
    for (const writerId of writers) {
      const writerRef = buildWriterRef(h._graphName, writerId);
      const sha = await h._persistence.readRef(writerRef);
      if (typeof sha === 'string' && sha.length > 0) {
        parents.push(sha);
      }
    }

    if (parents.length === 0) { return; }

    await h._checkpointStore.publishCoverage({ graphName: h._graphName, parents });
  }

  async _loadLatestCheckpoint(): Promise<LoadedCheckpoint | null> {
    const h = this._host;
    const stateCache = h._stateCache ?? null;
    if (stateCache !== null) {
      const snapshotHead = await stateCache.resolveCheckpointHead(h._graphName);
      if (snapshotHead !== null && snapshotHead.state !== undefined) {
        return {
          state: snapshotHead.state,
          frontier: snapshotHead.coordinate.frontier,
          stateHash: snapshotHead.stateHash,
          schema: CURRENT_CHECKPOINT_SCHEMA,
          appliedVV: null,
          indexShardHandles: null,
        };
      }
    }

    const checkpointSha = await h._checkpointStore.resolveHead(h._graphName);

    if (typeof checkpointSha !== 'string' || checkpointSha.length === 0) {
      return null;
    }

    return await loadCheckpoint(h._checkpointStore, checkpointSha, h._graphName);
  }

  async _loadPatchesSince(checkpoint: CheckpointFrontier): Promise<Array<{ patch: Patch; sha: string }>> {
    const h = this._host;
    assertPatchLoaderSurface(h);
    const writerIds = await h.discoverWriters();
    const allPatches: Array<{ patch: Patch; sha: string }> = [];

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

  async _validateMigrationBoundary(): Promise<void> {
    if (await this._hasCurrentCheckpointSchema()) { return; }

    const hasSchema1History = await this._hasSchema1Patches();
    if (hasSchema1History) {
      throw new SchemaUnsupportedError(
        'Cannot open graph with retired patch history. Run `npm run upgrade -- --graph <name>` first.',
      );
    }
  }

  private async _hasCurrentCheckpointSchema(): Promise<boolean> {
    const checkpointSha = await this._readCheckpointSha();
    if (typeof checkpointSha !== 'string' || checkpointSha.length === 0) {
      return false;
    }
    const checkpoint = await this._host._checkpointStore.readMetadata(
      checkpointSha,
      this._host._graphName,
    );
    if (isCurrentCheckpointSchema(checkpoint.schema)) {
      return true;
    }
    throw new PersistenceError(
      `Checkpoint ${checkpointSha} is schema:${checkpoint.schema}. ` +
        `Only schema:${CURRENT_CHECKPOINT_SCHEMA} checkpoints are supported by the shipped runtime. ` +
        'Run `npm run upgrade -- --graph <name>` before loading this graph.',
      'E_CHECKPOINT_UNSUPPORTED_SCHEMA',
      { context: { checkpointSha, schema: checkpoint.schema } },
    );
  }

  async _hasSchema1Patches(): Promise<boolean> {
    const h = this._host;
    const writerIds = await h.discoverWriters();

    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(h._graphName, writerId);
      const tipSha = await h._persistence.readRef(writerRef);

      if (typeof tipSha !== 'string' || tipSha.length === 0) { continue; }

      const nodeInfo = await h._persistence.getNodeInfo(tipSha);
      const kind = h._commitMessageCodec.detectKind(nodeInfo.message);

      if (kind === 'patch') {
        const patchMeta = h._commitMessageCodec.decodePatch(nodeInfo.message);
        if (patchMeta.schema === 1) {
          return true;
        }
      }
    }

    return false;
  }

  _maybeRunGC(state: WarpState): void {
    const h = this._host;
    try {
      const metrics = GCMetrics.fromState(state);
      const policy = h._gcPolicy;
      const { shouldRun, reasons } = policy.evaluate({
        tombstoneRatio: metrics.tombstoneRatio,
        totalEntries: metrics.totalEntries,
        patchesSinceCompaction: h._patchesSinceGC,
        ticksSinceCompaction: h._lastGCLamport > 0 ? h._maxObservedLamport - h._lastGCLamport : 0,
      });

      if (!shouldRun) { return; }

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

        this._installCompactedState(clonedState);
        h._lastGCLamport = h._maxObservedLamport;
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
    } catch (err) {
      if (h._logger) {
        let error = 'non-Error thrown value';
        if (err instanceof Error) {
          error = err.message;
        } else if (err === null) {
          error = 'null';
        } else if (err === undefined) {
          error = 'undefined';
        } else if (typeof err === 'string') {
          error = err;
        } else if (
          typeof err === 'number'
          || typeof err === 'boolean'
          || typeof err === 'bigint'
          || typeof err === 'symbol'
        ) {
          error = String(err);
        }
        h._logger.warn(
          'Auto-GC failed; materialize will continue.',
          { error },
        );
      }
      // GC failure never breaks materialize
    }
  }

  maybeRunGC(): { ran: boolean; result: GCExecuteResult | null; reasons: string[] } {
    const h = this._host;
    if (!h._cachedState) {
      return { ran: false, result: null, reasons: [] };
    }

    const rawMetrics = GCMetrics.fromState(h._cachedState);
    const policy = h._gcPolicy;
    const { shouldRun, reasons } = policy.evaluate({
      tombstoneRatio: rawMetrics.tombstoneRatio,
      totalEntries: rawMetrics.totalEntries,
      patchesSinceCompaction: h._patchesSinceGC,
      ticksSinceCompaction: h._lastGCLamport > 0 ? h._maxObservedLamport - h._lastGCLamport : 0,
    });

    if (!shouldRun) {
      return { ran: false, result: null, reasons: [] };
    }

    const result = this.runGC();
    return { ran: true, result, reasons: [...reasons] };
  }

  runGC(): GCExecuteResult {
    const h = this._host;
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

    this._installCompactedState(clonedState);
    h._lastGCLamport = h._maxObservedLamport;
    h._patchesSinceGC = 0;

    return result;
  }

  private _installCompactedState(state: WarpState): void {
    const h = this._host;
    h._cachedState = state;
    h._materializedGraph = null;
    h._logicalIndex = null;
    h._propertyReader = null;
    h._cachedIndexTree = null;
    h._cachedViewHash = null;
  }

  getGCMetrics(): {
    nodeCount: number;
    edgeCount: number;
    tombstoneCount: number;
    tombstoneRatio: number;
    patchesSinceCompaction: number;
    lastCompactionLamport: number;
  } | null {
    const h = this._host;
    if (!h._cachedState) { return null; }

    const rawMetrics = GCMetrics.fromState(h._cachedState);
    return {
      nodeCount: rawMetrics.nodeLiveDots,
      edgeCount: rawMetrics.edgeLiveDots,
      tombstoneCount: rawMetrics.totalTombstones,
      tombstoneRatio: rawMetrics.tombstoneRatio,
      patchesSinceCompaction: h._patchesSinceGC,
      lastCompactionLamport: h._lastGCLamport,
    };
  }
}
