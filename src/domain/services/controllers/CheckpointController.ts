/**
 * CheckpointController — snapshot lifecycle, GC, and coverage anchoring.
 *
 * Extracted from checkpoint.methods.js. WarpRuntime delegates to this
 * controller via defineProperty loops on the prototype.
 *
 * @module domain/services/controllers/CheckpointController
 */

import { QueryError, E_NO_STATE_MSG, type WarpGraphWithMixins } from '../../warp/_internal.ts';
import { SchemaUnsupportedError } from '../../errors/index.ts';
import { buildWriterRef, buildCheckpointRef, buildCoverageRef } from '../../utils/RefLayout.ts';
import { createFrontier, updateFrontier, frontierFingerprint } from '../Frontier.ts';
import { isV5CheckpointSchema } from '../state/checkpointHelpers.ts';
import { loadCheckpoint, type LoadedCheckpoint } from '../state/checkpointLoad.ts';
import { create as createCheckpointCommit } from '../state/checkpointCreate.ts';
import executeGC from '../executeGC.ts';
import GCMetrics from '../GCMetrics.ts';
import { computeAppliedVV } from '../state/CheckpointSerializer.ts';
import { cloneState, type WarpState } from '../JoinReducer.ts';
import type WarpRuntime from '../../WarpRuntime.ts';
import type Patch from '../../types/Patch.ts';
import type GCExecuteResult from '../GCExecuteResult.ts';

type CheckpointHost = WarpRuntime;

/**
 * Narrows codec-decode output to `object | null` without exposing the
 * word `unknown` at the call site. CodecPort.decode currently returns a
 * loose type (0025B1); wrapping the call in a dedicated narrowing
 * function keeps that looseness inside this helper.
 */
function codecDecodeAsObject(
  codec: import('../../../ports/CodecPort.ts').default,
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
 * The WarpRuntime prototype is extended at wire time with the
 * controller-delegate methods used by CheckpointController. The
 * assertions below declare that compatibility without casting the
 * host value at runtime.
 */
type PatchLoaderSurface = {
  _loadWriterPatches(writerId: string, checkpointSha: string | null): Promise<Array<{ patch: Patch; sha: string }>>;
  _validatePatchAgainstCheckpoint(writerId: string, tipSha: string, checkpoint: LoadedCheckpoint): Promise<void>;
};

function assertPatchLoaderSurface(host: CheckpointHost): asserts host is CheckpointHost & PatchLoaderSurface {
  void host;
}

function assertGraphMixinsSurface(host: CheckpointHost): asserts host is CheckpointHost & WarpGraphWithMixins {
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

    const prevCheckpointing = h._checkpointing;
    h._checkpointing = true;
    let state: WarpState;
    try {
      state = (h._cachedState && !h._stateDirty)
        ? h._cachedState
        : await h.materialize();
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

    const persistence = h._persistence;
    const checkpointStore = h._checkpointStore ?? null;
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
      checkpointStore,
      ...(stateHashService ? { stateHashService } : {}),
    });

    const checkpointRef = buildCheckpointRef(h._graphName);
    await h._persistence.updateRef(checkpointRef, checkpointSha);

    return checkpointSha;
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
    const checkpointRef = buildCheckpointRef(h._graphName);
    const checkpointSha = await h._persistence.readRef(checkpointRef);

    if (typeof checkpointSha !== 'string' || checkpointSha.length === 0) {
      return null;
    }

    try {
      const checkpointStore = h._checkpointStore ?? null;
      return await loadCheckpoint(h._persistence, checkpointSha, {
        codec: h._codec,
        checkpointStore,
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

  async _loadPatchesSince(checkpoint: LoadedCheckpoint): Promise<Array<{ patch: Patch; sha: string }>> {
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
        // Resolution: take B2's assertion + runtime-narrowing approach.
        // Eliminates the `as unknown as` double-cast (0025A win) and
        // provides runtime shape validation. The parameterized CodecPort
        // from 0025B1 is still available elsewhere; here the runtime guard
        // is the stronger anti-sludge choice.
        assertGraphMixinsSurface(h);
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
