/**
 * RuntimeHost - Internal host for WARP multi-writer graph database.
 *
 * Provides a factory for opening multi-writer graphs and methods for
 * creating patches, materializing state, and managing checkpoints.
 *
 * @module domain/RuntimeHost
 * @see WARP Spec Section 11
 */

import VersionVector from './crdt/VersionVector.ts';
import GCPolicy from './services/GCPolicy.ts';
import type { AuditReceiptService } from './services/audit/AuditReceiptService.ts';
import { TemporalQuery } from './services/TemporalQuery.ts';
import {
  createImmutableTickReceiptArraySnapshot,
  createSnapshotWarpState,
} from './services/ImmutableSnapshot.ts';
import nullLogger from './utils/nullLogger.ts';
import LogicalTraversal from './services/query/LogicalTraversal.ts';
import LiveQueryReadModelProvider from './services/query/LiveQueryReadModelProvider.ts';
import SyncController from './services/controllers/SyncController.ts';
import StrandController from './services/controllers/StrandController.ts';
import ComparisonController from './services/controllers/ComparisonController.ts';
import HostBackedComparisonCoordinateSideReader from './services/controllers/HostBackedComparisonCoordinateSideReader.ts';
import HostBackedComparisonSideFinalizer from './services/controllers/HostBackedComparisonSideFinalizer.ts';
import SubscriptionController from './services/controllers/SubscriptionController.ts';
import ProvenanceController from './services/controllers/ProvenanceController.ts';
import ForkController from './services/controllers/ForkController.ts';
import QueryController from './services/controllers/QueryController.ts';
import PatchController from './services/controllers/PatchController.ts';
import CheckpointController from './services/controllers/CheckpointController.ts';
import SyncTrustGate from './services/sync/SyncTrustGate.ts';
import IntentController from './services/controllers/IntentController.ts';
import type IntentCapability from './capabilities/IntentCapability.ts';
import AuditVerifierService from './services/audit/AuditVerifierService.ts';
import { E_NO_STATE_MSG } from './services/controllers/QueryStateMessages.ts';
import type MaterializedViewService from './services/MaterializedViewService.ts';
import StateHashService from './services/state/StateHashService.ts';
import { computeStateHash } from './services/state/StateSerializer.ts';
import MaterializeController, { type MaterializeResult } from './services/controllers/MaterializeController.ts';
import RuntimePatchCollector from './warp/RuntimePatchCollector.ts';
import RuntimeDetachedFactory from './warp/RuntimeDetachedFactory.ts';
import BitmapNeighborProvider, { type LogicalIndex } from './services/index/BitmapNeighborProvider.ts';
import { cloneState } from './services/JoinReducer.ts';
import { diffStates, isEmptyDiff, type StateDiffResult } from './services/state/StateDiff.ts';
import {
  buildAdjacency,
  maxObservedLamportInState,
} from './services/controllers/MaterializeHelpers.ts';
import { selectProvenanceAfterMaterialization } from './services/controllers/MaterializeProvenancePolicy.ts';
import WarpError from './errors/WarpError.ts';
import QueryError from './errors/QueryError.ts';
import { requireCommitMessageCodec } from './services/codec/CommitMessageCodecRequirement.ts';

import type { CorePersistence } from './types/WarpPersistence.ts';
import type LoggerPort from '../ports/LoggerPort.ts';
import type CryptoPort from '../ports/CryptoPort.ts';
import type CodecPort from '../ports/CodecPort.ts';
import type TrustCryptoPort from '../ports/TrustCryptoPort.ts';
import type WarpStateCachePort from '../ports/WarpStateCachePort.ts';
import type AssetStoragePort from '../ports/AssetStoragePort.ts';
import type AuditLogPort from '../ports/AuditLogPort.ts';
import type PatchJournalPort from '../ports/PatchJournalPort.ts';
import type StrandStorePort from '../ports/StrandStorePort.ts';
import type CommitMessageCodecPort from '../ports/CommitMessageCodecPort.ts';
import type CheckpointStorePort from '../ports/CheckpointStorePort.ts';
import type IndexStorePort from '../ports/IndexStorePort.ts';
import type IntentStorePort from '../ports/IntentStorePort.ts';
import type RuntimeStorageProviderPort from '../ports/RuntimeStorageProviderPort.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';
import type WarpState from './services/state/WarpState.ts';
import type SnapshotWarpState from './services/snapshot/SnapshotWarpState.ts';
import type { ProvenanceIndex } from './services/provenance/ProvenanceIndex.ts';
import type Patch from './types/Patch.ts';
import type { PatchDiff } from './types/PatchDiff.ts';
import type { TickReceipt } from './types/TickReceipt.ts';
import type PropertyIndexReader from './services/index/PropertyIndexReader.ts';
import type QueryCapability from './capabilities/QueryCapability.ts';
import type AdjacencyMap from './capabilities/AdjacencyMap.ts';

import {
  normalizeTrustConfig,
  type TrustMode,
  type NormalizedTrustConfig,
} from './runtimeHelpers.ts';
import {
  resolveRuntimeHostConstructionOptions,
  type RuntimeHostOpenInput,
  type RuntimeHostConstructionOptions,
} from './warp/RuntimeHostBoot.ts';

import type { NeighborEdge } from '../ports/NeighborProviderPort.ts';

type AdjacencyMapShape = {
  outgoing: Map<string, readonly NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
  incoming: Map<string, readonly NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
};

export type MaterializedGraph = {
  state: WarpState;
  stateHash: string;
  adjacency: AdjacencyMapShape;
  provider?: BitmapNeighborProvider;
};

type MaterializeReceiptsResult = {
  state: SnapshotWarpState;
  receipts: readonly TickReceipt[];
};

type SnapshotMaterializeOptions = {
  receipts?: boolean;
  ceiling?: number | null;
};

function wantsReceipts(options: SnapshotMaterializeOptions | undefined): boolean {
  return options?.receipts === true;
}

function materializeControllerOptions(
  options: SnapshotMaterializeOptions | undefined,
  wantDiff: boolean,
): Parameters<MaterializeController['materialize']>[0] {
  const controllerOptions: Parameters<MaterializeController['materialize']>[0] = { wantDiff };
  if (options?.receipts !== undefined) {
    controllerOptions.receipts = options.receipts;
  }
  if (options?.ceiling !== undefined) {
    controllerOptions.ceiling = options.ceiling;
  }
  return controllerOptions;
}

function materializeReceiptsResult(result: MaterializeResult): MaterializeReceiptsResult {
  return Object.freeze({
    state: createSnapshotWarpState(result.state),
    receipts: createImmutableTickReceiptArraySnapshot(result.receipts ?? []),
  });
}

function materializeSnapshotResult(
  result: MaterializeResult,
  includeReceipts: boolean,
): SnapshotWarpState | MaterializeReceiptsResult {
  return includeReceipts
    ? materializeReceiptsResult(result)
    : createSnapshotWarpState(result.state);
}

function canUseCachedMaterializedGraph(
  options: { ceiling?: number | null },
  stateDirty: boolean,
  materializedGraph: MaterializedGraph | null,
): materializedGraph is MaterializedGraph {
  return options.ceiling === undefined && !stateDirty && materializedGraph !== null;
}

function resolveMaterializedStateDiff(
  optionsOrDiff: PatchDiff | { diff?: PatchDiff | null } | undefined,
): PatchDiff | undefined {
  if (optionsOrDiff === null || optionsOrDiff === undefined) {
    return undefined;
  }
  if ('edgesAdded' in optionsOrDiff) {
    return optionsOrDiff;
  }
  return optionsOrDiff.diff ?? undefined;
}

type Subscriber = {
  onChange: (diff: StateDiffResult) => void;
  onError?: (error: Error) => void;
  pendingReplay?: boolean;
};

// ── Constructor options ──────────────────────────────────────────────

/**
 * RuntimeHost class for interacting with a WARP multi-writer graph.
 */
export default class RuntimeHost {
  _persistence: CorePersistence;
  _runtimeStorage: RuntimeStorageProviderPort;
  _graphName: string;
  _writerId: string;
  _versionVector: VersionVector;
  _cachedState: WarpState | null;
  _stateDirty: boolean;
  _gcPolicy: GCPolicy;
  _lastGCLamport: number;
  _patchesSinceGC: number;
  _patchesSinceCheckpoint: number;
  _maxObservedLamport: number;
  _checkpointPolicy: { every: number } | null;
  _checkpointing: boolean;
  _autoMaterialize: boolean;
  traverse: LogicalTraversal;
  _materializedGraph: MaterializedGraph | null;
  _lastFrontier: Map<string, string> | null;
  _logger: LoggerPort | null;
  _crypto: CryptoPort;
  _codec: CodecPort;
  _trustCrypto: TrustCryptoPort | null;
  _onDeleteWithData: 'reject' | 'cascade' | 'warn';
  _subscribers: Subscriber[];
  _lastNotifiedState: WarpState | null;
  _provenanceIndex: ProvenanceIndex | null;
  _temporalQuery: TemporalQuery | null;
  _seekCeiling: number | null;
  _cachedCeiling: number | null;
  _cachedFrontier: Map<string, string> | null;
  _stateCache: WarpStateCachePort | null;
  _assetStorage: AssetStoragePort;
  _auditLog: AuditLogPort;
  _commitMessageCodec: CommitMessageCodecPort;
  _patchInProgress: boolean;
  _provenanceDegraded: boolean;
  _audit: boolean;
  _auditSkipCount: number;
  _trustConfig: NormalizedTrustConfig;
  _createSyncTrustGate: (override?: { mode?: TrustMode; pin?: string | null } | null) => SyncTrustGate | null;
  _syncController: SyncController;
  _intentController: IntentController;
  _strandController: StrandController;
  _comparisonController: ComparisonController;
  _subscriptionController: SubscriptionController;
  _provenanceController: ProvenanceController;
  _forkController: ForkController;
  _queryController: QueryController;
  _patchController: PatchController;
  _checkpointController: CheckpointController;
  _materializeController: MaterializeController;
  _viewService: MaterializedViewService;
  _logicalIndex: LogicalIndex | null;
  _propertyReader: PropertyIndexReader | null;
  _cachedViewHash: string | null;
  _cachedIndexTree: Record<string, Uint8Array> | null;
  _indexDegraded: boolean;
  _effectPipeline: EffectPipeline | null;
  _patchJournal: PatchJournalPort;
  _strandStore: StrandStorePort;
  _checkpointStore: CheckpointStorePort;
  _indexStore: IndexStorePort;
  _intentStore: IntentStorePort;
  _stateHashService: StateHashService | null;
  _auditService: AuditReceiptService | null;

  /**
   * Constructs a RuntimeHost instance with injected dependencies and configuration.
   * @private
   */
  // TODO(OG): split constructor responsibilities; legacy hotspot kept explicit until the API redesign cycle.
  // eslint-disable-next-line max-lines-per-function, complexity
  constructor(options: RuntimeHostConstructionOptions) {
    const {
      persistence,
      runtimeStorage,
      graphName,
      writerId,
      gcPolicy = {},
      checkpointPolicy,
      autoMaterialize = true,
      onDeleteWithData = 'warn',
      logger,
      crypto,
      codec,
      trustCrypto,
      stateCache,
      audit = false,
      assetStorage,
      auditLog,
      commitMessageCodec,
      trust,
      patchJournal,
      strandStore,
      checkpointStore,
      indexStore,
      intentStore,
      viewService,
      stateHashService,
      auditService,
      effectPipeline,
      openStateSession,
      scheduler,
    } = options;

    this._persistence = persistence;
    this._runtimeStorage = runtimeStorage;
    this._graphName = graphName;
    this._writerId = writerId;
    this._versionVector = VersionVector.empty();
    this._cachedState = null;
    this._stateDirty = false;
    this._gcPolicy = new GCPolicy({ ...GCPolicy.DEFAULT, ...gcPolicy });
    this._lastGCLamport = 0;
    this._patchesSinceGC = 0;
    this._patchesSinceCheckpoint = 0;
    this._maxObservedLamport = 0;
    this._checkpointPolicy = checkpointPolicy || null;
    this._checkpointing = false;
    this._autoMaterialize = autoMaterialize;
    this._materializedGraph = null;
    this._lastFrontier = null;
    this._logger = logger || null;
    this._crypto = crypto;
    this._codec = codec;
    this._trustCrypto = trustCrypto ?? null;
    this._onDeleteWithData = onDeleteWithData;
    this._subscribers = [];
    this._lastNotifiedState = null;
    this._provenanceIndex = null;
    this._temporalQuery = null;
    this._seekCeiling = null;
    this._cachedCeiling = null;
    this._cachedFrontier = null;
    this._stateCache = stateCache || null;
    this._assetStorage = assetStorage;
    this._intentStore = intentStore;
    this._auditLog = auditLog;
    this._commitMessageCodec = requireCommitMessageCodec(commitMessageCodec);
    this._patchInProgress = false;
    this._provenanceDegraded = false;
    this._audit = !!audit;
    this._auditSkipCount = 0;
    this._trustConfig = normalizeTrustConfig(trust);
    this._stateHashService = stateHashService || null;

    this._createSyncTrustGate = (override) => {
      const config = normalizeTrustConfig(override ?? this._trustConfig);
      if (config.mode === 'off') {
        return null;
      }
      return this._buildTrustGate(config);
    };

    const trustGate = this._createSyncTrustGate() || undefined;
    this._syncController = new SyncController(this, {
      ...(trustGate !== undefined ? { trustGate } : {}),
    });
    this._intentController = new IntentController(this);
    this._strandController = new StrandController(this);
    this._comparisonController = new ComparisonController({
      host: this,
      selectorContext: {
        coordinateReader: new HostBackedComparisonCoordinateSideReader(this),
        sideFinalizer: new HostBackedComparisonSideFinalizer(this),
        strandGraph: this,
      },
    });
    this._subscriptionController = new SubscriptionController(
      this,
      scheduler === undefined ? undefined : { scheduler },
    );
    this._provenanceController = new ProvenanceController(this);
    this._forkController = new ForkController(this);
    this._queryController = new QueryController({
      hostGraph: this,
      graphCloner: new RuntimeDetachedFactory(this, async (detachedOptions) => await RuntimeHost.open(detachedOptions)),
      hashState: async (state) => {
        if (this._stateHashService !== null) {
          return await this._stateHashService.compute(state);
        }
        return await new StateHashService({
          crypto: this._crypto,
          codec: this._codec,
        }).compute(state);
      },
    });
    this.traverse = new LogicalTraversal(new LiveQueryReadModelProvider({
      ensureFreshState: async () => { await this._ensureFreshState(); },
      currentState: () => this._cachedState,
      stateHash: async (state) => {
        if (this._stateHashService !== null) {
          return await this._stateHashService.compute(state);
        }
        return await new StateHashService({
          crypto: this._crypto,
          codec: this._codec,
        }).compute(state);
      },
      neighborProvider: () => this._materializedGraph?.provider ?? null,
    }));
    this._patchController = new PatchController(this);
    this._checkpointController = new CheckpointController(this);
    this._materializeController = new MaterializeController({
      logger: this._logger ?? nullLogger,
      codec: this._codec,
      crypto: this._crypto,
      persistence: this._persistence,
      checkpointStore,
      getStateCache: () => this._stateCache ?? null,
      ...(openStateSession === undefined ? {} : { openStateSession }),
      patches: new RuntimePatchCollector(this),
      graphCloner: new RuntimeDetachedFactory(this, async (detachedOptions) => await RuntimeHost.open(detachedOptions)),
      graphName: this._graphName,
    });
    this._viewService = viewService;
    this._logicalIndex = null;
    this._propertyReader = null;
    this._cachedViewHash = null;
    this._cachedIndexTree = null;
    this._indexDegraded = false;
    this._effectPipeline = effectPipeline || null;
    this._patchJournal = patchJournal;
    this._strandStore = strandStore;
    this._checkpointStore = checkpointStore;
    this._indexStore = indexStore;
    this._auditService = auditService || null;
  }

  /**
   * Advanced substrate replay primitive over the live frontier.
   */
  materialize(options: { receipts: true; ceiling?: number | null }): Promise<MaterializeReceiptsResult>;
  materialize(options?: { receipts?: false; ceiling?: number | null }): Promise<SnapshotWarpState>;
  async materialize(options?: { receipts?: boolean; ceiling?: number | null }): Promise<SnapshotWarpState | MaterializeReceiptsResult> {
    const wantDiff = options?.receipts !== true && this._cachedIndexTree !== null;
    const result = await this._materializeController.materialize(
      materializeControllerOptions(options, wantDiff),
    );
    await this._onMaterialized(result);
    return materializeSnapshotResult(result, wantsReceipts(options));
  }

  /**
   * Advanced substrate replay primitive against an explicit pinned frontier.
   */
  materializeCoordinate(
    options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts: true },
  ): Promise<MaterializeReceiptsResult>;
  materializeCoordinate(
    options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: false },
  ): Promise<SnapshotWarpState>;
  async materializeCoordinate(
    options: Parameters<MaterializeController['materializeCoordinate']>[0],
  ): Promise<SnapshotWarpState | MaterializeReceiptsResult> {
    const result = await this._materializeController.materializeCoordinate(options);
    return materializeSnapshotResult(result, wantsReceipts(options));
  }

  async materializeAt(checkpointSha: string): Promise<SnapshotWarpState> {
    const result = await this._materializeController.materializeAt(checkpointSha);
    await this._onMaterialized(result);
    return createSnapshotWarpState(result.state);
  }

  async _materializeGraph(options: { ceiling?: number | null } = {}): Promise<MaterializedGraph> {
    if (canUseCachedMaterializedGraph(options, this._stateDirty, this._materializedGraph)) {
      return this._materializedGraph;
    }
    const result = await this._materializeController.materialize({
      ...(options.ceiling !== undefined ? { ceiling: options.ceiling } : {}),
      wantDiff: this._cachedIndexTree !== null,
    });
    await this._onMaterialized(result);
    if (this._materializedGraph !== null) {
      return this._materializedGraph;
    }
    return await this._materializedGraphFromCachedState();
  }

  async _materializeCoordinateGraph(
    options: Parameters<MaterializeController['materializeCoordinate']>[0],
  ): Promise<MaterializedGraph> {
    const result = await this._materializeController.materializeCoordinate(options);
    return await this._materializedGraphFromState(result.state);
  }

  async _materializeStrandGraph(
    strandId: string,
    options: { ceiling?: number | null } = {},
  ): Promise<MaterializedGraph> {
    const result = await this._strandController._materializeStrandRead(strandId, options);
    return await this._materializedGraphFromState(result.state);
  }

  async _materializedGraphFromState(state: WarpState): Promise<MaterializedGraph> {
    const adjacency = this._buildAdjacency(state);
    const stateHash = await computeStateHash(state, { crypto: this._crypto, codec: this._codec });
    return { state, stateHash, adjacency };
  }

  async _materializedGraphFromCachedState(): Promise<MaterializedGraph> {
    const state = this._cachedState;
    if (state === null) {
      throw new QueryError(E_NO_STATE_MSG, {
        code: 'E_NO_STATE',
      });
    }
    this._cachedState = state;
    this._stateDirty = false;
    this._versionVector = state.observedFrontier.clone();
    this._materializedGraph = await this._materializedGraphFromState(state);
    return this._materializedGraph;
  }

  _buildAdjacency(state: WarpState): AdjacencyMap {
    return buildAdjacency(state);
  }

  async _setMaterializedState(
    state: WarpState,
    optionsOrDiff?: PatchDiff | { diff?: PatchDiff | null },
  ): Promise<MaterializedGraph> {
    const stateHash = await computeStateHash(state, { crypto: this._crypto, codec: this._codec });
    const adjacency = this._buildAdjacency(state);
    const diff = resolveMaterializedStateDiff(optionsOrDiff);
    this._cachedState = state;
    this._stateDirty = false;
    this._versionVector = state.observedFrontier.clone();
    this._materializedGraph = { state, stateHash, adjacency };
    this._buildViewFromResult({ state, stateHash, diff });
    this._notifyAfterMaterialize(state);
    return this._materializedGraph;
  }

  verifyIndex(options?: { seed?: number; sampleRate?: number }) {
    if (this._logicalIndex === null || this._cachedState === null || this._viewService === null) {
      throw new QueryError('Cannot verify index: graph not materialized or index not built', { code: 'E_QUERY_NO_STATE' });
    }
    return this._viewService.verifyIndex({
      state: this._cachedState,
      logicalIndex: this._logicalIndex,
      ...(options !== undefined ? { options } : {}),
    });
  }

  invalidateIndex(): void {
    this._cachedIndexTree = null;
    this._cachedViewHash = null;
  }

  /**
   * Inspection API: reads one node from the current materialized state.
   *
   * Prefer `worldline().query()` for stable product reads, or
   * `worldline().observer(...).query()` when you need a filtered aperture.
   */
  getNodeProps: QueryCapability['getNodeProps'] = (...args) => this._queryController.getNodeProps(...args);

  /**
   * Inspection API: walks visible neighbors from the current materialized state.
   *
   * For application-facing reads, prefer `Observer` query/traverse helpers over direct materialization.
   */
  neighbors: QueryCapability['neighbors'] = (...args) => this._queryController.neighbors(...args);

  /**
   * Inspection API: enumerates all visible nodes in the current materialized state.
   *
   * Prefer `worldline().query()` for stable product reads, or
   * `worldline().observer(...).query()` when you need a filtered aperture.
   */
  getNodes: QueryCapability['getNodes'] = (...args) => this._queryController.getNodes(...args);

  /**
   * Inspection API: enumerates all visible edges in the current materialized state.
   */
  getEdges: QueryCapability['getEdges'] = (...args) => this._queryController.getEdges(...args);

  /**
   * Advanced substrate replay primitive for this pinned source.
   */
  materializeSlice: ProvenanceController['materializeSlice'] = (...args) => this._provenanceController.materializeSlice(...args);

  /**
   * Advanced substrate replay primitive for a strand's pinned base observation plus overlay.
   */
  materializeStrand(
    strandId: string,
    options: { receipts: true; ceiling?: number | null },
  ): Promise<MaterializeReceiptsResult>;
  materializeStrand(
    strandId: string,
    options?: { receipts?: false; ceiling?: number | null },
  ): Promise<SnapshotWarpState>;
  async materializeStrand(
    strandId: string,
    options?: { receipts?: boolean; ceiling?: number | null },
  ): Promise<SnapshotWarpState | MaterializeReceiptsResult> {
    const result = await this._strandController.materializeStrand(strandId, options);
    if (options?.receipts === true) {
      if ('state' in result) {
        return result;
      }
      throw new WarpError('strand materialization requested receipts but returned plain state', 'E_STRAND_RECEIPTS_MISSING');
    }
    if ('state' in result) {
      throw new WarpError('strand materialization returned receipts without requesting them', 'E_STRAND_RECEIPTS_UNEXPECTED');
    }
    return result;
  }

  createCheckpoint: CheckpointController['createCheckpoint'] = (...args) => this._checkpointController.createCheckpoint(...args);
  _readCheckpointSha: CheckpointController['_readCheckpointSha'] = (...args) => this._checkpointController._readCheckpointSha(...args);
  syncCoverage: CheckpointController['syncCoverage'] = (...args) => this._checkpointController.syncCoverage(...args);
  _loadLatestCheckpoint: CheckpointController['_loadLatestCheckpoint'] = (...args) => this._checkpointController._loadLatestCheckpoint(...args);
  _loadPatchesSince: CheckpointController['_loadPatchesSince'] = (...args) => this._checkpointController._loadPatchesSince(...args);
  _validateMigrationBoundary: CheckpointController['_validateMigrationBoundary'] = (...args) => this._checkpointController._validateMigrationBoundary(...args);
  _hasSchema1Patches: CheckpointController['_hasSchema1Patches'] = (...args) => this._checkpointController._hasSchema1Patches(...args);
  _maybeRunGC: CheckpointController['_maybeRunGC'] = (...args) => this._checkpointController._maybeRunGC(...args);
  maybeRunGC: CheckpointController['maybeRunGC'] = (...args) => this._checkpointController.maybeRunGC(...args);
  runGC: CheckpointController['runGC'] = (...args) => this._checkpointController.runGC(...args);
  getGCMetrics: CheckpointController['getGCMetrics'] = (...args) => this._checkpointController.getGCMetrics(...args);

  createPatch: PatchController['createPatch'] = (...args) => this._patchController.createPatch(...args);
  patch: PatchController['patch'] = (...args) => this._patchController.patch(...args);
  patchWithEvidence: PatchController['patchWithEvidence'] = (...args) =>
    this._patchController.patchWithEvidence(...args);
  patchMany: PatchController['patchMany'] = (...args) => this._patchController.patchMany(...args);
  _nextLamport: PatchController['_nextLamport'] = (...args) => this._patchController._nextLamport(...args);
  _loadPatchChainFromSha: PatchController['_loadPatchChainFromSha'] = (...args) => this._patchController._loadPatchChainFromSha(...args);
  _loadWriterPatches: PatchController['_loadWriterPatches'] = (...args) => this._patchController._loadWriterPatches(...args);
  getWriterPatches: PatchController['getWriterPatches'] = (...args) => this._patchController.getWriterPatches(...args);
  _onPatchCommitted: PatchController['_onPatchCommitted'] = (...args) => this._patchController._onPatchCommitted(...args);
  writer: PatchController['writer'] = (...args) => this._patchController.writer(...args);
  _ensureFreshState: PatchController['_ensureFreshState'] = (...args) => this._patchController._ensureFreshState(...args);
  _readPatch: PatchController['_readPatch'] = (...args) => this._patchController._readPatch(...args);
  discoverWriters: PatchController['discoverWriters'] = (...args) => this._patchController.discoverWriters(...args);
  discoverTicks: PatchController['discoverTicks'] = (...args) => this._patchController.discoverTicks(...args);
  join: PatchController['join'] = (...args) => this._patchController.join(...args);
  _frontierEquals: PatchController['_frontierEquals'] = (...args) => this._patchController._frontierEquals(...args);

  createStrand: StrandController['createStrand'] = (...args) => this._strandController.createStrand(...args);
  braidStrand: StrandController['braidStrand'] = (...args) => this._strandController.braidStrand(...args);
  getStrand: StrandController['getStrand'] = (...args) => this._strandController.getStrand(...args);
  listStrands: StrandController['listStrands'] = (...args) => this._strandController.listStrands(...args);
  dropStrand: StrandController['dropStrand'] = (...args) => this._strandController.dropStrand(...args);
  getStrandPatches: StrandController['getStrandPatches'] = (...args) => this._strandController.getStrandPatches(...args);
  patchesForStrand: StrandController['patchesForStrand'] = (...args) => this._strandController.patchesForStrand(...args);
  createStrandPatch: StrandController['createStrandPatch'] = (...args) => this._strandController.createStrandPatch(...args);
  patchStrand: StrandController['patchStrand'] = (...args) => this._strandController.patchStrand(...args);
  patchStrandWithEvidence: StrandController['patchStrandWithEvidence'] = (...args) =>
    this._strandController.patchStrandWithEvidence(...args);
  queueStrandIntent: StrandController['queueStrandIntent'] = (...args) => this._strandController.queueStrandIntent(...args);
  async listStrandIntents(strandId: string) {
    return [...await this._strandController.listStrandIntents(strandId)];
  }
  tickStrand: StrandController['tickStrand'] = (...args) => this._strandController.tickStrand(...args);
  analyzeConflicts: StrandController['analyzeConflicts'] = (...args) => this._strandController.analyzeConflicts(...args);

  admitIntent: IntentCapability['admitIntent'] = (...args) => this._intentController.admitIntent(...args);
  queueIntent: IntentCapability['queueIntent'] = (...args) => this._intentController.queueIntent(...args);
  getWriterIntents: IntentCapability['getWriterIntents'] = (...args) => this._intentController.getWriterIntents(...args);

  hasNode: QueryCapability['hasNode'] = (...args) => this._queryController.hasNode(...args);
  getEdgeProps: QueryCapability['getEdgeProps'] = (...args) => this._queryController.getEdgeProps(...args);
  getStateSnapshot: QueryCapability['getStateSnapshot'] = (...args) => this._queryController.getStateSnapshot(...args);
  getPropertyCount: QueryCapability['getPropertyCount'] = (...args) => this._queryController.getPropertyCount(...args);
  query: QueryCapability['query'] = (...args) => this._queryController.query(...args);
  worldline: QueryCapability['worldline'] = (...args) => this._queryController.worldline(...args);
  observer: QueryCapability['observer'] = (...args) => this._queryController.observer(...args);
  translationCost: QueryCapability['translationCost'] = (...args) => this._queryController.translationCost(...args);
  getContentHandle: QueryCapability['getContentHandle'] = (...args) => this._queryController.getContentHandle(...args);
  getContentMeta: QueryCapability['getContentMeta'] = (...args) => this._queryController.getContentMeta(...args);
  getContent: QueryCapability['getContent'] = (...args) => this._queryController.getContent(...args);
  getEdgeContentHandle: QueryCapability['getEdgeContentHandle'] = (...args) => this._queryController.getEdgeContentHandle(...args);
  getEdgeContentMeta: QueryCapability['getEdgeContentMeta'] = (...args) => this._queryController.getEdgeContentMeta(...args);
  getEdgeContent: QueryCapability['getEdgeContent'] = (...args) => this._queryController.getEdgeContent(...args);
  getContentStream: QueryCapability['getContentStream'] = (...args) => this._queryController.getContentStream(...args);
  getEdgeContentStream: QueryCapability['getEdgeContentStream'] = (...args) => this._queryController.getEdgeContentStream(...args);

  fork: ForkController['fork'] = (...args) => this._forkController.fork(...args);
  createWormhole: ForkController['createWormhole'] = (...args) => this._forkController.createWormhole(...args);
  _isAncestor: ForkController['_isAncestor'] = (...args) => this._forkController._isAncestor(...args);
  _relationToCheckpointHead: ForkController['_relationToCheckpointHead'] = (...args) => this._forkController._relationToCheckpointHead(...args);
  _validatePatchAgainstCheckpoint: ForkController['_validatePatchAgainstCheckpoint'] = (...args) => this._forkController._validatePatchAgainstCheckpoint(...args);

  patchesFor: ProvenanceController['patchesFor'] = (...args) => this._provenanceController.patchesFor(...args);
  _computeBackwardCone: ProvenanceController['_computeBackwardCone'] = (...args) => this._provenanceController._computeBackwardCone(...args);
  loadPatchBySha: ProvenanceController['loadPatchBySha'] = (...args) => this._provenanceController.loadPatchBySha(...args);
  _loadPatchBySha: ProvenanceController['_loadPatchBySha'] = (...args) => this._provenanceController._loadPatchBySha(...args);
  _loadPatchesBySha: ProvenanceController['_loadPatchesBySha'] = (...args) => this._provenanceController._loadPatchesBySha(...args);
  _sortPatchesCausally: ProvenanceController['_sortPatchesCausally'] = (...args) => this._provenanceController._sortPatchesCausally(...args);

  subscribe: SubscriptionController['subscribe'] = (...args) => this._subscriptionController.subscribe(...args);
  watch: SubscriptionController['watch'] = (...args) => this._subscriptionController.watch(...args);
  _notifySubscribers: SubscriptionController['_notifySubscribers'] = (...args) => this._subscriptionController._notifySubscribers(...args);

  buildPatchDivergence: ComparisonController['buildPatchDivergence'] = (...args) => this._comparisonController.buildPatchDivergence(...args);
  compareStrand: ComparisonController['compareStrand'] = (...args) => this._comparisonController.compareStrand(...args);
  planStrandTransfer: ComparisonController['planStrandTransfer'] = (...args) => this._comparisonController.planStrandTransfer(...args);
  planCoordinateTransfer: ComparisonController['planCoordinateTransfer'] = (...args) => this._comparisonController.planCoordinateTransfer(...args);
  compareCoordinates: ComparisonController['compareCoordinates'] = (...args) => this._comparisonController.compareCoordinates(...args);
  diff: ComparisonController['diff'] = (...args) => this._comparisonController.diff(...args);

  getFrontier: SyncController['getFrontier'] = (...args) => this._syncController.getFrontier(...args);
  hasFrontierChanged: SyncController['hasFrontierChanged'] = (...args) => this._syncController.hasFrontierChanged(...args);
  status: SyncController['status'] = (...args) => this._syncController.status(...args);
  createSyncRequest: SyncController['createSyncRequest'] = (...args) => this._syncController.createSyncRequest(...args);
  processSyncRequest: SyncController['processSyncRequest'] = (...args) => this._syncController.processSyncRequest(...args);
  applySyncResponse: SyncController['applySyncResponse'] = (...args) => this._syncController.applySyncResponse(...args);
  syncNeeded: SyncController['syncNeeded'] = (...args) => this._syncController.syncNeeded(...args);
  syncWith: SyncController['syncWith'] = (...args) => this._syncController.syncWith(...args);
  serve: SyncController['serve'] = (...args) => this._syncController.serve(...args);

  /**
   * Builds a SyncTrustGate from a resolved trust configuration.
   */
  _buildTrustGate(config: NormalizedTrustConfig): SyncTrustGate {
    const verifier = new AuditVerifierService({
      auditLog: this._auditLog,
      codec: this._codec,
      ...(this._trustCrypto === null ? {} : { trustCrypto: this._trustCrypto }),
      ...(this._logger ? { logger: this._logger } : {}),
    });

    return new SyncTrustGate({
      trustMode: config.mode,
      ...(this._logger ? { logger: this._logger } : {}),
      trustEvaluator: {
        evaluateWriters: async (writerIds: string[]) => {
          const pin = (typeof config.pin === 'string' && config.pin.length > 0) ? config.pin : undefined;
          const assessment = await verifier.evaluateTrust(this._graphName, {
            ...(pin !== undefined ? { pin } : {}),
            mode: config.mode === 'enforce' ? 'enforce' : 'warn',
            writerIds,
          });
          return this._extractTrustedWriters(assessment);
        },
      },
    });
  }

  /**
   * Extracts trusted writer IDs from a trust assessment result.
   */
  _extractTrustedWriters(assessment: {
    trust: { explanations: ReadonlyArray<{ trusted: boolean; writerId: string }> };
  }): { trusted: Set<string> } {
    return {
      trusted: new Set(
        assessment.trust.explanations
          .filter((explanation) => explanation.trusted)
          .map((explanation) => explanation.writerId),
      ),
    };
  }

  /**
   * Extracts the maximum Lamport timestamp from a WarpState.
   */
  _maxLamportFromState(state: WarpState): number {
    return maxObservedLamportInState(state);
  }

  /**
   * Opens a multi-writer graph.
   *
   * @example
   * const graph = await RuntimeHost.open({
   *   persistence: gitAdapter,
   *   graphName: 'events',
   *   writerId: 'node-1'
   * });
   */
  static async open(options: RuntimeHostOpenInput): Promise<RuntimeHost> {
    return await openRuntimeHost(options);
  }

  /** Gets the graph name. */
  get graphName(): string {
    return this._graphName;
  }

  /** Gets the writer ID. */
  get writerId(): string {
    return this._writerId;
  }

  /** Gets the persistence adapter. */
  get persistence(): CorePersistence {
    return this._persistence;
  }

  /** Gets the onDeleteWithData policy. */
  get onDeleteWithData(): 'reject' | 'cascade' | 'warn' {
    return this._onDeleteWithData;
  }

  /** Gets the current GC policy. */
  get gcPolicy(): GCPolicy {
    return this._gcPolicy;
  }

  /**
   * Gets the temporal query interface for CTL*-style temporal operators.
   *
   * Returns a TemporalQuery instance that provides `always` and `eventually`
   * operators for evaluating predicates across the graph's history.
   */
  get temporal(): TemporalQuery {
    if (!this._temporalQuery) {
      this._temporalQuery = new TemporalQuery({
        loadAllPatches: async () => {
          const writerIds = await this.discoverWriters();
          const allPatches: Array<{ patch: Patch; sha: string }> = [];
          for (const wid of writerIds) {
            const writerPatches = await this._loadWriterPatches(wid);
            allPatches.push(...writerPatches);
          }
          return this._sortPatchesCausally(allPatches);
        },
        loadCheckpoint: async () => {
          const ck = await this._loadLatestCheckpoint();
          if (!ck) { return null; }
          return { state: ck.state, maxLamport: this._maxLamportFromState(ck.state) };
        },
      });
    }
    return this._temporalQuery;
  }

  /**
   * Gets the current provenance index for this graph.
   */
  get provenanceIndex(): ProvenanceIndex | null {
    return this._provenanceIndex;
  }

  /**
   * Callback invoked by MaterializeController after every materialization.
   * Applies all host-level side effects: state caching, index build,
   * subscriber notification, GC, auto-checkpoint, timing.
   */
  // eslint-disable-next-line max-lines-per-function -- side-effect callback must apply all post-materialize state in one method
  async _onMaterialized(result: MaterializeResult): Promise<void> {
    const provenance = selectProvenanceAfterMaterialization({
      index: this._provenanceIndex,
      degraded: this._provenanceDegraded,
      stateHash: this._materializedGraph?.stateHash,
      frontier: this._cachedFrontier,
      ceiling: this._cachedCeiling,
    }, result);

    // 1. Cache state + lamport
    this._cachedState = result.state;
    this._stateDirty = false;
    this._versionVector = result.state.observedFrontier.clone();
    if (result.maxObservedLamport > this._maxObservedLamport) {
      this._maxObservedLamport = result.maxObservedLamport;
    }
    this._materializedGraph = {
      state: result.state,
      stateHash: result.stateHash,
      adjacency: {
        outgoing: new Map(result.adjacency.outgoing),
        incoming: new Map(result.adjacency.incoming),
      },
    };
    this._provenanceIndex = provenance.index;
    this._provenanceDegraded = provenance.degraded;
    this._cachedCeiling = result.ceiling;
    this._cachedFrontier = result.frontier ? new Map(result.frontier) : null;

    // 2. Build view (index)
    this._buildViewFromResult(result);

    // 3. Side effects (live frontier only)
    if (result.ceiling === null) {
      this._lastFrontier = await this.getFrontier();
      this._patchesSinceCheckpoint = result.patchCount;
      await this._tryAutoCheckpoint(result.patchCount);
      this._maybeRunGC(result.state);
    }

    // 4. Notify subscribers
    this._notifyAfterMaterialize(result.state);
  }

  /**
   * Builds bitmap index from materialized state.
   */
  // eslint-disable-next-line complexity -- index build + fallback + provider attach
  _buildViewFromResult(result: { state: WarpState; stateHash: string; diff?: PatchDiff | null | undefined }): void {
    if (this._cachedViewHash === result.stateHash) { return; }
    try {
      const viewResult = result.diff && this._cachedIndexTree
        ? this._viewService.applyDiff({ existingTree: this._cachedIndexTree, diff: result.diff, state: result.state })
        : this._viewService.build(result.state);
      this._logicalIndex = viewResult.logicalIndex;
      this._propertyReader = viewResult.propertyReader;
      this._cachedViewHash = result.stateHash;
      this._cachedIndexTree = viewResult.tree;
      this._indexDegraded = false;
      if (this._materializedGraph) {
        this._materializedGraph.provider = new BitmapNeighborProvider({ logicalIndex: viewResult.logicalIndex });
      }
    } catch (err) {
      this._indexDegraded = true;
      this._logicalIndex = null;
      this._propertyReader = null;
      this._cachedIndexTree = null;
      this._logger?.warn('index build failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async _tryAutoCheckpoint(patchCount: number): Promise<void> {
    if (!this._checkpointPolicy || this._checkpointing) { return; }
    if (patchCount < this._checkpointPolicy.every) { return; }
    try { await this.createCheckpoint(); this._patchesSinceCheckpoint = 0; } catch { /* non-fatal */ }
  }

  _notifyAfterMaterialize(state: WarpState): void {
    if (this._subscribers.length > 0) {
      const hasPendingReplay = this._subscribers.some((s) => s.pendingReplay === true);
      const delta = diffStates(this._lastNotifiedState, state);
      if (!isEmptyDiff(delta) || hasPendingReplay) {
        this._notifySubscribers(delta, state);
      }
    }
    this._lastNotifiedState = cloneState(state);
  }
}

export async function openRuntimeHost(options: RuntimeHostOpenInput): Promise<RuntimeHost> {
  const { options: resolvedOptions } = await resolveRuntimeHostConstructionOptions(options);
  const graph = new RuntimeHost(resolvedOptions);
  await graph._validateMigrationBoundary();
  return graph;
}
