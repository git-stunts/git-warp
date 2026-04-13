/**
 * Delegation wiring for WarpRuntime.
 *
 * Exports `wireRuntime()` which attaches controller-delegating methods
 * onto WarpRuntime.prototype. Called from WarpRuntime.ts after the
 * class definition to avoid circular imports.
 *
 * @module domain/runtimeWiring
 */

import { createImmutableWarpState, createImmutableValue } from './services/ImmutableSnapshot.ts';
import { buildAdjacency } from './services/controllers/MaterializeHelpers.ts';
import QueryError from './errors/QueryError.ts';

import type VersionVector from './crdt/VersionVector.ts';
import type WarpState from './services/state/WarpState.ts';
import type { PatchDiff } from './types/PatchDiff.ts';
import type MaterializeController from './services/controllers/MaterializeController.ts';
import type { MaterializeResult } from './services/controllers/MaterializeController.ts';
import type MaterializedViewService from './services/MaterializedViewService.ts';
import type { LogicalIndex } from './services/index/BitmapNeighborProvider.ts';
import type CryptoPort from '../ports/CryptoPort.ts';
import type CodecPort from '../ports/CodecPort.ts';
import type { MaterializedGraph } from './WarpRuntime.ts';

// ── Narrow host type for wired methods ──────────────────────────────
// Avoids circular import of WarpRuntime while providing type safety.

interface WiringHost {
  _materializeController: MaterializeController;
  _cachedIndexTree: Record<string, Uint8Array> | null;
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _materializedGraph: MaterializedGraph | null;
  _versionVector: VersionVector;
  _crypto: CryptoPort;
  _codec: CodecPort;
  _logicalIndex: LogicalIndex | null;
  _viewService: MaterializedViewService | null;
  _cachedViewHash: string | null;
  _onMaterialized(result: MaterializeResult): Promise<void>;
  _buildViewFromResult(result: { state: WarpState; stateHash: string; diff?: PatchDiff | null | undefined }): void;
  _buildAdjacency(state: WarpState): import('./capabilities/AdjacencyMap.ts').default;
  materialize(): Promise<WarpState>;
}

// ── Type alias for the runtime prototype target ─────────────────────
type RuntimeClass = { prototype: object };

// ── Helpers ─────────────────────────────────────────────────────────

function wireMaterialize(cls: RuntimeClass, name: string, fn: Function): void {
  Object.defineProperty(cls.prototype, name, {
    value: fn, writable: true, configurable: true, enumerable: false,
  });
}

function wireDelegation(
  cls: RuntimeClass,
  controllerField: string,
  methods: readonly string[],
): void {
  for (const method of methods) {
    Object.defineProperty(cls.prototype, method, {
      // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
      value: function (this: Record<string, Record<string, (...a: unknown[]) => unknown>>, ...args: unknown[]): unknown {
        const ctrl = this[controllerField]!;
        const fn = ctrl[method]!;
        return fn.call(ctrl, ...args);
      },
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

// ── Main wiring function ────────────────────────────────────────────

/**
 * Attaches all delegation methods onto WarpRuntime.prototype.
 * Called once from WarpRuntime.ts after the class is defined.
 */
// eslint-disable-next-line max-lines-per-function -- single registration site for all wired methods
export function wireRuntime(cls: RuntimeClass): void {
  // ── Materialize methods: one-liner delegation to DI controller ────

  // eslint-disable-next-line complexity -- materialize orchestration
  wireMaterialize(cls, 'materialize', async function (this: WiringHost, options?: { receipts?: boolean; ceiling?: number | null }) {
    const wantDiff = options?.receipts !== true && this._cachedIndexTree !== null && this._cachedIndexTree !== undefined;
    const result = await this._materializeController.materialize({
      ...(options?.receipts !== undefined ? { receipts: options.receipts } : {}),
      ...(options?.ceiling !== undefined ? { ceiling: options.ceiling } : {}),
      wantDiff,
    });
    await this._onMaterialized(result);
    if (options?.receipts === true) {
      return Object.freeze({ state: createImmutableWarpState(result.state), receipts: createImmutableValue(result.receipts ?? []) });
    }
    return createImmutableWarpState(result.state);
  });

  // materializeCoordinate() returns a snapshot at a specific frontier coordinate.
  // It must NOT call _onMaterialized — that would overwrite the live graph's
  // cached state with the coordinate result, breaking any subsequent live queries.
  wireMaterialize(cls, 'materializeCoordinate', async function (this: WiringHost, options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: boolean }) {
    const result = await this._materializeController.materializeCoordinate(options);
    if (options.receipts === true) {
      return Object.freeze({ state: createImmutableWarpState(result.state), receipts: createImmutableValue(result.receipts ?? []) });
    }
    return createImmutableWarpState(result.state);
  });

  wireMaterialize(cls, 'materializeAt', async function (this: WiringHost, checkpointSha: string) {
    const result = await this._materializeController.materializeAt(checkpointSha);
    await this._onMaterialized(result);
    return createImmutableWarpState(result.state);
  });

  // eslint-disable-next-line complexity -- fallback path for mocked materialize
  wireMaterialize(cls, '_materializeGraph', async function (this: WiringHost) {
    if (!this._stateDirty && this._materializedGraph) {
      return this._materializedGraph;
    }
    const materialized = await this.materialize();
    if (this._materializedGraph) {
      return this._materializedGraph;
    }
    // Fallback: materialize() was mocked and didn't trigger onMaterialized.
    const state = this._cachedState ?? materialized;
    if (state === null || state === undefined) { return null; }
    this._cachedState = state;
    this._stateDirty = false;
    if (state.observedFrontier !== null && state.observedFrontier !== undefined) {
      this._versionVector = state.observedFrontier.clone();
    }
    const adj = this._buildAdjacency(state);
    const { computeStateHash } = await import('./services/state/StateSerializer.ts');
    const stateHash = await computeStateHash(state, { crypto: this._crypto, codec: this._codec });
    this._materializedGraph = { state, stateHash, adjacency: adj };
    return this._materializedGraph;
  });

  // eslint-disable-next-line prefer-arrow-callback -- function keyword needed for `this` binding
  wireMaterialize(cls, '_buildAdjacency', function (this: WiringHost, state: WarpState) { return buildAdjacency(state); });

  // eslint-disable-next-line complexity -- optionsOrDiff discrimination
  wireMaterialize(cls, '_setMaterializedState', async function (this: WiringHost, state: WarpState, optionsOrDiff?: PatchDiff | { diff?: PatchDiff | null }) {
    const { computeStateHash } = await import('./services/state/StateSerializer.ts');
    const stateHash = await computeStateHash(state, { crypto: this._crypto, codec: this._codec });
    const adj = this._buildAdjacency(state);
    let diff: PatchDiff | undefined;
    if (optionsOrDiff !== null && optionsOrDiff !== undefined && typeof optionsOrDiff === 'object' && 'diff' in optionsOrDiff) {
      diff = (optionsOrDiff as { diff?: PatchDiff | null }).diff ?? undefined;
    } else {
      diff = optionsOrDiff as PatchDiff | undefined;
    }
    // Cache state (no side effects -- this is the eager apply path)
    this._cachedState = state;
    this._stateDirty = false;
    this._versionVector = state.observedFrontier.clone();
    this._materializedGraph = { state, stateHash, adjacency: adj };
    this._buildViewFromResult({ state, stateHash, diff });
    return this._materializedGraph;
  });

  wireMaterialize(cls, '_buildView', () => { /* handled by onMaterialized callback */ });
  wireMaterialize(cls, '_resolveCeiling', () => null);
  wireMaterialize(cls, '_persistSeekCacheEntry', async () => { /* handled by controller */ });
  wireMaterialize(cls, '_restoreIndexFromCache', async () => { /* handled by controller */ });

  // eslint-disable-next-line complexity -- guard checks before delegation
  wireMaterialize(cls, 'verifyIndex', function (this: WiringHost, options?: { seed?: number; sampleRate?: number }) {
    if (this._logicalIndex === null || this._cachedState === null || this._viewService === null || this._viewService === undefined) {
      throw new QueryError('Cannot verify index: graph not materialized or index not built', { code: 'E_QUERY_NO_STATE' });
    }
    return this._viewService.verifyIndex({
      state: this._cachedState,
      logicalIndex: this._logicalIndex,
      ...(options !== undefined ? { options } : {}),
    });
  });

  wireMaterialize(cls, 'invalidateIndex', function (this: WiringHost) {
    this._cachedIndexTree = null;
    this._cachedViewHash = null;
  });

  // ── Checkpoint methods: direct delegation to CheckpointController ──

  wireDelegation(cls, '_checkpointController', [
    'createCheckpoint', 'syncCoverage',
    '_loadLatestCheckpoint', '_loadPatchesSince',
    '_validateMigrationBoundary', '_hasSchema1Patches',
    '_maybeRunGC', 'maybeRunGC', 'runGC', 'getGCMetrics',
  ]);

  // ── Patch methods: direct delegation to PatchController ────────────

  wireDelegation(cls, '_patchController', [
    'createPatch', 'patch', 'patchMany',
    '_nextLamport', '_loadPatchChainFromSha', '_loadWriterPatches',
    'getWriterPatches', '_onPatchCommitted', 'writer',
    '_ensureFreshState', '_readPatchBlob',
    'discoverWriters', 'discoverTicks',
    'join', '_frontierEquals',
  ]);

  // ── Strand + conflict methods ─────────────────────────────────────

  wireDelegation(cls, '_strandController', [
    'createStrand', 'braidStrand', 'getStrand', 'listStrands', 'dropStrand',
    'materializeStrand', 'getStrandPatches', 'patchesForStrand',
    'createStrandPatch', 'patchStrand',
    'queueStrandIntent', 'listStrandIntents', 'tickStrand',
    'analyzeConflicts',
  ]);

  // ── Query methods ─────────────────────────────────────────────────

  wireDelegation(cls, '_queryController', [
    'hasNode', 'getNodeProps', 'getEdgeProps', 'neighbors',
    'getStateSnapshot', 'getNodes', 'getEdges', 'getPropertyCount',
    'query', 'worldline', 'observer', 'translationCost',
    'getContentOid', 'getContentMeta', 'getContent',
    'getEdgeContentOid', 'getEdgeContentMeta', 'getEdgeContent',
    'getContentStream', 'getEdgeContentStream',
  ]);

  // ── Fork methods ──────────────────────────────────────────────────

  wireDelegation(cls, '_forkController', [
    'fork', 'createWormhole',
    '_isAncestor', '_relationToCheckpointHead', '_validatePatchAgainstCheckpoint',
  ]);

  // ── Provenance methods ────────────────────────────────────────────

  wireDelegation(cls, '_provenanceController', [
    'patchesFor', 'materializeSlice', '_computeBackwardCone',
    'loadPatchBySha', '_loadPatchBySha', '_loadPatchesBySha', '_sortPatchesCausally',
  ]);

  // ── Subscription methods ──────────────────────────────────────────

  wireDelegation(cls, '_subscriptionController', [
    'subscribe', 'watch', '_notifySubscribers',
  ]);

  // ── Comparison methods ────────────────────────────────────────────

  wireDelegation(cls, '_comparisonController', [
    'buildPatchDivergence', 'compareStrand', 'planStrandTransfer',
    'planCoordinateTransfer', 'compareCoordinates',
  ]);

  // ── Sync methods ──────────────────────────────────────────────────

  wireDelegation(cls, '_syncController', [
    'getFrontier', 'hasFrontierChanged', 'status',
    'createSyncRequest', 'processSyncRequest', 'applySyncResponse',
    'syncNeeded', 'syncWith', 'serve',
  ]);
}
