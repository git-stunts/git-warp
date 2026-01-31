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
import GraphRefManager from './src/domain/services/GraphRefManager.js';
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

/**
 * Batch context for efficient bulk node creation.
 * Delays ref updates until commit() is called.
 */
class GraphBatch {
  constructor(graph) {
    this._graph = graph;
    this._createdShas = [];
    this._committed = false;
  }

  /**
   * Creates a node without updating refs.
   * @param {Object} options - Same as EmptyGraph.createNode()
   * @returns {Promise<string>} The created SHA
   */
  async createNode(options) {
    if (this._committed) {
      throw new Error('Batch already committed');
    }
    const sha = await this._graph.service.createNode(options);
    this._createdShas.push(sha);
    return sha;
  }

  /**
   * Finds SHAs that are tips (not ancestors of any other SHA in batch).
   * @returns {Promise<string[]>} Array of tip SHAs
   * @private
   */
  async _findDisconnectedTips() {
    if (this._createdShas.length <= 1) {
      return [...this._createdShas];
    }

    const tips = [];
    for (const candidate of this._createdShas) {
      let isAncestorOfAnother = false;
      for (const other of this._createdShas) {
        if (candidate !== other) {
          if (await this._graph._persistence.isAncestor(candidate, other)) {
            isAncestorOfAnother = true;
            break;
          }
        }
      }
      if (!isAncestorOfAnother) {
        tips.push(candidate);
      }
    }
    return tips;
  }

  /**
   * Commits the batch, updating the ref once.
   * @returns {Promise<{count: number, anchor?: string}>}
   */
  async commit() {
    if (this._committed) {
      throw new Error('Batch already committed');
    }
    this._committed = true;

    if (this._createdShas.length === 0) {
      return { count: 0 };
    }

    // Find disconnected tips among created SHAs
    const tips = await this._findDisconnectedTips();

    // Read current ref tip
    const currentTip = await this._graph._persistence.readRef(this._graph._ref);

    // Build octopus: current tip (if exists) + all new tips
    const parents = currentTip ? [currentTip, ...tips] : tips;

    // Create single octopus anchor
    const anchorMessage = JSON.stringify({ _type: 'anchor' });
    const anchorSha = await this._graph._persistence.commitNode({
      message: anchorMessage,
      parents,
    });

    // Update ref
    await this._graph._persistence.updateRef(this._graph._ref, anchorSha);

    return {
      count: this._createdShas.length,
      anchor: anchorSha,
      tips: tips.length,
    };
  }

  /** @returns {string[]} SHAs created in this batch */
  get createdShas() {
    return [...this._createdShas];
  }
}

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

  // Ref management
  GraphRefManager,

  // Batching API
  GraphBatch,

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
   * Opens a managed graph with automatic durability guarantees.
   *
   * @param {Object} options
   * @param {GraphPersistencePort & IndexStoragePort} options.persistence - Adapter
   * @param {string} options.ref - The ref to manage (e.g., 'refs/empty-graph/events')
   * @param {'managed'|'manual'} [options.mode='managed'] - Durability mode
   * @param {'onWrite'|'manual'} [options.autoSync='onWrite'] - When to sync refs
   * @param {number} [options.maxMessageBytes] - Max message size
   * @param {LoggerPort} [options.logger] - Logger
   * @param {ClockPort} [options.clock] - Clock
   * @returns {Promise<EmptyGraph>} Configured graph instance
   */
  static async open({ persistence, ref, mode = 'managed', autoSync = 'onWrite', ...rest }) {
    const graph = new EmptyGraph({ persistence, ...rest });
    graph._ref = ref;
    graph._mode = mode;
    graph._autoSync = autoSync;
    if (mode === 'managed') {
      graph._refManager = new GraphRefManager({
        persistence,
        logger: graph._logger.child({ component: 'GraphRefManager' }),
      });
    }
    return graph;
  }

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
    const sha = await this.service.createNode(options);

    // In managed mode with autoSync='onWrite', sync the ref
    if (this._mode === 'managed' && this._autoSync === 'onWrite' && this._refManager) {
      await this._refManager.syncHead(this._ref, sha);
    }

    return sha;
  }

  /**
   * Creates multiple graph nodes in bulk.
   *
   * Validates all inputs upfront before creating any nodes, ensuring atomicity
   * at the validation level - if any node spec is invalid, no nodes are created.
   *
   * Nodes can reference each other via a special placeholder syntax: `$0`, `$1`, etc.
   * These placeholders refer to the SHA of nodes created earlier in the same batch
   * (by their array index).
   *
   * @param {Array<{message: string, parents?: string[]}>} nodes - Array of node specifications
   * @returns {Promise<string[]>} Array of created SHAs in the same order as input
   * @throws {Error} If any node spec is invalid (message not string, message too large, invalid parent)
   * @example
   * // Create independent nodes
   * const shas = await graph.createNodes([
   *   { message: 'Node A' },
   *   { message: 'Node B' },
   * ]);
   *
   * @example
   * // Create nodes with parent relationships to each other
   * const shas = await graph.createNodes([
   *   { message: 'Root node' },
   *   { message: 'Child of root', parents: ['$0'] },
   *   { message: 'Another child', parents: ['$0'] },
   *   { message: 'Grandchild', parents: ['$1', '$2'] },
   * ]);
   */
  async createNodes(nodes) {
    const shas = await this.service.createNodes(nodes);

    // In managed mode with autoSync='onWrite', sync with the last created node
    if (this._mode === 'managed' && this._autoSync === 'onWrite' && this._refManager && shas.length > 0) {
      // Sync with the last SHA - it should be reachable from all others if they're connected
      // For disconnected nodes, multiple syncs may create anchors
      const lastSha = shas[shas.length - 1];
      await this._refManager.syncHead(this._ref, lastSha);
    }

    return shas;
  }

  /**
   * Manually syncs the ref to make all pending nodes reachable.
   * Only needed when autoSync='manual'.
   *
   * @param {string} [sha] - Specific SHA to sync to. If not provided, uses last created node.
   * @returns {Promise<{updated: boolean, anchor: boolean, sha: string}>}
   */
  async sync(sha) {
    if (!this._refManager) {
      throw new Error('sync() requires managed mode. Use EmptyGraph.open() with mode="managed".');
    }
    if (!sha) {
      throw new Error('sha is required for sync()');
    }
    return this._refManager.syncHead(this._ref, sha);
  }

  /**
   * Begins a batch operation for efficient bulk writes.
   *
   * Batch mode delays ref updates until commit() is called,
   * avoiding per-node overhead for large imports.
   *
   * @returns {GraphBatch} A batch context
   * @example
   * const tx = graph.beginBatch();
   * const a = await tx.createNode({ message: 'A' });
   * const b = await tx.createNode({ message: 'B', parents: [a] });
   * await tx.commit(); // Single ref update
   */
  beginBatch() {
    if (this._mode !== 'managed') {
      throw new Error('beginBatch() requires managed mode. Use EmptyGraph.open() with mode="managed".');
    }
    return new GraphBatch(this);
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
   * Checks if a node exists by SHA.
   *
   * This is an efficient existence check that does not load the node's content.
   * Non-existent SHAs return false rather than throwing an error.
   *
   * @param {string} sha - Commit SHA to check
   * @returns {Promise<boolean>} True if the node exists, false otherwise
   * @example
   * if (await graph.hasNode(sha)) {
   *   const message = await graph.readNode(sha);
   * }
   */
  async hasNode(sha) {
    return this.service.hasNode(sha);
  }

  /**
   * Gets a full GraphNode by SHA.
   *
   * Returns the complete node with all metadata (sha, message, author, date, parents).
   * Use this when you need more than just the message content.
   *
   * @param {string} sha - Commit SHA to retrieve
   * @returns {Promise<GraphNode>} The complete graph node
   * @throws {Error} If the SHA is invalid or node doesn't exist
   * @example
   * const node = await graph.getNode(someSha);
   * console.log(node.sha);      // 'abc123...'
   * console.log(node.message);  // 'My commit message'
   * console.log(node.author);   // 'Alice'
   * console.log(node.date);     // '2026-01-29 10:30:00 -0500'
   * console.log(node.parents);  // ['def456...']
   */
  async getNode(sha) {
    return this.service.getNode(sha);
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

  /**
   * Counts nodes reachable from a ref without loading them into memory.
   *
   * This is an efficient O(1) memory operation using `git rev-list --count`.
   * Use this for statistics or progress tracking without memory overhead.
   *
   * @param {string} ref - Git ref to count from (e.g., 'HEAD', 'main', SHA)
   * @returns {Promise<number>} The count of reachable nodes
   * @example
   * const count = await graph.countNodes('HEAD');
   * console.log(`Graph has ${count} nodes`);
   *
   * @example
   * // Count nodes on a specific branch
   * const count = await graph.countNodes('feature-branch');
   */
  async countNodes(ref) {
    return this.service.countNodes(ref);
  }

  /**
   * Creates an anchor commit to make SHAs reachable from a ref.
   *
   * This is an advanced method for power users who want fine-grained
   * control over ref management. In managed mode, this is handled
   * automatically by createNode().
   *
   * @param {string} ref - The ref to update
   * @param {string|string[]} shas - SHA(s) to anchor
   * @returns {Promise<string>} The anchor commit SHA
   * @example
   * // Anchor a single disconnected node
   * const anchorSha = await graph.anchor('refs/my-graph', nodeSha);
   *
   * @example
   * // Anchor multiple nodes at once
   * const anchorSha = await graph.anchor('refs/my-graph', [sha1, sha2, sha3]);
   */
  async anchor(ref, shas) {
    const shaArray = Array.isArray(shas) ? shas : [shas];

    // Read current ref tip
    const currentTip = await this._persistence.readRef(ref);

    // Build parents: current tip (if exists) + new SHAs
    const parents = currentTip ? [currentTip, ...shaArray] : shaArray;

    // Create anchor commit
    const anchorMessage = JSON.stringify({ _type: 'anchor' });
    const anchorSha = await this._persistence.commitNode({
      message: anchorMessage,
      parents,
    });

    // Update ref to point to anchor
    await this._persistence.updateRef(ref, anchorSha);

    return anchorSha;
  }

  /**
   * Compacts anchor chains into a single octopus anchor.
   *
   * Walks from the ref through commits, identifies real (non-anchor) tips,
   * and creates a fresh octopus anchor with those tips as parents.
   * Useful for cleaning up after many incremental writes.
   *
   * @param {string} [ref] - The ref to compact (defaults to graph's managed ref)
   * @returns {Promise<{compacted: boolean, oldAnchors: number, tips: number, newAnchor?: string}>}
   * @example
   * // After many incremental writes
   * const result = await graph.compactAnchors();
   * console.log(`Replaced ${result.oldAnchors} anchors with 1`);
   */
  async compactAnchors(ref) {
    const targetRef = ref || this._ref;
    if (!targetRef) {
      throw new Error('compactAnchors() requires a ref. Use EmptyGraph.open() or pass ref parameter.');
    }

    const currentTip = await this._persistence.readRef(targetRef);
    if (!currentTip) {
      return { compacted: false, oldAnchors: 0, tips: 0 };
    }

    // Collect all commits reachable from ref, separate anchors from real nodes
    const anchors = [];
    const realNodes = [];

    for await (const node of this.iterateNodes({ ref: targetRef, limit: 1000000 })) {
      if (node.message.startsWith('{"_type":"anchor"')) {
        anchors.push(node.sha);
      } else {
        realNodes.push(node);
      }
    }

    // If no anchors, nothing to compact
    if (anchors.length === 0) {
      return { compacted: false, oldAnchors: 0, tips: realNodes.length };
    }

    // Find tips: real nodes that have no children among real nodes
    const hasChild = new Set();
    for (const node of realNodes) {
      for (const parent of node.parents) {
        hasChild.add(parent);
      }
    }
    const tips = realNodes.filter(n => !hasChild.has(n.sha)).map(n => n.sha);

    if (tips.length === 0) {
      return { compacted: false, oldAnchors: anchors.length, tips: 0 };
    }

    // Create single octopus anchor with all tips
    const anchorMessage = JSON.stringify({ _type: 'anchor' });
    const newAnchor = await this._persistence.commitNode({
      message: anchorMessage,
      parents: tips,
    });

    // Update ref to point to new anchor
    await this._persistence.updateRef(targetRef, newAnchor);

    return {
      compacted: true,
      oldAnchors: anchors.length,
      tips: tips.length,
      newAnchor,
    };
  }
}
