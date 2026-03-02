/**
 * WarpGraph - Main API class for WARP multi-writer graph database.
 *
 * Provides a factory for opening multi-writer graphs and methods for
 * creating patches, materializing state, and managing checkpoints.
 *
 * @module domain/WarpGraph
 * @see WARP Spec Section 11
 */

import { validateGraphName, validateWriterId } from './utils/RefLayout.js';
import { createVersionVector } from './crdt/VersionVector.js';
import { DEFAULT_GC_POLICY } from './services/GCPolicy.js';
import { AuditReceiptService } from './services/AuditReceiptService.js';
import { TemporalQuery } from './services/TemporalQuery.js';
import defaultCodec from './utils/defaultCodec.js';
import defaultCrypto from './utils/defaultCrypto.js';
import defaultClock from './utils/defaultClock.js';
import LogicalTraversal from './services/LogicalTraversal.js';
import LRUCache from './utils/LRUCache.js';
import SyncController from './services/SyncController.js';
import MaterializedViewService from './services/MaterializedViewService.js';
import { wireWarpMethods } from './warp/_wire.js';
import * as queryMethods from './warp/query.methods.js';
import * as subscribeMethods from './warp/subscribe.methods.js';
import * as provenanceMethods from './warp/provenance.methods.js';
import * as forkMethods from './warp/fork.methods.js';
import * as checkpointMethods from './warp/checkpoint.methods.js';
import * as patchMethods from './warp/patch.methods.js';
import * as materializeMethods from './warp/materialize.methods.js';
import * as materializeAdvancedMethods from './warp/materializeAdvanced.methods.js';

/**
 * @typedef {import('../ports/CommitPort.js').default & import('../ports/BlobPort.js').default & import('../ports/TreePort.js').default & import('../ports/RefPort.js').default} FullPersistence
 */

const DEFAULT_ADJACENCY_CACHE_SIZE = 3;

/**
 * @typedef {Object} MaterializedGraph
 * @property {import('./services/JoinReducer.js').WarpStateV5} state
 * @property {string|null} stateHash
 * @property {{outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}} adjacency
 * @property {import('./services/BitmapNeighborProvider.js').default} [provider]
 */

/**
 * WarpGraph class for interacting with a WARP multi-writer graph.
 */
export default class WarpGraph {
  /**
   * @private
   * @param {{ persistence: FullPersistence, graphName: string, writerId: string, gcPolicy?: Record<string, unknown>, adjacencyCacheSize?: number, checkpointPolicy?: {every: number}, autoMaterialize?: boolean, onDeleteWithData?: 'reject'|'cascade'|'warn', logger?: import('../ports/LoggerPort.js').default, clock?: import('../ports/ClockPort.js').default, crypto?: import('../ports/CryptoPort.js').default, codec?: import('../ports/CodecPort.js').default, seekCache?: import('../ports/SeekCachePort.js').default, audit?: boolean }} options
   */
  constructor({ persistence, graphName, writerId, gcPolicy = {}, adjacencyCacheSize = DEFAULT_ADJACENCY_CACHE_SIZE, checkpointPolicy, autoMaterialize = true, onDeleteWithData = 'warn', logger, clock, crypto, codec, seekCache, audit = false }) {
    /** @type {FullPersistence} */
    this._persistence = /** @type {FullPersistence} */ (persistence);

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;

    /** @type {import('./crdt/VersionVector.js').VersionVector} */
    this._versionVector = createVersionVector();

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

    /** @type {import('./services/ProvenanceIndex.js').ProvenanceIndex|null} */
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

    /** @type {SyncController} */
    this._syncController = new SyncController(this);

    /** @type {MaterializedViewService} */
    this._viewService = new MaterializedViewService({
      codec: this._codec,
      logger: this._logger || undefined,
    });

    /** @type {import('./services/BitmapNeighborProvider.js').LogicalIndex|null} */
    this._logicalIndex = null;

    /** @type {import('./services/PropertyIndexReader.js').default|null} */
    this._propertyReader = null;

    /** @type {string|null} */
    this._cachedViewHash = null;

    /** @type {Record<string, Uint8Array>|null} */
    this._cachedIndexTree = null;

    /** @type {boolean} */
    this._indexDegraded = false;
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
    if (error) {
      this._logger.info(`[warp] ${op} failed in ${elapsed}ms`, { error: error.message });
    } else {
      const suffix = metrics ? ` (${metrics})` : '';
      this._logger.info(`[warp] ${op} completed in ${elapsed}ms${suffix}`);
    }
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
   * @param {{ persistence: FullPersistence, graphName: string, writerId: string, gcPolicy?: Record<string, unknown>, adjacencyCacheSize?: number, checkpointPolicy?: {every: number}, autoMaterialize?: boolean, onDeleteWithData?: 'reject'|'cascade'|'warn', logger?: import('../ports/LoggerPort.js').default, clock?: import('../ports/ClockPort.js').default, crypto?: import('../ports/CryptoPort.js').default, codec?: import('../ports/CodecPort.js').default, seekCache?: import('../ports/SeekCachePort.js').default, audit?: boolean }} options
   * @returns {Promise<WarpGraph>} The opened graph instance
   * @throws {Error} If graphName, writerId, checkpointPolicy, or onDeleteWithData is invalid
   *
   * @example
   * const graph = await WarpGraph.open({
   *   persistence: gitAdapter,
   *   graphName: 'events',
   *   writerId: 'node-1'
   * });
   */
  static async open({ persistence, graphName, writerId, gcPolicy = {}, adjacencyCacheSize, checkpointPolicy, autoMaterialize, onDeleteWithData, logger, clock, crypto, codec, seekCache, audit }) {
    // Validate inputs
    validateGraphName(graphName);
    validateWriterId(writerId);

    if (!persistence) {
      throw new Error('persistence is required');
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

    // Validate onDeleteWithData
    if (onDeleteWithData !== undefined) {
      const valid = ['reject', 'cascade', 'warn'];
      if (!valid.includes(onDeleteWithData)) {
        throw new Error(`onDeleteWithData must be one of: ${valid.join(', ')}`);
      }
    }

    const graph = new WarpGraph({ persistence, graphName, writerId, gcPolicy, adjacencyCacheSize, checkpointPolicy, autoMaterialize, onDeleteWithData, logger, clock, crypto, codec, seekCache, audit });

    // Validate migration boundary
    await graph._validateMigrationBoundary();

    // Initialize audit service if enabled
    if (graph._audit) {
      graph._auditService = new AuditReceiptService({
        persistence: /** @type {import('./types/WarpPersistence.js').CorePersistence} */ (persistence),
        graphName,
        writerId,
        codec: graph._codec,
        crypto: graph._crypto,
        logger: graph._logger || undefined,
      });
      await graph._auditService.init();
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
   * @returns {FullPersistence} The persistence adapter
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
        loadAllPatches: async () => {
          const writerIds = await this.discoverWriters();
          const allPatches = [];
          for (const writerId of writerIds) {
            const writerPatches = await this._loadWriterPatches(writerId);
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
   *
   * The provenance index maps node/edge IDs to the patch SHAs that affected them.
   * It is built during materialization from the patches' I/O declarations.
   *
   * **Requires a cached state.** Call materialize() first if not already cached.
   *
   * @returns {import('./services/ProvenanceIndex.js').ProvenanceIndex|null} The provenance index, or null if not materialized
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

// ── Wire extracted method groups onto WarpGraph.prototype ───────────────────
wireWarpMethods(WarpGraph, [
  queryMethods,
  subscribeMethods,
  provenanceMethods,
  forkMethods,
  checkpointMethods,
  patchMethods,
  materializeMethods,
  materializeAdvancedMethods,
]);

// ── Sync methods: direct delegation to SyncController (no stub file) ────────
const syncDelegates = /** @type {const} */ ([
  'getFrontier', 'hasFrontierChanged', 'status',
  'createSyncRequest', 'processSyncRequest', 'applySyncResponse',
  'syncNeeded', 'syncWith', 'serve',
]);
for (const method of syncDelegates) {
  Object.defineProperty(WarpGraph.prototype, method, {
    // eslint-disable-next-line object-shorthand -- function keyword needed for `this` binding
    value: /** @this {WarpGraph} @param {*[]} args */ function (...args) {
      return this._syncController[method](...args);
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
