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
import { wireWarpMethods } from './warp/_wire.js';
import * as queryMethods from './warp/query.methods.js';
import * as subscribeMethods from './warp/subscribe.methods.js';
import * as provenanceMethods from './warp/provenance.methods.js';
import * as forkMethods from './warp/fork.methods.js';
import * as syncMethods from './warp/sync.methods.js';
import * as checkpointMethods from './warp/checkpoint.methods.js';
import * as patchMethods from './warp/patch.methods.js';
import * as materializeMethods from './warp/materialize.methods.js';
import * as materializeAdvancedMethods from './warp/materializeAdvanced.methods.js';

/**
 * @typedef {import('../ports/GraphPersistencePort.js').default & import('../ports/RefPort.js').default & import('../ports/CommitPort.js').default & import('../ports/BlobPort.js').default & import('../ports/TreePort.js').default & import('../ports/ConfigPort.js').default} FullPersistence
 */

const DEFAULT_ADJACENCY_CACHE_SIZE = 3;

/**
 * @typedef {Object} MaterializedGraph
 * @property {import('./services/JoinReducer.js').WarpStateV5} state
 * @property {string} stateHash
 * @property {{outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}} adjacency
 */

/**
 * WarpGraph class for interacting with a WARP multi-writer graph.
 */
export default class WarpGraph {
  /**
   * @private
   * @param {Object} options
   * @param {import('../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   * @param {Object} [options.gcPolicy] - GC policy configuration (overrides defaults)
   * @param {number} [options.adjacencyCacheSize] - Max materialized adjacency cache entries
   * @param {{every: number}} [options.checkpointPolicy] - Auto-checkpoint policy; creates a checkpoint every N patches
   * @param {boolean} [options.autoMaterialize=true] - If true, query methods auto-materialize instead of throwing
   * @param {'reject'|'cascade'|'warn'} [options.onDeleteWithData='warn'] - Policy when deleting a node that still has edges or properties
   * @param {import('../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging
   * @param {import('../ports/ClockPort.js').default} [options.clock] - Clock for timing instrumentation (defaults to performance-based clock)
   * @param {import('../ports/CryptoPort.js').default} [options.crypto] - Crypto adapter for hashing
   * @param {import('../ports/CodecPort.js').default} [options.codec] - Codec for CBOR serialization (defaults to domain-local codec)
   * @param {import('../ports/SeekCachePort.js').default} [options.seekCache] - Persistent cache for seek materialization (optional)
   * @param {boolean} [options.audit=false] - If true, creates audit receipts for each data commit
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

    /** @type {Object} */
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
   * @param {Object} [opts] - Options
   * @param {string} [opts.metrics] - Extra metrics string to append in parentheses
   * @param {Error} [opts.error] - If set, logs a failure message instead
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
   * Opens a multi-writer graph.
   *
   * @param {Object} options
   * @param {import('../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   * @param {Object} [options.gcPolicy] - GC policy configuration (overrides defaults)
   * @param {number} [options.adjacencyCacheSize] - Max materialized adjacency cache entries
   * @param {{every: number}} [options.checkpointPolicy] - Auto-checkpoint policy; creates a checkpoint every N patches
   * @param {boolean} [options.autoMaterialize] - If true, query methods auto-materialize instead of throwing
   * @param {'reject'|'cascade'|'warn'} [options.onDeleteWithData] - Policy when deleting a node that still has edges or properties (default: 'warn')
   * @param {import('../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging
   * @param {import('../ports/ClockPort.js').default} [options.clock] - Clock for timing instrumentation (defaults to performance-based clock)
   * @param {import('../ports/CryptoPort.js').default} [options.crypto] - Crypto adapter for hashing
   * @param {import('../ports/CodecPort.js').default} [options.codec] - Codec for CBOR serialization (defaults to domain-local codec)
   * @param {import('../ports/SeekCachePort.js').default} [options.seekCache] - Persistent cache for seek materialization (optional)
   * @param {boolean} [options.audit=false] - If true, creates audit receipts for each data commit
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
   * @returns {Object} The GC policy configuration
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
  syncMethods,
  checkpointMethods,
  patchMethods,
  materializeMethods,
  materializeAdvancedMethods,
]);
