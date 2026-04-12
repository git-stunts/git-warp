/**
 * PatchController — state mutation, writer lifecycle, discovery, and CRDT join.
 *
 * Extracted from patch.methods.js. WarpRuntime delegates to this controller
 * via defineProperty loops on the prototype.
 *
 * Discovery helpers (lamport, chain loading, tick enumeration) live in
 * PatchDiscovery.ts and are composed here.
 *
 * @module domain/services/controllers/PatchController
 */

import { PatchBuilder } from '../PatchBuilder.ts';
import { joinStates, applyWithDiff, applyWithReceipt, type WarpState } from '../JoinReducer.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import { Writer } from '../../warp/Writer.ts';
import { resolveWriterId } from '../../utils/WriterId.ts';
import EncryptionError from '../../errors/EncryptionError.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import PatchError from '../../errors/PatchError.ts';
import { QueryError, E_NO_STATE_MSG, E_STALE_STATE_MSG } from '../../warp/_internal.ts';
import {
  PatchDiscovery,
  type PatchDiscoveryHost,
  type LamportResult,
  type PatchEntry,
  type DiscoverTicksResult,
} from './PatchDiscovery.ts';
import type VersionVector from '../../crdt/VersionVector.ts';
import type Patch from '../../types/Patch.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type ConfigPort from '../../../ports/ConfigPort.ts';
import type { PatchDiff } from '../../types/PatchDiff.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';

// ── PatchHost ─────────────────────────────────────────────────────────────────

type DeletePolicy = 'reject' | 'cascade' | 'warn';

/**
 * The host interface that PatchController depends on.
 *
 * Documents the exact WarpRuntime surface the controller accesses,
 * making the coupling explicit and enabling lightweight mock hosts
 * in unit tests.
 */
export interface PatchHost extends PatchDiscoveryHost {
  _writerId: string;
  _versionVector: VersionVector;
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _autoMaterialize: boolean;
  _maxObservedLamport: number;
  _patchInProgress: boolean;
  _patchesSinceCheckpoint: number;
  _onDeleteWithData: DeletePolicy;
  _blobStorage: BlobStoragePort | null | undefined;
  _patchBlobStorage: { retrieve: (oid: string) => Promise<Uint8Array> } | null | undefined;
  _provenanceIndex: {
    addPatch: (sha: string, reads: string[] | undefined, writes: string[] | undefined) => void;
  } | null | undefined;
  _lastFrontier: Map<string, string> | null | undefined;
  _auditService: {
    commit: (receipt: TickReceipt) => Promise<string | null>;
  } | null | undefined;
  _auditSkipCount: number;
  _cachedViewHash: string | null;
  _materializedGraph: { state: WarpState; stateHash: string | null; adjacency: unknown } | null;
  _logicalIndex: unknown;
  _propertyReader: unknown;
  _cachedIndexTree: unknown;
  materialize: (options?: Record<string, unknown>) => Promise<unknown>;
  _setMaterializedState: (
    state: WarpState,
    opts?: { diff?: PatchDiff | null },
  ) => Promise<unknown>;
  _buildAdjacency: (state: WarpState) => {
    outgoing: Map<string, Array<{ neighborId: string; label: string }>>;
    incoming: Map<string, Array<{ neighborId: string; label: string }>>;
  };
}

// ── JoinReceipt ───────────────────────────────────────────────────────────────

export interface JoinReceipt {
  nodesAdded: number;
  nodesRemoved: number;
  edgesAdded: number;
  edgesRemoved: number;
  propsChanged: number;
  frontierMerged: boolean;
}

// ── PatchController ───────────────────────────────────────────────────────────

/**
 * Handles state mutation, writer lifecycle, discovery, and CRDT join
 * on behalf of WarpRuntime.
 */
export default class PatchController {
  readonly _host: PatchHost;
  private readonly _discovery: PatchDiscovery;

  constructor(host: PatchHost) {
    this._host = host;
    this._discovery = new PatchDiscovery(host);
  }

  // ── Patch creation ──────────────────────────────────────────────────────────

  /**
   * Creates a new PatchBuilder for this graph.
   */
  async createPatch(): Promise<PatchBuilder> {
    const h = this._host;

    // Auto-materialize: if autoMaterialize is on and there is no
    // cached state but there ARE existing patches (parentSha !== null),
    // materialize now. Without this, removeNode/removeEdge throws
    // E_PATCH_NO_STATE because the PatchBuilder can't observe OR-Set
    // dots. We skip materialization for the very first patch (no parent)
    // since there's nothing to materialize.
    const { lamport, parentSha } = await this._nextLamport();
    if (h._autoMaterialize && h._cachedState === null && parentSha !== null) {
      await h.materialize();
    }

    const opts: ConstructorParameters<typeof PatchBuilder>[0] = {
      persistence: h._persistence,
      graphName: h._graphName,
      writerId: h._writerId,
      lamport,
      versionVector: h._versionVector,
      getCurrentState: () => h._cachedState,
      expectedParentSha: parentSha,
      onDeleteWithData: h._onDeleteWithData,
      onCommitSuccess: (commitOpts) => this._onPatchCommitted(h._writerId, commitOpts),
    };

    if (h._patchJournal !== null && h._patchJournal !== undefined) {
      opts.patchJournal = h._patchJournal;
    }
    if (h._logger !== null && h._logger !== undefined) {
      opts.logger = h._logger;
    }
    if (h._blobStorage !== null && h._blobStorage !== undefined) {
      opts.blobStorage = h._blobStorage;
    }

    return new PatchBuilder(opts);
  }

  /**
   * Convenience wrapper: creates a patch, runs the callback, and commits.
   */
  async patch(build: (p: PatchBuilder) => void | Promise<void>): Promise<string> {
    const h = this._host;
    if (h._patchInProgress) {
      throw new PatchError(
        'graph.patch() is not reentrant. Use createPatch() for nested or concurrent patches.',
        { code: 'E_PATCH_REENTRANT' },
      );
    }
    h._patchInProgress = true;
    try {
      const p = await this.createPatch();
      await build(p);
      return await p.commit();
    } finally {
      h._patchInProgress = false;
    }
  }

  /**
   * Applies multiple patches sequentially.
   */
  async patchMany(...builds: Array<(p: PatchBuilder) => void | Promise<void>>): Promise<string[]> {
    if (builds.length === 0) {
      return [];
    }
    const shas: string[] = [];
    for (const build of builds) {
      shas.push(await this.patch(build));
    }
    return shas;
  }

  // ── Lamport + chain loading (delegate to PatchDiscovery) ────────────────────

  /**
   * Gets the next lamport timestamp and current parent SHA for this writer.
   */
  async _nextLamport(): Promise<LamportResult> {
    const h = this._host;
    const writerRef = buildWriterRef(h._graphName, h._writerId);
    return await this._discovery.nextLamportFor(writerRef);
  }

  /**
   * Loads a patch chain starting from an explicit tip SHA.
   */
  async _loadPatchChainFromSha(tipSha: string, stopAtSha: string | null = null): Promise<PatchEntry[]> {
    return await this._discovery.loadPatchChainFromSha(tipSha, stopAtSha);
  }

  /**
   * Loads all patches from a writer's ref chain.
   */
  async _loadWriterPatches(writerId: string, stopAtSha: string | null = null): Promise<PatchEntry[]> {
    return await this._discovery.loadWriterPatches(writerId, stopAtSha);
  }

  /**
   * Returns patches from a writer's ref chain (public API).
   */
  async getWriterPatches(writerId: string, stopAtSha: string | null = null): Promise<PatchEntry[]> {
    return await this._discovery.loadWriterPatches(writerId, stopAtSha);
  }

  /**
   * Discovers all writers that have written to this graph.
   */
  async discoverWriters(): Promise<string[]> {
    return await this._discovery.discoverWriters();
  }

  /**
   * Discovers all distinct Lamport ticks across all writers.
   */
  async discoverTicks(): Promise<DiscoverTicksResult> {
    return await this._discovery.discoverTicks();
  }

  // ── Post-commit hook ────────────────────────────────────────────────────────

  /**
   * Post-commit hook: updates version vector, eager re-materialize,
   * provenance index, frontier, and audit service.
   */
  async _onPatchCommitted(
    writerId: string,
    { patch: committed, sha }: { patch?: Patch; sha?: string } = {},
  ): Promise<void> {
    const h = this._host;
    h._versionVector.increment(writerId);
    if (committed?.lamport !== undefined && committed.lamport > h._maxObservedLamport) {
      h._maxObservedLamport = committed.lamport;
    }
    h._patchesSinceCheckpoint++;
    if (h._cachedState && !h._stateDirty && committed && typeof sha === 'string' && sha.length > 0) {
      let tickReceipt: unknown = null;
      let diff: PatchDiff | null = null;
      if (h._auditService) {
        const result = applyWithReceipt(h._cachedState, committed, sha);
        tickReceipt = result.receipt;
      } else {
        const result = applyWithDiff(h._cachedState, committed, sha);
        diff = result.diff;
      }
      await h._setMaterializedState(h._cachedState, { diff });
      if (h._provenanceIndex) {
        h._provenanceIndex.addPatch(
          sha,
          committed.reads,
          committed.writes,
        );
      }
      if (h._lastFrontier) {
        h._lastFrontier.set(writerId, sha);
      }
      if (h._auditService && tickReceipt) {
        try {
          await h._auditService.commit(tickReceipt);
        } catch {
          // Data commit already succeeded. Logged inside service.
        }
      }
    } else {
      h._stateDirty = true;
      h._cachedViewHash = null;
      if (h._auditService) {
        h._auditSkipCount++;
        h._logger?.warn('[warp:audit]', {
          code: 'AUDIT_SKIPPED_DIRTY_STATE',
          sha,
          skipCount: h._auditSkipCount,
        });
      }
    }
  }

  // ── Writer lifecycle ────────────────────────────────────────────────────────

  /**
   * Creates a Writer bound to an existing (or resolved) writer ID.
   */
  async writer(writerId: string): Promise<Writer> {
    const h = this._host;
    const config = h._persistence as unknown as ConfigPort;
    const configGet = async (key: string): Promise<string | null> => await config.configGet(key);
    const configSet = async (key: string, value: string): Promise<void> => await config.configSet(key, value);

    const resolvedWriterId = await resolveWriterId({
      graphName: h._graphName,
      explicitWriterId: writerId,
      configGet,
      configSet,
    });

    const persistence = h._persistence;
    const writerOpts: ConstructorParameters<typeof Writer>[0] = {
      persistence,
      graphName: h._graphName,
      writerId: resolvedWriterId,
      versionVector: h._versionVector,
      getCurrentState: () => h._cachedState,
      onDeleteWithData: h._onDeleteWithData,
      onCommitSuccess: (opts) => this._onPatchCommitted(resolvedWriterId, opts),
      patchJournal: h._patchJournal as PatchJournalPort,
    };
    if (h._logger !== null && h._logger !== undefined) {
      writerOpts.logger = h._logger;
    }
    if (h._blobStorage !== null && h._blobStorage !== undefined) {
      writerOpts.blobStorage = h._blobStorage;
    }
    return new Writer(writerOpts);
  }

  // ── State helpers ───────────────────────────────────────────────────────────

  /**
   * Ensures cached state is fresh. Triggers auto-materialize if enabled.
   */
  async _ensureFreshState(): Promise<void> {
    const h = this._host;
    if (h._autoMaterialize && (!h._cachedState || h._stateDirty)) {
      await h.materialize();
      return;
    }
    if (!h._cachedState) {
      throw new QueryError(E_NO_STATE_MSG, { code: 'E_NO_STATE' });
    }
    if (h._stateDirty) {
      throw new QueryError(E_STALE_STATE_MSG, { code: 'E_STALE_STATE' });
    }
  }

  /**
   * Reads a patch blob, using patchBlobStorage for encrypted patches.
   */
  async _readPatchBlob(patchMeta: { patchOid: string; encrypted: boolean }): Promise<Uint8Array> {
    const h = this._host;
    if (patchMeta.encrypted) {
      if (!h._patchBlobStorage) {
        throw new EncryptionError(
          'This graph contains encrypted patches; provide patchBlobStorage with an encryption key',
        );
      }
      return await h._patchBlobStorage.retrieve(patchMeta.patchOid);
    }
    const blob = await h._persistence.readBlob(patchMeta.patchOid);
    if (blob === null || blob === undefined) {
      throw new PersistenceError(
        `Patch blob not found: ${patchMeta.patchOid}`,
        PersistenceError.E_MISSING_OBJECT,
        { context: { oid: patchMeta.patchOid } },
      );
    }
    return blob;
  }

  // ── CRDT join ───────────────────────────────────────────────────────────────

  /**
   * Joins an external WarpState into the cached state using CRDT merge.
   */
  join(otherState: WarpState): { state: WarpState; receipt: JoinReceipt } {
    const h = this._host;
    if (!h._cachedState) {
      throw new QueryError(E_NO_STATE_MSG, { code: 'E_NO_STATE' });
    }

    if (
      otherState === null ||
      otherState === undefined ||
      !('nodeAlive' in otherState) ||
      !('edgeAlive' in otherState)
    ) {
      throw new QueryError('Invalid state: must be a valid WarpState object', { code: 'E_INVALID_STATE' });
    }

    const beforeNodes = h._cachedState.nodeAlive.elements().length;
    const beforeEdges = h._cachedState.edgeAlive.elements().length;
    const beforeFrontierSize = h._cachedState.observedFrontier.size;

    const mergedState = joinStates(h._cachedState, otherState);

    const afterNodes = mergedState.nodeAlive.elements().length;
    const afterEdges = mergedState.edgeAlive.elements().length;
    const afterFrontierSize = mergedState.observedFrontier.size;

    let propsChanged = 0;
    for (const [key, reg] of mergedState.prop) {
      const oldReg = h._cachedState.prop.get(key);
      if (!oldReg || oldReg.value !== reg.value) {
        propsChanged++;
      }
    }

    const receipt: JoinReceipt = {
      nodesAdded: Math.max(0, afterNodes - beforeNodes),
      nodesRemoved: Math.max(0, beforeNodes - afterNodes),
      edgesAdded: Math.max(0, afterEdges - beforeEdges),
      edgesRemoved: Math.max(0, beforeEdges - afterEdges),
      propsChanged,
      frontierMerged:
        afterFrontierSize !== beforeFrontierSize ||
        !this._frontierEquals(h._cachedState.observedFrontier, mergedState.observedFrontier),
    };

    h._cachedState = mergedState;
    h._versionVector = mergedState.observedFrontier.clone();

    const adjacency = h._buildAdjacency(mergedState);
    h._materializedGraph = { state: mergedState, stateHash: null, adjacency };

    h._logicalIndex = null;
    h._propertyReader = null;
    h._cachedViewHash = null;
    h._cachedIndexTree = null;
    h._stateDirty = false;

    return { state: mergedState, receipt };
  }

  /**
   * Compares two version vectors for equality.
   */
  _frontierEquals(a: VersionVector, b: VersionVector): boolean {
    return a.equals(b);
  }
}
