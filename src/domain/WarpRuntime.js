/**
 * WarpRuntime - Main API class for WARP multi-writer graph database.
 *
 * Provides a factory for opening multi-writer graphs and methods for
 * creating patches, materializing state, and managing checkpoints.
 *
 * @module domain/WarpRuntime
 * @see WARP Spec Section 11
 */

import { validateGraphName, validateWriterId } from './utils/RefLayout.js';
import VersionVector from './crdt/VersionVector.js';
import { DEFAULT_GC_POLICY } from './services/GCPolicy.js';
import { AuditReceiptService } from './services/audit/AuditReceiptService.js';
import { TemporalQuery } from './services/TemporalQuery.js';
import defaultCodec from './utils/defaultCodec.js';
import defaultCrypto from './utils/defaultCrypto.js';
import defaultClock from './utils/defaultClock.js';
import LogicalTraversal from './services/query/LogicalTraversal.js';
import LRUCache from './utils/LRUCache.js';
import SyncController from './services/controllers/SyncController.js';
import StrandController from './services/controllers/StrandController.js';
import ComparisonController from './services/controllers/ComparisonController.js';
import SubscriptionController from './services/controllers/SubscriptionController.js';
import ProvenanceController from './services/controllers/ProvenanceController.js';
import ForkController from './services/controllers/ForkController.js';
import QueryController from './services/controllers/QueryController.js';
import PatchController from './services/controllers/PatchController.js';
import CheckpointController from './services/controllers/CheckpointController.js';
import SyncTrustGate from './services/sync/SyncTrustGate.js';
import { AuditVerifierService } from './services/audit/AuditVerifierService.js';
import MaterializedViewService from './services/MaterializedViewService.js';
import StateHashService from './services/state/StateHashService.js';
import InMemoryBlobStorageAdapter from './utils/defaultBlobStorage.js';
// checkpoint.methods.js replaced by CheckpointController (imported above)
// patch.methods.js replaced by PatchController (imported above)
// materialize.methods.js + materializeAdvanced.methods.js replaced by MaterializeController
import MaterializeController from './services/controllers/MaterializeController.js';

/** @typedef {import('./types/WarpPersistence.js').CorePersistence} CorePersistence */

const DEFAULT_ADJACENCY_CACHE_SIZE = 3;

/**
 * Auto-constructs a BlobStoragePort when none is explicitly provided.
 *
 * When persistence has `plumbing` (Git-backed), constructs a CasBlobAdapter
 * for CDC chunking and Git-native GC reachability. Otherwise uses
 * InMemoryBlobStorageAdapter for browser/test paths.
 *
 * @param {unknown} persistence
 * @returns {Promise<import('../ports/BlobStoragePort.js').default>}
 */
async function autoConstructBlobStorage(persistence) {
  const p = /** @type {{ plumbing?: unknown }} */ (persistence);
  if (p.plumbing !== null && p.plumbing !== undefined) {
    const { default: CasBlobAdapter } = await import(
      /* webpackIgnore: true */ '../infrastructure/adapters/CasBlobAdapter.js'
    );
    return new CasBlobAdapter({ plumbing: p.plumbing, persistence: /** @type {import('../infrastructure/adapters/CasBlobAdapter.js').BlobPersistence} */ (/** @type {unknown} */ (persistence)) });
  }
  return new InMemoryBlobStorageAdapter();
}

import WarpError from './errors/WarpError.js';

/**
 * Constructs an EffectPipeline from an array of sinks and an optional externalization lens.
 *
 * @param {Array<import('../ports/EffectSinkPort.js').default>} sinks - Effect sinks to multiplex
 * @param {import('./types/ExternalizationPolicy.js').ExternalizationPolicy|undefined} lens - Optional externalization lens
 * @param {import('../ports/ClockPort.js').default} clock - Clock for the pipeline
 * @returns {Promise<import('./services/EffectPipeline.js').EffectPipeline>} Constructed pipeline
 */
async function buildEffectPipeline(sinks, lens, clock) {
  const multMod = /** @type {{ MultiplexSink: typeof import('./services/MultiplexSink.js').MultiplexSink }} */ (
    /** @type {unknown} */ (await import('./services/MultiplexSink.js'))
  );
  const effMod = /** @type {{ EffectPipeline: typeof import('./services/EffectPipeline.js').EffectPipeline }} */ (
    /** @type {unknown} */ (await import('./services/EffectPipeline.js'))
  );
  const mux = new multMod.MultiplexSink();
  for (const sink of sinks) {
    mux.addSink(sink);
  }
  /** @type {import('./types/ExternalizationPolicy.js').ExternalizationPolicy} */
  let resolvedLens;
  if (lens !== null && lens !== undefined) {
    resolvedLens = lens;
  } else {
    const mod = /** @type {{ LIVE_LENS: import('./types/ExternalizationPolicy.js').ExternalizationPolicy }} */ (
      /** @type {unknown} */ (await import('./types/ExternalizationPolicy.js'))
    );
    resolvedLens = mod.LIVE_LENS;
  }
  return new effMod.EffectPipeline({ sink: mux, lens: resolvedLens, clock });
}

const VALID_TRUST_MODES = /** @type {const} */ (['off', 'log-only', 'enforce']);

/**
 * Validates and returns the trust mode from a raw config.
 * @param {string} mode - Candidate trust mode value
 * @returns {'off'|'log-only'|'enforce'} Validated trust mode
 */
function validateTrustMode(mode) {
  if (!VALID_TRUST_MODES.includes(/** @type {'off'|'log-only'|'enforce'} */ (mode))) {
    throw new WarpError('trust.mode must be one of: off, log-only, enforce', 'E_TRUST_CONFIG');
  }
  return /** @type {'off'|'log-only'|'enforce'} */ (mode);
}

/**
 * Validates and returns the trust pin from a raw config.
 * @param {string|null|undefined} pin - Candidate pin value
 * @returns {string|null} Validated pin
 */
function validateTrustPin(pin) {
  if (pin !== undefined && pin !== null && typeof pin !== 'string') {
    throw new WarpError('trust.pin must be a string', 'E_TRUST_CONFIG');
  }
  return pin ?? null;
}

/**
 * Normalizes a trust configuration into a canonical shape with defaults.
 * @param {{ mode?: 'off'|'log-only'|'enforce', pin?: string|null }|undefined|null} trust - Raw trust config
 * @returns {{ mode: 'off'|'log-only'|'enforce', pin: string|null }} Normalized trust config
 */
function normalizeTrustConfig(trust) {
  if (trust === null || trust === undefined) {
    return { mode: 'off', pin: null };
  }
  if (typeof trust !== 'object') {
    throw new WarpError('trust must be an object', 'E_TRUST_CONFIG');
  }
  return {
    mode: validateTrustMode(trust.mode ?? 'off'),
    pin: validateTrustPin(trust.pin),
  };
}

/**
 * @typedef {Object} MaterializedGraph
 * @property {import('./services/JoinReducer.js').WarpStateV5} state
 * @property {string|null} stateHash
 * @property {{outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}} adjacency
 * @property {import('./services/index/BitmapNeighborProvider.js').default} [provider]
 */

/**
 * WarpRuntime class for interacting with a WARP multi-writer graph.
 */
export default class WarpRuntime {
  /**
   * Constructs a WarpRuntime instance with injected dependencies and configuration.
   * @private
   * @param {{ persistence: CorePersistence, graphName: string, writerId: string, gcPolicy?: Record<string, unknown>, adjacencyCacheSize?: number, checkpointPolicy?: {every: number}, autoMaterialize?: boolean, onDeleteWithData?: 'reject'|'cascade'|'warn', logger?: import('../ports/LoggerPort.js').default, clock?: import('../ports/ClockPort.js').default, crypto?: import('../ports/CryptoPort.js').default, codec?: import('../ports/CodecPort.js').default, seekCache?: import('../ports/SeekCachePort.js').default, audit?: boolean, blobStorage?: import('../ports/BlobStoragePort.js').default, patchBlobStorage?: import('../ports/BlobStoragePort.js').default, trust?: { mode?: 'off'|'log-only'|'enforce', pin?: string|null } }} options
   */
  // TODO(OG): split constructor responsibilities; legacy hotspot kept explicit until the API redesign cycle.
  // eslint-disable-next-line max-lines-per-function, complexity
  constructor(options) {
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
      clock,
      crypto,
      codec,
      seekCache,
      audit = false,
      blobStorage,
      patchBlobStorage,
      trust,
    } = options;
    /** @type {CorePersistence} */
    this._persistence = /** @type {CorePersistence} */ (persistence);

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;

    /** @type {import('./crdt/VersionVector.js').default} */
    this._versionVector = VersionVector.empty();

    /** @type {import('./services/JoinReducer.js').WarpStateV5|null} */
    this._cachedState = null;

    /** @type {boolean} */
    this._stateDirty = false;

    /** @type {import('./services/GCPolicy.js').GCPolicy} */
    this._gcPolicy = { ...DEFAULT_GC_POLICY, ...gcPolicy };

    /** @type {number} */
    this._lastGCTime = 0;

    /** @type {number} */
    this._patchesSinceGC = 0;

    /** @type {number} */
    this._patchesSinceCheckpoint = 0;

    /** @type {number} */
    this._maxObservedLamport = 0;

    /** @type {{every: number}|null} */
    this._checkpointPolicy = checkpointPolicy || null;

    /** @type {boolean} */
    this._checkpointing = false;

    /** @type {boolean} */
    this._autoMaterialize = autoMaterialize;

    /** @type {LogicalTraversal} */
    this.traverse = new LogicalTraversal(this);

    /** @type {MaterializedGraph|null} */
    this._materializedGraph = null;

    /** @type {import('./utils/LRUCache.js').default<string, {outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}>|null} */
    this._adjacencyCache = adjacencyCacheSize > 0 ? new LRUCache(adjacencyCacheSize) : null;

    /** @type {Map<string, string>|null} */
    this._lastFrontier = null;

    /** @type {import('../ports/LoggerPort.js').default|null} */
    this._logger = logger || null;

    /** @type {import('../ports/ClockPort.js').default} */
    this._clock = clock || defaultClock;

    /** @type {import('../ports/CryptoPort.js').default} */
    this._crypto = crypto || defaultCrypto;

    /** @type {import('../ports/CodecPort.js').default} */
    this._codec = codec || defaultCodec;

    /** @type {'reject'|'cascade'|'warn'} */
    this._onDeleteWithData = onDeleteWithData;

    /** @type {Array<{onChange: Function, onError?: Function, pendingReplay?: boolean}>} */
    this._subscribers = [];

    /** @type {import('./services/JoinReducer.js').WarpStateV5|null} */
    this._lastNotifiedState = null;

    /** @type {import('./services/provenance/ProvenanceIndex.js').ProvenanceIndex|null} */
    this._provenanceIndex = null;

    /** @type {import('./services/TemporalQuery.js').TemporalQuery|null} */
    this._temporalQuery = null;

    /** @type {number|null} */
    this._seekCeiling = null;

    /** @type {number|null} */
    this._cachedCeiling = null;

    /** @type {Map<string, string>|null} */
    this._cachedFrontier = null;

    /** @type {import('../ports/SeekCachePort.js').default|null} */
    this._seekCache = seekCache || null;

    /** @type {import('../ports/BlobStoragePort.js').default|null} */
    this._blobStorage = blobStorage || null;

    /** @type {import('../ports/BlobStoragePort.js').default|null} */
    this._patchBlobStorage = patchBlobStorage || null;

    /** @type {boolean} */
    this._patchInProgress = false;

    /** @type {boolean} */
    this._provenanceDegraded = false;

    /** @type {boolean} */
    this._audit = !!audit;

    /** @type {AuditReceiptService|null} */
    this._auditService = null;

    /** @type {number} */
    this._auditSkipCount = 0;

    /** @type {{ mode: 'off'|'log-only'|'enforce', pin: string|null }} */
    this._trustConfig = normalizeTrustConfig(trust);

    /** Lazily creates a SyncTrustGate from trust config, or returns null when trust is off. @type {((override?: { mode?: 'off'|'log-only'|'enforce', pin?: string|null }|undefined|null) => SyncTrustGate|null)} */
    this._createSyncTrustGate = (override) => {
      const config = normalizeTrustConfig(override ?? this._trustConfig);
      if (config.mode === 'off') {
        return null;
      }
      return this._buildTrustGate(config);
    };

    const trustGate = this._createSyncTrustGate() || undefined;
    /** @type {SyncController} */
    this._syncController = new SyncController(this, {
      ...(trustGate !== undefined ? { trustGate } : {}),
    });

    /** @type {StrandController} */
    this._strandController = new StrandController(this);

    /** @type {ComparisonController} */
    this._comparisonController = new ComparisonController(this);

    /** @type {SubscriptionController} */
    this._subscriptionController = new SubscriptionController(this);

    /** @type {ProvenanceController} */
    this._provenanceController = new ProvenanceController(/** @type {import('./warp/_internal.js').WarpGraphWithMixins} */ (/** @type {unknown} */ (this)));

    /** @type {ForkController} */
    this._forkController = new ForkController(this);

    /** @type {QueryController} */
    this._queryController = new QueryController(/** @type {import('./warp/_internal.js').WarpGraphWithMixins} */ (/** @type {unknown} */ (this)));

    /** @type {PatchController} */
    this._patchController = new PatchController(this);

    /** @type {CheckpointController} */
    this._checkpointController = new CheckpointController(this);

    /** @type {MaterializeController} */
    this._materializeController = new MaterializeController(this);

    /** @type {MaterializedViewService} */
    this._viewService = new MaterializedViewService({
      codec: this._codec,
      ...(this._logger ? { logger: this._logger } : {}),
    });

    /** @type {import('./services/index/BitmapNeighborProvider.js').LogicalIndex|null} */
    this._logicalIndex = null;

    /** @type {import('./services/index/PropertyIndexReader.js').default|null} */
    this._propertyReader = null;

    /** @type {string|null} */
    this._cachedViewHash = null;

    /** @type {Record<string, Uint8Array>|null} */
    this._cachedIndexTree = null;

    /** @type {boolean} */
    this._indexDegraded = false;

    /** @type {import('./services/EffectPipeline.js').EffectPipeline|null} */
    this._effectPipeline = null;

    /** @type {import('../ports/PatchJournalPort.js').default|null} */
    this._patchJournal = null;

    /** @type {import('../ports/CheckpointStorePort.js').default|null} */
    this._checkpointStore = null;

    /** @type {StateHashService|null} */
    this._stateHashService = null;
  }

  /**
   * Returns the attached seek cache, or null if none is set.
   * @returns {import('../ports/SeekCachePort.js').default|null}
   */
  get seekCache() {
    return this._seekCache;
  }

  /**
   * Attaches a persistent seek cache after construction.
   *
   * Useful when the cache adapter cannot be created until after the
   * graph is opened (e.g. the CLI wires it based on flags).
   *
   * @param {import('../ports/SeekCachePort.js').default} cache - SeekCachePort implementation
   */
  setSeekCache(cache) {
    this._seekCache = cache;
  }

  /**
   * Logs a timing message for a completed or failed operation.
   * @param {string} op - Operation name (e.g. 'materialize')
   * @param {number} t0 - Start timestamp from this._clock.now()
   * @param {{ metrics?: string, error?: Error }} [opts] - Options
   */
  _logTiming(op, t0, { metrics, error } = {}) {
    if (!this._logger) {
      return;
    }
    const elapsed = Math.round(this._clock.now() - t0);
    this._emitTimingMessage(op, { elapsed, ...(metrics !== undefined ? { metrics } : {}), ...(error !== undefined ? { error } : {}) });
  }

  /**
   * Emits a formatted timing log message for a completed or failed operation.
   * @param {string} op - Operation name
   * @param {{ elapsed: number, metrics?: string, error?: Error }} detail - Timing details
   * @private
   */
  _emitTimingMessage(op, { elapsed, metrics, error }) {
    if (error) {
      /** @type {import('../ports/LoggerPort.js').default} */ (this._logger).info(`[warp] ${op} failed in ${elapsed}ms`, { error: error.message });
    } else {
      const suffix = (typeof metrics === 'string' && metrics.length > 0) ? ` (${metrics})` : '';
      /** @type {import('../ports/LoggerPort.js').default} */ (this._logger).info(`[warp] ${op} completed in ${elapsed}ms${suffix}`);
    }
  }

  /**
   * Builds a SyncTrustGate from a resolved trust configuration.
   *
   * @param {{ mode: 'off'|'log-only'|'enforce', pin: string|null }} config - Normalized trust config
   * @returns {SyncTrustGate} Constructed trust gate
   * @private
   */
  _buildTrustGate(config) {
    const verifier = new AuditVerifierService({
      persistence: this._persistence,
      codec: this._codec,
      ...(this._logger ? { logger: this._logger } : {}),
    });

    return new SyncTrustGate({
      trustMode: config.mode,
      ...(this._logger ? { logger: this._logger } : {}),
      trustEvaluator: {
        /** Evaluates writer trust by delegating to the AuditVerifierService. */
        evaluateWriters: async (writerIds) => {
          const pin = (typeof config.pin === 'string' && config.pin.length > 0) ? config.pin : undefined;
          const assessment = await verifier.evaluateTrust(this._graphName, {
            ...(pin !== undefined ? { pin } : {}),
            mode: config.mode === 'enforce' ? 'enforce' : 'warn',
            writerIds,
          });
          return this._extractTrustedWriters(/** @type {{ trust: { explanations: Array<{ trusted: boolean, writerId: string }> } }} */ (/** @type {unknown} */ (assessment)));
        },
      },
    });
  }

  /**
   * Extracts trusted writer IDs from a trust assessment result.
   *
   * @param {{ trust: { explanations: Array<{ trusted: boolean, writerId: string }> } }} assessment - Trust evaluation result
   * @returns {{ trusted: Set<string> }} Set of trusted writer IDs
   * @private
   */
  _extractTrustedWriters(assessment) {
    return {
      trusted: new Set(
        assessment.trust.explanations
          .filter((explanation) => explanation.trusted)
          .map((explanation) => explanation.writerId),
      ),
    };
  }

  /**
   * Extracts the maximum Lamport timestamp from a WarpStateV5.
   *
   * @param {import('./services/JoinReducer.js').WarpStateV5} state
   * @returns {number} Maximum Lamport value (0 if frontier is empty)
   * @private
   */
  _maxLamportFromState(state) {
    let max = 0;
    for (const v of state.observedFrontier.values()) {
      if (v > max) { max = v; }
    }
    return max;
  }

  /**
   * Opens a multi-writer graph.
   *
   * @param {{ persistence: CorePersistence, graphName: string, writerId: string, gcPolicy?: Record<string, unknown>, adjacencyCacheSize?: number, checkpointPolicy?: {every: number}, autoMaterialize?: boolean, onDeleteWithData?: 'reject'|'cascade'|'warn', logger?: import('../ports/LoggerPort.js').default, clock?: import('../ports/ClockPort.js').default, crypto?: import('../ports/CryptoPort.js').default, codec?: import('../ports/CodecPort.js').default, seekCache?: import('../ports/SeekCachePort.js').default, audit?: boolean, blobStorage?: import('../ports/BlobStoragePort.js').default, patchBlobStorage?: import('../ports/BlobStoragePort.js').default, patchJournal?: import('../ports/PatchJournalPort.js').default | null, checkpointStore?: import('../ports/CheckpointStorePort.js').default | null, trust?: { mode?: 'off'|'log-only'|'enforce', pin?: string|null }, effectPipeline?: import('./services/EffectPipeline.js').EffectPipeline, effectSinks?: Array<import('../ports/EffectSinkPort.js').default>, externalizationPolicy?: import('./types/ExternalizationPolicy.js').ExternalizationPolicy }} options
   * @returns {Promise<WarpRuntime>} The opened graph instance
   * @throws {WarpError} If graphName, writerId, checkpointPolicy, or onDeleteWithData is invalid
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
  static async open({ persistence, graphName, writerId, gcPolicy = {}, adjacencyCacheSize, checkpointPolicy, autoMaterialize, onDeleteWithData, logger, clock, crypto, codec, seekCache, audit, blobStorage, patchBlobStorage, patchJournal, checkpointStore, trust, effectPipeline, effectSinks, externalizationPolicy }) {
    // Validate inputs
    validateGraphName(graphName);
    validateWriterId(writerId);

    if (persistence === null || persistence === undefined) {
      throw new WarpError('persistence is required', 'E_INVALID_ARG');
    }

    // Validate checkpointPolicy
    if (checkpointPolicy !== undefined && checkpointPolicy !== null) {
      if (typeof checkpointPolicy !== 'object' || checkpointPolicy === null) {
        throw new Error('checkpointPolicy must be an object with { every: number }');
      }
      if (!Number.isInteger(checkpointPolicy.every) || checkpointPolicy.every <= 0) {
        throw new Error('checkpointPolicy.every must be a positive integer');
      }
    }

    // Validate autoMaterialize
    if (autoMaterialize !== undefined && typeof autoMaterialize !== 'boolean') {
      throw new Error('autoMaterialize must be a boolean');
    }

    // Validate audit
    if (audit !== undefined && typeof audit !== 'boolean') {
      throw new Error('audit must be a boolean');
    }

    normalizeTrustConfig(trust);

    // Validate onDeleteWithData
    if (onDeleteWithData !== undefined) {
      const valid = ['reject', 'cascade', 'warn'];
      if (!valid.includes(onDeleteWithData)) {
        throw new Error(`onDeleteWithData must be one of: ${valid.join(', ')}`);
      }
    }

    // Auto-construct blob storage when none provided (OG-014: CAS is mandatory)
    const resolvedBlobStorage = blobStorage || await autoConstructBlobStorage(persistence);

    const graph = new WarpRuntime({ persistence, graphName, writerId, gcPolicy, ...(adjacencyCacheSize !== undefined ? { adjacencyCacheSize } : {}), ...(checkpointPolicy !== undefined ? { checkpointPolicy } : {}), ...(autoMaterialize !== undefined ? { autoMaterialize } : {}), ...(onDeleteWithData !== undefined ? { onDeleteWithData } : {}), ...(logger !== undefined ? { logger } : {}), ...(clock !== undefined ? { clock } : {}), ...(crypto !== undefined ? { crypto } : {}), ...(codec !== undefined ? { codec } : {}), ...(seekCache !== undefined ? { seekCache } : {}), ...(audit !== undefined ? { audit } : {}), blobStorage: resolvedBlobStorage, ...(patchBlobStorage !== undefined ? { patchBlobStorage } : {}), ...(trust !== undefined ? { trust } : {}) });

    // Auto-construct patchJournal when none provided: uses the same dynamic import
    // pattern as autoConstructBlobStorage to keep infrastructure imports out of the
    // module's top-level scope.
    if (patchJournal !== undefined && patchJournal !== null) {
      graph._patchJournal = /** @type {import('../ports/PatchJournalPort.js').default} */ (patchJournal);
    } else {
      const { CborPatchJournalAdapter } = await import(
        /* webpackIgnore: true */ '../infrastructure/adapters/CborPatchJournalAdapter.js'
      );
      graph._patchJournal = new CborPatchJournalAdapter({
        codec: graph._codec,
        blobPort: /** @type {import('../ports/BlobPort.js').default} */ (persistence),
        commitPort: /** @type {import('../ports/CommitPort.js').default} */ (persistence),
        ...(patchBlobStorage !== undefined && patchBlobStorage !== null ? { patchBlobStorage } : {}),
      });
    }

    // Auto-construct checkpointStore when none provided: same pattern as patchJournal.
    if (checkpointStore !== undefined && checkpointStore !== null) {
      graph._checkpointStore = /** @type {import('../ports/CheckpointStorePort.js').default} */ (checkpointStore);
    } else {
      const { CborCheckpointStoreAdapter } = await import(
        /* webpackIgnore: true */ '../infrastructure/adapters/CborCheckpointStoreAdapter.js'
      );
      graph._checkpointStore = new CborCheckpointStoreAdapter({
        codec: graph._codec,
        blobPort: /** @type {import('../ports/BlobPort.js').default} */ (persistence),
      });
    }

    // Auto-construct StateHashService from codec + crypto (only when crypto is available)
    if (graph._crypto !== undefined && graph._crypto !== null) {
      graph._stateHashService = new StateHashService({
        codec: graph._codec,
        crypto: graph._crypto,
      });
    }

    // Validate migration boundary
    await graph._validateMigrationBoundary();

    // Initialize audit service if enabled
    if (graph._audit) {
      graph._auditService = new AuditReceiptService({
        persistence: /** @type {CorePersistence} */ (persistence),
        graphName,
        writerId,
        codec: graph._codec,
        crypto: graph._crypto,
        ...(graph._logger ? { logger: graph._logger } : {}),
      });
      await graph._auditService.init();
    }

    // Wire effect pipeline if provided (explicit pipeline wins over sinks+lens)
    if (effectPipeline !== null && effectPipeline !== undefined) {
      graph._effectPipeline = effectPipeline;
    } else if (effectSinks !== null && effectSinks !== undefined && effectSinks.length > 0) {
      graph._effectPipeline = await buildEffectPipeline(effectSinks, externalizationPolicy, graph._clock);
    }

    return graph;
  }

  /**
   * Gets the graph name.
   * @returns {string} The graph name
   */
  get graphName() {
    return this._graphName;
  }

  /**
   * Gets the writer ID.
   * @returns {string} The writer ID
   */
  get writerId() {
    return this._writerId;
  }

  /**
   * Gets the persistence adapter.
   * @returns {CorePersistence} The persistence adapter
   */
  get persistence() {
    return this._persistence;
  }

  /**
   * Gets the onDeleteWithData policy.
   * @returns {'reject'|'cascade'|'warn'} The delete-with-data policy
   */
  get onDeleteWithData() {
    return this._onDeleteWithData;
  }

  /**
   * Gets the current GC policy.
   *
   * @returns {import('./services/GCPolicy.js').GCPolicy} The GC policy configuration
   */
  get gcPolicy() {
    return { ...this._gcPolicy };
  }

  /**
   * Gets the temporal query interface for CTL*-style temporal operators.
   *
   * Returns a TemporalQuery instance that provides `always` and `eventually`
   * operators for evaluating predicates across the graph's history.
   *
   * The instance is lazily created on first access and reused thereafter.
   *
   * @returns {import('./services/TemporalQuery.js').TemporalQuery} Temporal query interface
   *
   * @example
   * const alwaysActive = await graph.temporal.always(
   *   'user:alice',
   *   n => n.props.status === 'active',
   *   { since: 0 }
   * );
   *
   * @example
   * const eventuallyMerged = await graph.temporal.eventually(
   *   'user:alice',
   *   n => n.props.status === 'merged'
   * );
   */
  get temporal() {
    if (!this._temporalQuery) {
      this._temporalQuery = new TemporalQuery({
        /** Loads and causally sorts all patches from every discovered writer. */
        loadAllPatches: async () => {
          const writerIds = await this.discoverWriters();
          const allPatches = [];
          for (const writerId of writerIds) {
            const writerPatches = await this._loadWriterPatches(writerId);
            allPatches.push(...writerPatches);
          }
          return this._sortPatchesCausally(allPatches);
        },
        /** Loads the latest checkpoint state and its max Lamport timestamp. */
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
   *
   * The provenance index maps node/edge IDs to the patch SHAs that affected them.
   * It is built during materialization from the patches' I/O declarations.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @returns {import('./services/provenance/ProvenanceIndex.js').ProvenanceIndex|null} The provenance index, or null if not materialized
   *
   * @example
   * await graph.materialize();
   * const index = graph.provenanceIndex;
   * if (index) {
   *   console.log(`Index contains ${index.size} entities`);
   * }
   */
  get provenanceIndex() {
    return this._provenanceIndex;
  }
}

// ── Materialize methods: direct delegation to MaterializeController ─────────
const materializeDelegates = /** @type {const} */ ([
  'materialize', '_materializeGraph',
  '_resolveCeiling', '_buildAdjacency', '_setMaterializedState', '_buildView',
  'materializeCoordinate', '_materializeWithCeiling', '_materializeWithCoordinate',
  '_persistSeekCacheEntry', '_restoreIndexFromCache',
  'materializeAt', 'verifyIndex', 'invalidateIndex',
]);
for (const method of materializeDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to MaterializeController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._materializeController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Checkpoint methods: direct delegation to CheckpointController ─────────────
const checkpointDelegates = /** @type {const} */ ([
  'createCheckpoint', 'syncCoverage',
  '_loadLatestCheckpoint', '_loadPatchesSince',
  '_validateMigrationBoundary', '_hasSchema1Patches',
  '_maybeRunGC', 'maybeRunGC', 'runGC', 'getGCMetrics',
]);
for (const method of checkpointDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to CheckpointController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._checkpointController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Patch methods: direct delegation to PatchController ───────────────────────
const patchDelegates = /** @type {const} */ ([
  'createPatch', 'patch', 'patchMany',
  '_nextLamport', '_loadPatchChainFromSha', '_loadWriterPatches',
  'getWriterPatches', '_onPatchCommitted', 'writer',
  '_ensureFreshState', '_readPatchBlob',
  'discoverWriters', 'discoverTicks',
  'join', '_frontierEquals',
]);
for (const method of patchDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to PatchController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._patchController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Strand + conflict methods: direct delegation to StrandController ────────
const strandDelegates = /** @type {const} */ ([
  'createStrand', 'braidStrand', 'getStrand', 'listStrands', 'dropStrand',
  'materializeStrand', 'getStrandPatches', 'patchesForStrand',
  'createStrandPatch', 'patchStrand',
  'queueStrandIntent', 'listStrandIntents', 'tickStrand',
  'analyzeConflicts',
]);
for (const method of strandDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to StrandController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._strandController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Query methods: direct delegation to QueryController ──────────────────────
const queryDelegates = /** @type {const} */ ([
  'hasNode', 'getNodeProps', 'getEdgeProps', 'neighbors',
  'getStateSnapshot', 'getNodes', 'getEdges', 'getPropertyCount',
  'query', 'worldline', 'observer', 'translationCost',
  'getContentOid', 'getContentMeta', 'getContent',
  'getEdgeContentOid', 'getEdgeContentMeta', 'getEdgeContent',
  'getContentStream', 'getEdgeContentStream',
]);
for (const method of queryDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to QueryController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._queryController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Fork methods: direct delegation to ForkController ────────────────────────
const forkDelegates = /** @type {const} */ ([
  'fork', 'createWormhole',
  '_isAncestor', '_relationToCheckpointHead', '_validatePatchAgainstCheckpoint',
]);
for (const method of forkDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to ForkController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._forkController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Provenance methods: direct delegation to ProvenanceController ────────────
const provenanceDelegates = /** @type {const} */ ([
  'patchesFor', 'materializeSlice', '_computeBackwardCone',
  'loadPatchBySha', '_loadPatchBySha', '_loadPatchesBySha', '_sortPatchesCausally',
]);
for (const method of provenanceDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to ProvenanceController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._provenanceController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Subscription methods: direct delegation to SubscriptionController ────────
const subscriptionDelegates = /** @type {const} */ ([
  'subscribe', 'watch', '_notifySubscribers',
]);
for (const method of subscriptionDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to SubscriptionController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._subscriptionController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Comparison methods: direct delegation to ComparisonController ────────────
const comparisonDelegates = /** @type {const} */ ([
  'buildPatchDivergence', 'compareStrand', 'planStrandTransfer',
  'planCoordinateTransfer', 'compareCoordinates',
]);
for (const method of comparisonDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to ComparisonController. @param {unknown[]} args @returns {unknown} */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._comparisonController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// ── Sync methods: direct delegation to SyncController (no stub file) ────────
const syncDelegates = /** @type {const} */ ([
  'getFrontier', 'hasFrontierChanged', 'status',
  'createSyncRequest', 'processSyncRequest', 'applySyncResponse',
  'syncNeeded', 'syncWith', 'serve',
]);
for (const method of syncDelegates) {
  Object.defineProperty(WarpRuntime.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** Delegates to the corresponding SyncController method. @param {*[]} args - Forwarded arguments @returns {unknown} Forwarded result */ function (...args) {
      /** @type {unknown} */
      const raw = this;
      const self = /** @type {WarpRuntime} */ (raw);
      const ctrl = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (self._syncController));
      const fn = /** @type {(...a: unknown[]) => unknown} */ (ctrl[method]);
      return fn.call(ctrl, ...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
