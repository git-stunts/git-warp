/**
 * WarpRuntime - Main API class for WARP multi-writer graph database.
 *
 * Provides a factory for opening multi-writer graphs and methods for
 * creating patches, materializing state, and managing checkpoints.
 *
 * @module domain/WarpRuntime
 * @see WARP Spec Section 11
 */

import { validateGraphName, validateWriterId } from './utils/RefLayout.ts';
import VersionVector from './crdt/VersionVector.ts';
import GCPolicy, { type GCPolicyConfig } from './services/GCPolicy.ts';
import { AuditReceiptService } from './services/audit/AuditReceiptService.ts';
import { TemporalQuery } from './services/TemporalQuery.ts';
import defaultCodec from './utils/defaultCodec.ts';
import defaultCrypto from './utils/defaultCrypto.ts';
import nullLogger from './utils/nullLogger.ts';
import LogicalTraversal from './services/query/LogicalTraversal.ts';
import LRUCache from './utils/LRUCache.ts';
import SyncController from './services/controllers/SyncController.ts';
import StrandController from './services/controllers/StrandController.ts';
import ComparisonController from './services/controllers/ComparisonController.ts';
import SubscriptionController from './services/controllers/SubscriptionController.ts';
import ProvenanceController from './services/controllers/ProvenanceController.ts';
import ForkController from './services/controllers/ForkController.ts';
import QueryController from './services/controllers/QueryController.ts';
import PatchController from './services/controllers/PatchController.ts';
import CheckpointController from './services/controllers/CheckpointController.ts';
import SyncTrustGate from './services/sync/SyncTrustGate.ts';
import AuditVerifierService from './services/audit/AuditVerifierService.ts';
import MaterializedViewService from './services/MaterializedViewService.ts';
import StateHashService from './services/state/StateHashService.ts';
import MaterializeController, { type MaterializeResult } from './services/controllers/MaterializeController.ts';
import type { MaterializeSessionOpener } from './services/controllers/MaterializeSessionBridge.ts';
import RuntimePatchCollector from './warp/RuntimePatchCollector.ts';
import RuntimeDetachedFactory from './warp/RuntimeDetachedFactory.ts';
import BitmapNeighborProvider, { type LogicalIndex } from './services/index/BitmapNeighborProvider.ts';
import { cloneState } from './services/JoinReducer.ts';
import { diffStates, isEmptyDiff } from './services/state/StateDiff.ts';
import WarpError from './errors/WarpError.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from './services/codec/WarpMessageCodec.ts';

import type { CorePersistence } from './types/WarpPersistence.ts';
import type LoggerPort from '../ports/LoggerPort.ts';
import type CryptoPort from '../ports/CryptoPort.ts';
import type CodecPort from '../ports/CodecPort.ts';
import type SeekCachePort from '../ports/SeekCachePort.ts';
import type WarpStateCachePort from '../ports/WarpStateCachePort.ts';
import type BlobStoragePort from '../ports/BlobStoragePort.ts';
import type PatchJournalPort from '../ports/PatchJournalPort.ts';
import type CommitMessageCodecPort from '../ports/CommitMessageCodecPort.ts';
import type CheckpointStorePort from '../ports/CheckpointStorePort.ts';
import type IndexStorePort from '../ports/IndexStorePort.ts';
import type EffectSinkPort from '../ports/EffectSinkPort.ts';
import type RuntimeStorageCapabilityPort from '../ports/RuntimeStorageCapabilityPort.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';
import type { ExternalizationPolicy } from './types/ExternalizationPolicy.ts';
import type WarpState from './services/state/WarpState.ts';
import type { ProvenanceIndex } from './services/provenance/ProvenanceIndex.ts';
import type Patch from './types/Patch.ts';
import type { PatchDiff } from './types/PatchDiff.ts';
import type PropertyIndexReader from './services/index/PropertyIndexReader.ts';
import type { WarpGraphWithMixins } from './warp/_internal.ts';
import StateSession from './orset/session/StateSession.ts';
import PageCache from './orset/trie/PageCache.ts';
import TrieGeometry from './orset/trie/TrieGeometry.ts';

import {
  DEFAULT_ADJACENCY_CACHE_SIZE,
  resolveBlobStorage,
  resolvePatchWriteStorage,
  resolveIndexStore,
  buildEffectPipeline,
  normalizeTrustConfig,
  type TrustMode,
  type NormalizedTrustConfig,
} from './runtimeHelpers.ts';
import { wireRuntime } from './runtimeWiring.ts';

function hasQueryControllerHostShape(value: WarpRuntime): value is WarpGraphWithMixins {
  return typeof Reflect.get(value, '_readPatchBlob') === 'function';
}

import type { NeighborEdge } from '../ports/NeighborProviderPort.ts';

type AdjacencyMapShape = {
  outgoing: Map<string, NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
  incoming: Map<string, NeighborEdge[]> | ReadonlyMap<string, readonly NeighborEdge[]>;
};

export type MaterializedGraph = {
  state: WarpState;
  stateHash: string;
  adjacency: AdjacencyMapShape;
  provider?: BitmapNeighborProvider;
};

type Subscriber = {
  onChange: Function;
  onError?: Function;
  pendingReplay?: boolean;
};

// ── Constructor options ──────────────────────────────────────────────

type WarpRuntimeOptions = {
  persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  graphName: string;
  writerId: string;
  gcPolicy?: GCPolicyConfig | GCPolicy;
  adjacencyCacheSize?: number;
  checkpointPolicy?: { every: number };
  autoMaterialize?: boolean;
  onDeleteWithData?: 'reject' | 'cascade' | 'warn';
  logger?: LoggerPort;
  crypto?: CryptoPort;
  codec?: CodecPort;
  seekCache?: SeekCachePort;
  stateCache?: WarpStateCachePort;
  audit?: boolean;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
  commitMessageCodec?: CommitMessageCodecPort;
  trust?: { mode?: TrustMode; pin?: string | null };
  patchJournal: PatchJournalPort;
  checkpointStore: CheckpointStorePort;
  indexStore: IndexStorePort;
  viewService: MaterializedViewService;
  stateHashService?: StateHashService;
  auditService?: AuditReceiptService;
  effectPipeline?: EffectPipeline;
  openStateSession?: MaterializeSessionOpener;
};

type WarpRuntimeOpenOptions = {
  persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
  graphName: string;
  writerId: string;
  gcPolicy?: GCPolicyConfig | GCPolicy;
  adjacencyCacheSize?: number;
  checkpointPolicy?: { every: number };
  autoMaterialize?: boolean;
  onDeleteWithData?: 'reject' | 'cascade' | 'warn';
  logger?: LoggerPort;
  crypto?: CryptoPort;
  codec?: CodecPort;
  seekCache?: SeekCachePort;
  stateCache?: WarpStateCachePort;
  audit?: boolean;
  blobStorage?: BlobStoragePort;
  patchBlobStorage?: BlobStoragePort;
  commitMessageCodec?: CommitMessageCodecPort;
  patchJournal?: PatchJournalPort | null;
  checkpointStore?: CheckpointStorePort | null;
  indexStore?: IndexStorePort | null;
  trust?: { mode?: TrustMode; pin?: string | null };
  effectPipeline?: EffectPipeline;
  effectSinks?: EffectSinkPort[];
  externalizationPolicy?: ExternalizationPolicy;
  openStateSession?: MaterializeSessionOpener;
};

/**
 * WarpRuntime class for interacting with a WARP multi-writer graph.
 */
export default class WarpRuntime {
  _persistence: CorePersistence & Partial<RuntimeStorageCapabilityPort>;
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
  _adjacencyCache: LRUCache<string, AdjacencyMapShape> | null;
  _lastFrontier: Map<string, string> | null;
  _logger: LoggerPort | null;
  _crypto: CryptoPort;
  _codec: CodecPort;
  _onDeleteWithData: 'reject' | 'cascade' | 'warn';
  _subscribers: Subscriber[];
  _lastNotifiedState: WarpState | null;
  _provenanceIndex: ProvenanceIndex | null;
  _temporalQuery: TemporalQuery | null;
  _seekCeiling: number | null;
  _cachedCeiling: number | null;
  _cachedFrontier: Map<string, string> | null;
  _seekCache: SeekCachePort | null;
  _stateCache: WarpStateCachePort | null;
  _blobStorage: BlobStoragePort | null;
  _patchBlobStorage: BlobStoragePort | null;
  _commitMessageCodec: CommitMessageCodecPort;
  _patchInProgress: boolean;
  _provenanceDegraded: boolean;
  _audit: boolean;
  _auditSkipCount: number;
  _trustConfig: NormalizedTrustConfig;
  _createSyncTrustGate: (override?: { mode?: TrustMode; pin?: string | null } | null) => SyncTrustGate | null;
  _syncController: SyncController;
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
  _checkpointStore: CheckpointStorePort;
  _indexStore: IndexStorePort;
  _stateHashService: StateHashService | null;
  _auditService: AuditReceiptService | null;

  /**
   * Constructs a WarpRuntime instance with injected dependencies and configuration.
   * @private
   */
  // TODO(OG): split constructor responsibilities; legacy hotspot kept explicit until the API redesign cycle.
  // eslint-disable-next-line max-lines-per-function, complexity
  constructor(options: WarpRuntimeOptions) {
    const {
      persistence,
      graphName,
      writerId,
      gcPolicy = {},
      adjacencyCacheSize = DEFAULT_ADJACENCY_CACHE_SIZE,
      checkpointPolicy,
      autoMaterialize = true,
      onDeleteWithData = 'warn',
      logger,
      crypto,
      codec,
      seekCache,
      stateCache,
      audit = false,
      blobStorage,
      patchBlobStorage,
      commitMessageCodec,
      trust,
      patchJournal,
      checkpointStore,
      indexStore,
      viewService,
      stateHashService,
      auditService,
      effectPipeline,
      openStateSession,
    } = options;

    this._persistence = persistence;
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
    this.traverse = new LogicalTraversal(this);
    this._materializedGraph = null;
    this._adjacencyCache = adjacencyCacheSize > 0 ? new LRUCache(adjacencyCacheSize) : null;
    this._lastFrontier = null;
    this._logger = logger || null;
    this._crypto = crypto || defaultCrypto;
    this._codec = codec || defaultCodec;
    this._onDeleteWithData = onDeleteWithData;
    this._subscribers = [];
    this._lastNotifiedState = null;
    this._provenanceIndex = null;
    this._temporalQuery = null;
    this._seekCeiling = null;
    this._cachedCeiling = null;
    this._cachedFrontier = null;
    this._seekCache = seekCache || null;
    this._stateCache = stateCache || null;
    this._blobStorage = blobStorage || null;
    this._patchBlobStorage = patchBlobStorage || null;
    this._commitMessageCodec = commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC;
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
    this._strandController = new StrandController(this);
    this._comparisonController = new ComparisonController(this);
    this._subscriptionController = new SubscriptionController(this as unknown as ConstructorParameters<typeof SubscriptionController>[0]);
    this._provenanceController = new ProvenanceController(this as unknown as WarpGraphWithMixins);
    this._forkController = new ForkController(this);
    if (!hasQueryControllerHostShape(this)) {
      throw new WarpError('runtime is missing query controller host methods', 'E_RUNTIME_QUERY_HOST');
    }
    this._queryController = new QueryController({
      hostGraph: this,
      graphCloner: new RuntimeDetachedFactory(this),
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
    this._patchController = new PatchController(this);
    this._checkpointController = new CheckpointController(this);
    this._materializeController = new MaterializeController({
      logger: this._logger ?? nullLogger,
      codec: this._codec,
      crypto: this._crypto,
      persistence: this._persistence,
      getStateCache: () => this._stateCache ?? null,
      ...(openStateSession === undefined ? {} : { openStateSession }),
      patches: new RuntimePatchCollector(this),
      graphCloner: new RuntimeDetachedFactory(this),
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
    this._checkpointStore = checkpointStore;
    this._indexStore = indexStore;
    this._auditService = auditService || null;
  }

  /**
   * Returns the attached seek cache, or null if none is set.
   */
  get seekCache(): SeekCachePort | null {
    return this._seekCache;
  }

  /**
   * Attaches a persistent seek cache after construction.
   */
  setSeekCache(cache: SeekCachePort): void {
    this._seekCache = cache;
  }

  /**
   * Builds a SyncTrustGate from a resolved trust configuration.
   */
  _buildTrustGate(config: NormalizedTrustConfig): SyncTrustGate {
    const verifier = new AuditVerifierService({
      persistence: this._persistence,
      codec: this._codec,
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
          return this._extractTrustedWriters(assessment as unknown as { trust: { explanations: Array<{ trusted: boolean; writerId: string }> } });
        },
      },
    });
  }

  /**
   * Extracts trusted writer IDs from a trust assessment result.
   */
  _extractTrustedWriters(assessment: { trust: { explanations: Array<{ trusted: boolean; writerId: string }> } }): { trusted: Set<string> } {
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
    let max = 0;
    for (const v of state.observedFrontier.values()) {
      if (v > max) { max = v; }
    }
    return max;
  }

  /**
   * Opens a multi-writer graph.
   *
   * @example
   * const graph = await WarpRuntime.open({
   *   persistence: gitAdapter,
   *   graphName: 'events',
   *   writerId: 'node-1'
   * });
   */
  // TODO(OG): split open() validation/bootstrapping; legacy hotspot kept explicit until the API redesign cycle.
  // eslint-disable-next-line max-lines-per-function, complexity
  static async open({
    persistence,
    graphName,
    writerId,
    gcPolicy = {},
    adjacencyCacheSize,
    checkpointPolicy,
    autoMaterialize,
    onDeleteWithData,
    logger,
    crypto,
    codec,
    seekCache,
    stateCache,
    audit,
    blobStorage,
    patchBlobStorage,
    commitMessageCodec,
    patchJournal,
    checkpointStore,
    indexStore,
    trust,
    effectPipeline,
    effectSinks,
    externalizationPolicy,
    openStateSession,
  }: WarpRuntimeOpenOptions): Promise<WarpRuntime> {
    // Validate inputs
    validateGraphName(graphName);
    validateWriterId(writerId);

    if (persistence === null || persistence === undefined) {
      throw new WarpError('persistence is required', 'E_INVALID_ARG');
    }

    // Validate checkpointPolicy
    if (checkpointPolicy !== undefined && checkpointPolicy !== null) {
      if (typeof checkpointPolicy !== 'object' || checkpointPolicy === null) {
        throw new WarpError('checkpointPolicy must be an object with { every: number }', 'E_CHECKPOINT_POLICY_TYPE');
      }
      if (!Number.isInteger(checkpointPolicy.every) || checkpointPolicy.every <= 0) {
        throw new WarpError('checkpointPolicy.every must be a positive integer', 'E_CHECKPOINT_POLICY_EVERY');
      }
    }

    // Validate autoMaterialize
    if (autoMaterialize !== undefined && typeof autoMaterialize !== 'boolean') {
      throw new WarpError('autoMaterialize must be a boolean', 'E_AUTO_MATERIALIZE_TYPE');
    }

    // Validate audit
    if (audit !== undefined && typeof audit !== 'boolean') {
      throw new WarpError('audit must be a boolean', 'E_AUDIT_TYPE');
    }

    normalizeTrustConfig(trust);

    // Validate onDeleteWithData
    if (onDeleteWithData !== undefined) {
      const valid = ['reject', 'cascade', 'warn'] as const;
      if (!valid.includes(onDeleteWithData)) {
        throw new WarpError(
          `onDeleteWithData must be one of: ${valid.join(', ')}`,
          'E_ON_DELETE_WITH_DATA_INVALID',
          { context: { got: onDeleteWithData, valid } },
        );
      }
    }

    // Auto-construct blob storage when none provided (OG-014: CAS is mandatory)
    const resolvedBlobStorage = await resolveBlobStorage(blobStorage, persistence);
    const resolvedCommitMessageCodec = commitMessageCodec ?? DEFAULT_COMMIT_MESSAGE_CODEC;

    // Resolve codec/crypto defaults for adapter construction
    const resolvedCodec = codec || defaultCodec;
    const resolvedCrypto = crypto || defaultCrypto;
    const patchWriteStorage = resolvePatchWriteStorage(persistence, patchBlobStorage);

    // ── Build port adapters before constructing the runtime ──────────────
    const blobPort = persistence;
    const commitPort = persistence;
    const treePort = persistence;

    // PatchJournal
    let resolvedPatchJournal: PatchJournalPort;
    if (patchJournal !== undefined && patchJournal !== null) {
      resolvedPatchJournal = patchJournal;
    } else {
      const { CborPatchJournalAdapter } = await import(
        /* webpackIgnore: true */ '../infrastructure/adapters/CborPatchJournalAdapter.ts'
      );
      resolvedPatchJournal = new CborPatchJournalAdapter({
        codec: resolvedCodec,
        blobPort,
        commitPort,
        commitMessageCodec: resolvedCommitMessageCodec,
        ...(patchWriteStorage.strategy === 'git-cas' ? { blobStorage: resolvedBlobStorage } : {}),
        ...(patchBlobStorage !== undefined && patchBlobStorage !== null ? { legacyPatchBlobStorage: patchBlobStorage } : {}),
        writeStorage: patchWriteStorage,
      });
    }

    // CheckpointStore
    let resolvedCheckpointStore: CheckpointStorePort;
    if (checkpointStore !== undefined && checkpointStore !== null) {
      resolvedCheckpointStore = checkpointStore;
    } else {
      const { CborCheckpointStoreAdapter } = await import(
        /* webpackIgnore: true */ '../infrastructure/adapters/CborCheckpointStoreAdapter.ts'
      );
      resolvedCheckpointStore = new CborCheckpointStoreAdapter({
        codec: resolvedCodec,
        blobPort,
        blobStorage: resolvedBlobStorage,
      });
    }

    // IndexStore
    const resolvedIndexStore = await resolveIndexStore(indexStore, {
      codec: resolvedCodec, blobPort, treePort, blobStorage: resolvedBlobStorage,
    });

    // StateHashService -- crypto is always resolved (defaultCrypto fallback)
    const resolvedStateHashService = new StateHashService({
      codec: resolvedCodec,
      crypto: resolvedCrypto,
    });

    // ViewService
    const resolvedViewService = new MaterializedViewService({
      codec: resolvedCodec,
      ...(logger !== undefined ? { logger } : {}),
      indexStore: resolvedIndexStore,
    });

    // AuditService (async init)
    let resolvedAuditService: AuditReceiptService | undefined;
    if (audit === true) {
      resolvedAuditService = new AuditReceiptService({
        persistence,
        graphName,
        writerId,
        codec: resolvedCodec,
        crypto: resolvedCrypto,
        ...(logger ? { logger } : {}),
      });
      await resolvedAuditService.init();
    }

    // EffectPipeline
    let resolvedEffectPipeline: EffectPipeline | undefined;
    if (effectPipeline !== null && effectPipeline !== undefined) {
      resolvedEffectPipeline = effectPipeline;
    } else if (effectSinks !== null && effectSinks !== undefined && effectSinks.length > 0) {
      resolvedEffectPipeline = await buildEffectPipeline(effectSinks, externalizationPolicy);
    }

    let resolvedOpenStateSession: MaterializeSessionOpener | undefined;
    if (openStateSession !== undefined) {
      resolvedOpenStateSession = openStateSession;
    } else if (typeof persistence.createRuntimeTrieStore === 'function') {
      const store = await persistence.createRuntimeTrieStore();
      const pageCache = new PageCache({ maxResident: 256 });
      const geometry = TrieGeometry.default16way();
      resolvedOpenStateSession = async (roots) =>
        await StateSession.open({
          nodeAliveRootOid: roots.nodeAliveRootOid,
          edgeAliveRootOid: roots.edgeAliveRootOid,
          store,
          codec: resolvedCodec,
          geometry,
          pageCache,
        });
    }

    // ── Construct the runtime with all dependencies resolved ────────────
    const graph = new WarpRuntime({
      persistence,
      graphName,
      writerId,
      gcPolicy,
      ...(adjacencyCacheSize !== undefined ? { adjacencyCacheSize } : {}),
      ...(checkpointPolicy !== undefined ? { checkpointPolicy } : {}),
      ...(autoMaterialize !== undefined ? { autoMaterialize } : {}),
      ...(onDeleteWithData !== undefined ? { onDeleteWithData } : {}),
      ...(logger !== undefined ? { logger } : {}),
      ...(crypto !== undefined ? { crypto } : {}),
      ...(codec !== undefined ? { codec } : {}),
      ...(seekCache !== undefined ? { seekCache } : {}),
      ...(stateCache !== undefined ? { stateCache } : {}),
      ...(audit !== undefined ? { audit } : {}),
      blobStorage: resolvedBlobStorage,
      ...(patchBlobStorage !== undefined ? { patchBlobStorage } : {}),
      commitMessageCodec: resolvedCommitMessageCodec,
      ...(trust !== undefined ? { trust } : {}),
      patchJournal: resolvedPatchJournal,
      checkpointStore: resolvedCheckpointStore,
      indexStore: resolvedIndexStore,
      viewService: resolvedViewService,
      stateHashService: resolvedStateHashService,
      ...(resolvedAuditService !== undefined ? { auditService: resolvedAuditService } : {}),
      ...(resolvedEffectPipeline !== undefined && resolvedEffectPipeline !== null ? { effectPipeline: resolvedEffectPipeline } : {}),
      ...(resolvedOpenStateSession === undefined ? {} : { openStateSession: resolvedOpenStateSession }),
    });

    // Validate migration boundary
    await (graph as unknown as { _validateMigrationBoundary(): Promise<void> })._validateMigrationBoundary();

    return graph;
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
          type PatchEntry = { patch: Patch; sha: string };
          type WiredPatch = { discoverWriters(): Promise<string[]>; _loadWriterPatches(w: string): Promise<PatchEntry[]>; _sortPatchesCausally(p: PatchEntry[]): PatchEntry[] };
          const self = this as unknown as WiredPatch;
          const writerIds = await self.discoverWriters();
          const allPatches: PatchEntry[] = [];
          for (const wid of writerIds) {
            const writerPatches = await self._loadWriterPatches(wid);
            allPatches.push(...writerPatches);
          }
          return self._sortPatchesCausally(allPatches);
        },
        loadCheckpoint: async () => {
          const ck = await (this as unknown as { _loadLatestCheckpoint(): Promise<{ state: WarpState } | null> })._loadLatestCheckpoint();
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
        outgoing: new Map(result.adjacency.outgoing) as Map<string, NeighborEdge[]>,
        incoming: new Map(result.adjacency.incoming) as Map<string, NeighborEdge[]>,
      },
    };
    this._provenanceIndex = result.provenanceIndex;
    this._provenanceDegraded = result.provenanceDegraded;
    this._cachedCeiling = result.ceiling;
    this._cachedFrontier = result.frontier ? new Map(result.frontier) : null;

    // 2. Build view (index)
    this._buildViewFromResult(result);

    // 3. Side effects (live frontier only)
    if (result.ceiling === null) {
      this._lastFrontier = await (this as unknown as { getFrontier(): Promise<Map<string, string>> }).getFrontier();
      this._patchesSinceCheckpoint = result.patchCount;
      await this._tryAutoCheckpoint(result.patchCount);
      (this as unknown as { _maybeRunGC(s: WarpState): void })._maybeRunGC(result.state);
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
    try { await (this as unknown as { createCheckpoint(): Promise<void> }).createCheckpoint(); this._patchesSinceCheckpoint = 0; } catch { /* non-fatal */ }
  }

  _notifyAfterMaterialize(state: WarpState): void {
    if (this._subscribers.length > 0) {
      const hasPendingReplay = this._subscribers.some((s) => s.pendingReplay === true);
      const delta = diffStates(this._lastNotifiedState, state);
      if (!isEmptyDiff(delta) || hasPendingReplay) {
        (this as unknown as { _notifySubscribers(d: unknown, s: WarpState): void })._notifySubscribers(delta, state);
      }
    }
    this._lastNotifiedState = cloneState(state);
  }
}

// Wire delegation methods onto WarpRuntime.prototype.
// Must run after the class definition so the prototype exists.
wireRuntime(WarpRuntime);
