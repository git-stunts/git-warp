/**
 * @fileoverview Empty Graph - A graph database substrate using Git commits pointing to the empty tree.
 */

import GraphService, { DEFAULT_MAX_MESSAGE_BYTES } from './src/domain/services/GraphService.js';
import GitGraphAdapter from './src/infrastructure/adapters/GitGraphAdapter.js';
import GraphNode from './src/domain/entities/GraphNode.js';
import BitmapIndexBuilder from './src/domain/services/BitmapIndexBuilder.js';
import BitmapIndexReader from './src/domain/services/BitmapIndexReader.js';
import IndexRebuildService from './src/domain/services/IndexRebuildService.js';
import HealthCheckService, { HealthStatus } from './src/domain/services/HealthCheckService.js';
import TraversalService from './src/domain/services/TraversalService.js';
import GraphPersistencePort from './src/ports/GraphPersistencePort.js';
import IndexStoragePort from './src/ports/IndexStoragePort.js';
import LoggerPort from './src/ports/LoggerPort.js';
import ClockPort from './src/ports/ClockPort.js';
import NoOpLogger from './src/infrastructure/adapters/NoOpLogger.js';
import ConsoleLogger, { LogLevel } from './src/infrastructure/adapters/ConsoleLogger.js';
import PerformanceClockAdapter from './src/infrastructure/adapters/PerformanceClockAdapter.js';
import GlobalClockAdapter from './src/infrastructure/adapters/GlobalClockAdapter.js';
import {
  IndexError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,
} from './src/domain/errors/index.js';
import { checkAborted, createTimeoutSignal } from './src/domain/utils/cancellation.js';

export {
  GraphService,
  GitGraphAdapter,
  GraphNode,
  BitmapIndexBuilder,
  BitmapIndexReader,
  IndexRebuildService,
  HealthCheckService,
  HealthStatus,
  TraversalService,
  GraphPersistencePort,
  IndexStoragePort,
  DEFAULT_MAX_MESSAGE_BYTES,

  // Logging infrastructure
  LoggerPort,
  NoOpLogger,
  ConsoleLogger,
  LogLevel,

  // Clock infrastructure
  ClockPort,
  PerformanceClockAdapter,
  GlobalClockAdapter,

  // Error types for integrity failure handling
  IndexError,
  ShardLoadError,
  ShardCorruptionError,
  ShardValidationError,
  StorageError,
  TraversalError,
  OperationAbortedError,

  // Cancellation utilities
  checkAborted,
  createTimeoutSignal,
};

/** Default ref for storing the index OID */
export const DEFAULT_INDEX_REF = 'refs/empty-graph/index';

/**
 * Facade class for the EmptyGraph library.
 *
 * Provides a simplified API over the underlying domain services.
 * Requires a persistence adapter that implements both GraphPersistencePort
 * and IndexStoragePort interfaces.
 *
 * ## Error Handling
 *
 * Error types are exported for catching specific failure modes:
 * - {@link ShardValidationError} - Version/checksum mismatch (integrity failure)
 * - {@link ShardCorruptionError} - Invalid shard format (data corruption)
 * - {@link ShardLoadError} - Storage I/O failure
 *
 * @example
 * import EmptyGraph, { ShardValidationError, ShardCorruptionError } from '@git-stunts/empty-graph';
 *
 * try {
 *   const reader = await graph.loadIndex(treeOid);
 * } catch (err) {
 *   if (err instanceof ShardValidationError || err instanceof ShardCorruptionError) {
 *     // Integrity failure - rebuild the index
 *     const newTreeOid = await graph.rebuildIndex(ref);
 *   }
 * }
 *
 * @example
 * import GitPlumbing from '@git-stunts/plumbing';
 * import EmptyGraph, { GitGraphAdapter } from '@git-stunts/empty-graph';
 *
 * const plumbing = new GitPlumbing({ cwd: './my-repo' });
 * const persistence = new GitGraphAdapter({ plumbing });
 * const graph = new EmptyGraph({ persistence });
 *
 * @example
 * // With custom message size limit (512KB)
 * const graph = new EmptyGraph({ persistence, maxMessageBytes: 524288 });
 *
 * @example
 * // With logging enabled
 * import EmptyGraph, { GitGraphAdapter, ConsoleLogger, LogLevel } from '@git-stunts/empty-graph';
 * const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
 * const graph = new EmptyGraph({ persistence, logger });
 */
export default class EmptyGraph {
  /**
   * Creates a new EmptyGraph instance.
   * @param {Object} options
   * @param {GraphPersistencePort & IndexStoragePort} options.persistence - Adapter implementing both persistence ports
   * @param {number} [options.maxMessageBytes=1048576] - Maximum allowed message size in bytes.
   *   Defaults to 1MB (1048576 bytes). Messages exceeding this limit will be rejected.
   * @param {LoggerPort} [options.logger] - Logger for structured logging. Defaults to NoOpLogger (no logging).
   *   Use ConsoleLogger for structured JSON output.
   * @param {ClockPort} [options.clock] - Clock for timing operations. Defaults to PerformanceClockAdapter (Node.js).
   *   Use GlobalClockAdapter for Bun/Deno/Browser environments.
   * @param {number} [options.healthCacheTtlMs=5000] - How long to cache health check results in milliseconds.
   */
  constructor({ persistence, maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES, logger = new NoOpLogger(), clock = new PerformanceClockAdapter(), healthCacheTtlMs = 5000 }) {
    this._persistence = persistence;
    this._logger = logger;
    this._clock = clock;
    this.service = new GraphService({
      persistence: this._persistence,
      maxMessageBytes,
      logger: this._logger.child({ component: 'GraphService' }),
    });
    this.rebuildService = new IndexRebuildService({
      graphService: this.service,
      storage: this._persistence,
      logger: this._logger.child({ component: 'IndexRebuildService' }),
    });
    this._healthService = new HealthCheckService({
      persistence: this._persistence,
      clock: this._clock,
      cacheTtlMs: healthCacheTtlMs,
      logger: this._logger.child({ component: 'HealthCheckService' }),
    });
    /** @type {BitmapIndexReader|null} */
    this._index = null;
    /** @type {string|null} */
    this._indexOid = null;
    /** @type {TraversalService|null} */
    this._traversal = null;
  }

  /**
   * Creates a new graph node.
   * @param {Object} options
   * @param {string} options.message - The node's data/message
   * @param {string[]} [options.parents=[]] - Parent commit SHAs
   * @param {boolean} [options.sign=false] - Whether to GPG-sign
   * @returns {Promise<string>} SHA of the created commit
   * @example
   * const sha = await graph.createNode({
   *   message: 'My node data',
   *   parents: ['abc123...']
   * });
   */
  async createNode(options) {
    return this.service.createNode(options);
  }

  /**
   * Reads a node's message.
   * @param {string} sha - Commit SHA to read
   * @returns {Promise<string>} The node's message
   * @example
   * const message = await graph.readNode(childSha);
   */
  async readNode(sha) {
    return this.service.readNode(sha);
  }

  /**
   * Lists nodes in history (for small graphs).
   * @param {Object} options
   * @param {string} options.ref - Git ref to start from
   * @param {number} [options.limit=50] - Maximum nodes to return
   * @returns {Promise<GraphNode[]>}
   * @example
   * const nodes = await graph.listNodes({ ref: 'HEAD', limit: 100 });
   */
  async listNodes(options) {
    return this.service.listNodes(options);
  }

  /**
   * Async generator for streaming large graphs.
   * @param {Object} options
   * @param {string} options.ref - Git ref to start from
   * @param {number} [options.limit=1000000] - Maximum nodes to yield
   * @yields {GraphNode}
   * @example
   * for await (const node of graph.iterateNodes({ ref: 'HEAD' })) {
   *   console.log(node.message);
   * }
   */
  async *iterateNodes(options) {
    yield* this.service.iterateNodes(options);
  }

  /**
   * Rebuilds the bitmap index for the graph.
   * @param {string} ref - Git ref to rebuild from
   * @param {Object} [options] - Rebuild options
   * @param {number} [options.limit=10000000] - Maximum nodes to index
   * @returns {Promise<string>} OID of the created index tree
   * @example
   * const treeOid = await graph.rebuildIndex('HEAD');
   */
  async rebuildIndex(ref, options) {
    const oid = await this.rebuildService.rebuild(ref, options);
    this._indexOid = oid;
    return oid;
  }

  /**
   * Loads a pre-built bitmap index for O(1) queries.
   * @param {string} treeOid - OID of the index tree (from rebuildIndex)
   * @returns {Promise<void>}
   * @example
   * const treeOid = await graph.rebuildIndex('HEAD');
   * await graph.loadIndex(treeOid);
   * const parents = await graph.getParents(someSha);
   */
  async loadIndex(treeOid) {
    this._index = await this.rebuildService.load(treeOid);
    this._indexOid = treeOid;
    this._healthService.setIndexReader(this._index);
    this._traversal = null; // Reset to pick up new index on next access
  }

  /**
   * Saves the current index OID to a git ref.
   * @param {string} [ref='refs/empty-graph/index'] - The ref to store the index OID
   * @returns {Promise<void>}
   * @throws {Error} If no index has been built or loaded
   * @example
   * await graph.rebuildIndex('HEAD');
   * await graph.saveIndex(); // Saves to refs/empty-graph/index
   */
  async saveIndex(ref = DEFAULT_INDEX_REF) {
    if (!this._indexOid) {
      throw new Error('No index to save. Call rebuildIndex() or loadIndex() first.');
    }
    await this._persistence.updateRef(ref, this._indexOid);
  }

  /**
   * Loads the index from a git ref.
   * @param {string} [ref='refs/empty-graph/index'] - The ref containing the index OID
   * @returns {Promise<boolean>} True if index was loaded, false if ref doesn't exist
   * @example
   * const loaded = await graph.loadIndexFromRef();
   * if (loaded) {
   *   const parents = await graph.getParents(someSha);
   * }
   */
  async loadIndexFromRef(ref = DEFAULT_INDEX_REF) {
    const oid = await this._persistence.readRef(ref);
    if (!oid) {
      return false;
    }
    await this.loadIndex(oid);
    return true;
  }

  /**
   * Gets the current index OID.
   * @returns {string|null} The index tree OID or null if no index is loaded
   */
  get indexOid() {
    return this._indexOid;
  }

  /**
   * Gets parent SHAs for a node using the bitmap index.
   * Requires loadIndex() to be called first.
   * @param {string} sha - The node's SHA
   * @returns {Promise<string[]>} Array of parent SHAs
   * @throws {Error} If index is not loaded
   * @example
   * await graph.loadIndex(indexOid);
   * const parents = await graph.getParents(childSha);
   */
  async getParents(sha) {
    if (!this._index) {
      throw new Error('Index not loaded. Call loadIndex(treeOid) first.');
    }
    return this._index.getParents(sha);
  }

  /**
   * Gets child SHAs for a node using the bitmap index.
   * Requires loadIndex() to be called first.
   * @param {string} sha - The node's SHA
   * @returns {Promise<string[]>} Array of child SHAs
   * @throws {Error} If index is not loaded
   * @example
   * await graph.loadIndex(indexOid);
   * const children = await graph.getChildren(parentSha);
   */
  async getChildren(sha) {
    if (!this._index) {
      throw new Error('Index not loaded. Call loadIndex(treeOid) first.');
    }
    return this._index.getChildren(sha);
  }

  /**
   * Checks if an index is currently loaded.
   * @returns {boolean}
   */
  get hasIndex() {
    return this._index !== null;
  }

  /**
   * Gets the traversal service for graph traversal operations.
   * Requires loadIndex() to be called first.
   * @returns {TraversalService}
   * @throws {Error} If index is not loaded
   * @example
   * await graph.loadIndex(treeOid);
   * for await (const node of graph.traversal.bfs({ start: sha })) {
   *   console.log(node.sha, node.depth);
   * }
   */
  get traversal() {
    if (!this._index) {
      throw new Error('Index not loaded. Call loadIndex(treeOid) first.');
    }
    if (!this._traversal) {
      this._traversal = new TraversalService({
        indexReader: this._index,
        logger: this._logger.child({ component: 'TraversalService' }),
      });
    }
    return this._traversal;
  }

  /**
   * Gets detailed health information for all components.
   *
   * Results are cached for the configured TTL (default 5s) to prevent
   * excessive health check calls under load.
   *
   * @returns {Promise<HealthResult>} Health status with component breakdown
   * @example
   * const health = await graph.getHealth();
   * console.log(health.status); // 'healthy' | 'degraded' | 'unhealthy'
   * console.log(health.components.repository.latencyMs);
   *
   * @typedef {Object} HealthResult
   * @property {'healthy'|'degraded'|'unhealthy'} status - Overall health status
   * @property {Object} components - Component health breakdown
   * @property {string} [cachedAt] - ISO timestamp if result is cached
   */
  async getHealth() {
    return this._healthService.getHealth();
  }

  /**
   * K8s-style readiness probe: Can the service serve requests?
   *
   * Returns true only when all critical components are healthy.
   * Use this to determine if the service should receive traffic.
   *
   * @returns {Promise<boolean>}
   * @example
   * if (await graph.isReady()) {
   *   // Service is ready to handle requests
   * }
   */
  async isReady() {
    return this._healthService.isReady();
  }

  /**
   * K8s-style liveness probe: Is the service alive?
   *
   * Returns true if the repository is accessible (even if degraded).
   * A failed liveness check typically indicates the service needs restart.
   *
   * @returns {Promise<boolean>}
   * @example
   * if (!await graph.isAlive()) {
   *   // Service needs restart
   * }
   */
  async isAlive() {
    return this._healthService.isAlive();
  }
}
