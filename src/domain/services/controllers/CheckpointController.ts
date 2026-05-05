/**
 * CheckpointController — snapshot lifecycle, GC, and coverage anchoring.
 *
 * Extracted from checkpoint.methods.js. WarpRuntime delegates to this
 * controller via defineProperty loops on the prototype.
 *
 * @module domain/services/controllers/CheckpointController
 */

import QueryError from '../../errors/QueryError.ts';
import { SchemaUnsupportedError } from '../../errors/index.ts';
import { buildWriterRef, buildCheckpointRef, buildCoverageRef } from '../../utils/RefLayout.ts';
import { createFrontier, updateFrontier, frontierFingerprint } from '../Frontier.ts';
import {
  CHECKPOINT_SCHEMA_INDEX_TREE,
  CHECKPOINT_SCHEMA_STANDARD,
  isV5CheckpointSchema,
} from '../state/checkpointHelpers.ts';
import { loadCheckpoint, type LoadedCheckpoint, type LoadPersistence } from '../state/checkpointLoad.ts';
import { create as createCheckpointCommit, type CheckpointPersistence } from '../state/checkpointCreate.ts';
import executeGC from '../executeGC.ts';
import GCMetrics from '../GCMetrics.ts';
import { computeAppliedVV } from '../state/CheckpointSerializer.ts';
import { cloneState, type WarpState } from '../JoinReducer.ts';
import type Patch from '../../types/Patch.ts';
import type GCExecuteResult from '../GCExecuteResult.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type {
  WarpStateCoordinate,
  WarpStateSnapshotProvenancePosture,
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
    updateRef(ref: string, oid: string): Promise<void>;
    commitNode(options: { message: string; parents: string[] }): Promise<string>;
    getNodeInfo(sha: string): Promise<{ message: string }>;
  };
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _checkpointing: boolean;
  _viewService: MaterializedViewService | null;
  _checkpointStore: CheckpointStorePort | null;
  _stateHashService: StateHashService | null;
  _provenanceIndex: ProvenanceIndex | null;
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
  _readPatchBlob(patchMeta: ReturnType<CommitMessageCodecPort['decodePatch']>): Promise<Uint8Array>;
  discoverWriters(): Promise<string[]>;
};

/**
 * Narrows codec-decode output to `object | null`. CodecPort.decode
 * currently returns a loose type (0025B1); wrapping the call in a
 * dedicated narrowing function keeps that looseness inside this helper.
 */
function codecDecodeAsObject(
  codec: CodecPort,
  bytes: Uint8Array,
): object | null {
  const out = codec.decode(bytes);
  if (out === null || out === undefined || typeof out !== 'object') { return null; }
  return out;
}

/**
 * Narrows a decoded patch to just the schema marker this controller
 * needs. `in` check walks the shape defensively — callers branch on a
 * typed `schema` field.
 */
function decodePatchSchema(decoded: object | null): { schema?: number } {
  if (decoded === null) { return {}; }
  if (!('schema' in decoded)) { return {}; }
  const { schema } = decoded as { schema: number | string | boolean | null };
  return typeof schema === 'number' ? { schema } : {};
}

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
        provenancePosture: 'full',
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

    const persistence = h._persistence;
    this._assertCheckpointCreatePersistence(persistence);
    const checkpointStore = h._checkpointStore ?? undefined;
    const stateHashService = h._stateHashService ?? null;
    const checkpointSha = await createCheckpointCommit({
      persistence,
      graphName: h._graphName,
      state,
      frontier,
      parents,
      ...(h._provenanceIndex ? { provenanceIndex: h._provenanceIndex } : {}),
      crypto: h._crypto,
      codec: h._codec,
      commitMessageCodec: h._commitMessageCodec,
      ...(indexTree ? { indexTree } : {}),
      ...(checkpointStore ? { checkpointStore } : {}),
      ...(stateHashService ? { stateHashService } : {}),
    });

    const checkpointRef = buildCheckpointRef(h._graphName);
    await h._persistence.updateRef(checkpointRef, checkpointSha);

    return checkpointSha;
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
    provenancePosture: WarpStateSnapshotProvenancePosture;
  }): Promise<WarpStateSnapshotRecord> {
    const stateHash = await this._computeStateHash(params.state, params.coordinate);
    return {
      snapshotId: `snapshot:${stateHash}`,
      coordinate: params.coordinate,
      retention: 'evictable',
      provenancePosture: params.provenancePosture,
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

  private _assertCheckpointCreatePersistence(
    persistence: CheckpointHost['_persistence'],
  ): asserts persistence is CheckpointHost['_persistence'] & CheckpointPersistence {
    void persistence;
  }

  private _assertLoadPersistence(
    persistence: CheckpointHost['_persistence'],
  ): asserts persistence is CheckpointHost['_persistence'] & LoadPersistence {
    void persistence;
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

    const message = h._commitMessageCodec.encodeAnchor({
      kind: 'anchor',
      graph: h._graphName,
      schema: 2,
    });
    const anchorSha = await h._persistence.commitNode({ message, parents });

    const coverageRef = buildCoverageRef(h._graphName);
    await h._persistence.updateRef(coverageRef, anchorSha);
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
          schema: snapshotHead.indexTreeOid === undefined
            ? CHECKPOINT_SCHEMA_STANDARD
            : CHECKPOINT_SCHEMA_INDEX_TREE,
          appliedVV: null,
          indexShardOids: null,
        };
      }
    }

    const checkpointRef = buildCheckpointRef(h._graphName);
    const checkpointSha = await h._persistence.readRef(checkpointRef);

    if (typeof checkpointSha !== 'string' || checkpointSha.length === 0) {
      return null;
    }

    try {
      const checkpointStore = h._checkpointStore ?? undefined;
      this._assertLoadPersistence(h._persistence);
      return await loadCheckpoint(h._persistence, checkpointSha, {
        codec: h._codec,
        ...(checkpointStore ? { checkpointStore } : {}),
        commitMessageCodec: h._commitMessageCodec,
      });
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
    const checkpoint = await this._loadLatestCheckpoint();
    if (isV5CheckpointSchema(checkpoint?.schema)) { return; }

    const hasSchema1History = await this._hasSchema1Patches();
    if (hasSchema1History) {
      throw new SchemaUnsupportedError(
        'Cannot open graph with v1 history. Run MigrationService.migrate() first to create migration checkpoint.',
      );
    }
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
        // Runtime-narrow the decoded patch shape here rather than trusting
        // the loose CodecPort return surface.
        const patchBuffer = await h._readPatchBlob(patchMeta);
        const decoded = decodePatchSchema(codecDecodeAsObject(h._codec, patchBuffer));

        if (decoded.schema === 1 || decoded.schema === undefined) {
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

        h._cachedState = clonedState;
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
    } catch {
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

    h._cachedState = clonedState;
    h._lastGCLamport = h._maxObservedLamport;
    h._patchesSinceGC = 0;

    return result;
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
