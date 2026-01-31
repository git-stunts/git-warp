import { performance } from 'perf_hooks';
import GitLogParser, { RECORD_SEPARATOR } from './GitLogParser.js';
import GraphNode from '../entities/GraphNode.js';
import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import { checkAborted } from '../utils/cancellation.js';
import EmptyMessageError from '../errors/EmptyMessageError.js';

/** Default maximum message size in bytes (1MB) */
export const DEFAULT_MAX_MESSAGE_BYTES = 1048576;

/**
 * Domain service for graph database operations.
 *
 * Orchestrates graph operations using injected dependencies:
 * - **persistence**: Adapter for git operations (commits, logs, refs)
 * - **parser**: Parser for git log output streams
 * - **logger**: Logger for structured logging (optional)
 *
 * @example
 * // Production usage with defaults
 * const service = new GraphService({ persistence: gitAdapter });
 *
 * @example
 * // Testing with mock parser
 * const mockParser = {
 *   async *parse() { yield mockNode; }
 * };
 * const service = new GraphService({ persistence: mockPersistence, parser: mockParser });
 *
 * @example
 * // Custom message size limit (512KB)
 * const service = new GraphService({ persistence: gitAdapter, maxMessageBytes: 524288 });
 *
 * @example
 * // With logging enabled
 * const service = new GraphService({ persistence: gitAdapter, logger: consoleLogger });
 */
export default class GraphService {
  /**
   * Creates a new GraphService instance.
   *
   * @param {Object} options - Configuration options
   * @param {Object} options.persistence - Persistence adapter implementing GraphPersistencePort.
   *   Required methods: commitNode, showNode, logNodesStream
   * @param {GitLogParser} [options.parser=new GitLogParser()] - Parser for git log streams.
   *   Defaults to GitLogParser. Inject a mock for testing.
   * @param {number} [options.maxMessageBytes=1048576] - Maximum allowed message size in bytes.
   *   Defaults to 1MB (1048576 bytes). Messages exceeding this limit will be rejected.
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging.
   *   Defaults to NoOpLogger (no logging). Inject ConsoleLogger or custom logger for output.
   */
  constructor({ persistence, parser = new GitLogParser(), maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES, logger = new NoOpLogger() }) {
    if (!persistence) {
      throw new Error('GraphService requires a persistence adapter');
    }
    if (maxMessageBytes <= 0) {
      throw new Error('maxMessageBytes must be a positive number');
    }
    this.persistence = persistence;
    this.parser = parser;
    this.maxMessageBytes = maxMessageBytes;
    this.logger = logger;
  }

  /**
   * Creates a new node in the graph.
   *
   * @param {Object} options - Node creation options
   * @param {string} options.message - The commit message (required)
   * @param {string[]} [options.parents=[]] - Parent commit SHAs
   * @param {boolean} [options.sign=false] - Whether to GPG-sign the commit
   * @returns {Promise<string>} The SHA of the newly created node
   * @throws {Error} If message size exceeds maxMessageBytes limit
   */
  async createNode({ message, parents = [], sign = false }) {
    if (typeof message !== 'string') {
      throw new Error('message must be a string');
    }
    if (message.length === 0) {
      throw new EmptyMessageError('message must be non-empty', { operation: 'createNode' });
    }
    // Validate message size
    const messageBytes = Buffer.byteLength(message, 'utf-8');
    if (messageBytes > this.maxMessageBytes) {
      this.logger.warn('Message size exceeds limit', {
        operation: 'createNode',
        messageBytes,
        maxMessageBytes: this.maxMessageBytes,
      });
      throw new Error(
        `Message size ${messageBytes} bytes exceeds maximum allowed ${this.maxMessageBytes} bytes`
      );
    }
    const startTime = performance.now();
    const sha = await this.persistence.commitNode({ message, parents, sign });
    const durationMs = performance.now() - startTime;
    this.logger.debug('Node created', {
      operation: 'createNode',
      sha,
      parentCount: parents.length,
      messageBytes,
      durationMs,
    });
    return sha;
  }

  /**
   * Reads a node's message by SHA.
   *
   * @param {string} sha - The node's SHA
   * @returns {Promise<string>} The node's commit message
   */
  async readNode(sha) {
    const startTime = performance.now();
    const message = await this.persistence.showNode(sha);
    const durationMs = performance.now() - startTime;
    this.logger.debug('Node read', {
      operation: 'readNode',
      sha,
      messageBytes: Buffer.byteLength(message, 'utf-8'),
      durationMs,
    });
    return message;
  }

  /**
   * Checks if a node exists by SHA.
   *
   * This is an efficient existence check that does not load the node's content.
   * Non-existent SHAs return false rather than throwing an error.
   *
   * @param {string} sha - The node's SHA to check
   * @returns {Promise<boolean>} True if the node exists, false otherwise
   */
  async hasNode(sha) {
    const startTime = performance.now();
    const exists = await this.persistence.nodeExists(sha);
    const durationMs = performance.now() - startTime;
    this.logger.debug('Node existence check', {
      operation: 'hasNode',
      sha,
      exists,
      durationMs,
    });
    return exists;
  }

  /**
   * Gets a full GraphNode by SHA.
   *
   * Returns the complete node with all metadata (sha, message, author, date, parents).
   * Use this when you need more than just the message content.
   *
   * @param {string} sha - The node's SHA
   * @returns {Promise<GraphNode>} The complete graph node
   * @throws {Error} If the SHA is invalid or node doesn't exist
   *
   * @example
   * const node = await service.getNode('abc123...');
   * console.log(node.sha);      // 'abc123...'
   * console.log(node.message);  // 'My commit message'
   * console.log(node.author);   // 'Alice'
   * console.log(node.date);     // '2026-01-29T10:30:00-05:00'
   * console.log(node.parents);  // ['def456...']
   */
  async getNode(sha) {
    const startTime = performance.now();
    const nodeInfo = await this.persistence.getNodeInfo(sha);
    const durationMs = performance.now() - startTime;

    const node = new GraphNode({
      sha: nodeInfo.sha,
      message: nodeInfo.message,
      author: nodeInfo.author,
      date: nodeInfo.date,
      parents: nodeInfo.parents,
    });

    this.logger.debug('Node retrieved', {
      operation: 'getNode',
      sha,
      messageBytes: Buffer.byteLength(nodeInfo.message, 'utf-8'),
      parentCount: nodeInfo.parents.length,
      durationMs,
    });

    return node;
  }

  /**
   * Lists nodes in history.
   *
   * Collects all nodes from the async generator into an array.
   * For large histories, use {@link iterateNodes} instead to avoid OOM.
   *
   * @param {Object} options - Query options
   * @param {string} options.ref - Git ref to start from (e.g., 'main', 'HEAD', SHA)
   * @param {number} [options.limit=50] - Maximum nodes to return
   * @returns {Promise<GraphNode[]>} Array of graph nodes
   */
  async listNodes({ ref, limit = 50 }) {
    const nodes = [];
    for await (const node of this.iterateNodes({ ref, limit })) {
      nodes.push(node);
    }
    return nodes;
  }

  /**
   * Async generator for streaming nodes from history.
   *
   * Essential for processing millions of nodes without OOM. Yields nodes
   * one at a time as they are parsed from the git log stream.
   *
   * @param {Object} options - Query options
   * @param {string} options.ref - Git ref to start from (e.g., 'main', 'HEAD', SHA)
   * @param {number} [options.limit=1000000] - Maximum nodes to yield (1 to 10,000,000)
   * @param {AbortSignal} [options.signal] - Optional abort signal for cancellation
   * @yields {GraphNode} Graph nodes parsed from git history
   * @throws {Error} If limit is invalid (not a number, < 1, or > 10,000,000)
   * @throws {OperationAbortedError} If signal is aborted during iteration
   *
   * @example
   * // Stream through a large history
   * for await (const node of service.iterateNodes({ ref: 'main', limit: 1000000 })) {
   *   processNode(node);
   * }
   *
   * @example
   * // Stream with cancellation support
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 5000); // Cancel after 5s
   * for await (const node of service.iterateNodes({ ref: 'main', signal: controller.signal })) {
   *   processNode(node);
   * }
   */
  async *iterateNodes({ ref, limit = 1000000, signal }) {
    // Validate limit to prevent DoS attacks
    if (typeof limit !== 'number' || limit < 1 || limit > 10000000) {
      this.logger.warn('Invalid limit provided', {
        operation: 'iterateNodes',
        limit,
        ref,
      });
      throw new Error(`Invalid limit: ${limit}. Must be between 1 and 10,000,000`);
    }

    this.logger.debug('Starting node iteration', {
      operation: 'iterateNodes',
      ref,
      limit,
    });

    const startTime = performance.now();

    // Format: SHA, author, date, parents (newline-separated), then message, terminated by NUL
    // NUL bytes cannot appear in git commit messages, making this a safe unambiguous delimiter
    const format = ['%H', '%an', '%ad', '%P', '%B'].join('%n') + RECORD_SEPARATOR;

    const stream = await this.persistence.logNodesStream({ ref, limit, format });

    let yieldedCount = 0;
    for await (const node of this.parser.parse(stream, { signal })) {
      checkAborted(signal, 'iterateNodes');
      yieldedCount++;
      yield node;
    }

    const durationMs = performance.now() - startTime;
    this.logger.debug('Node iteration complete', {
      operation: 'iterateNodes',
      ref,
      yieldedCount,
      durationMs,
    });
  }

  /**
   * Counts nodes reachable from a ref without loading them into memory.
   *
   * This is an efficient O(1) memory operation using `git rev-list --count`.
   * Use this for statistics or progress tracking without memory overhead.
   *
   * @param {string} ref - Git ref to count from (e.g., 'HEAD', 'main', SHA)
   * @returns {Promise<number>} The count of reachable nodes
   *
   * @example
   * const count = await service.countNodes('HEAD');
   * console.log(`Graph has ${count} nodes`);
   *
   * @example
   * // Count nodes on a specific branch
   * const count = await service.countNodes('feature-branch');
   */
  async countNodes(ref) {
    const startTime = performance.now();
    const count = await this.persistence.countNodes(ref);
    const durationMs = performance.now() - startTime;
    this.logger.debug('Node count complete', {
      operation: 'countNodes',
      ref,
      count,
      durationMs,
    });
    return count;
  }

  /**
   * Validates a single node specification for bulk creation.
   * @param {Object} spec - The node specification to validate
   * @param {number} index - The index in the batch (for error messages)
   * @returns {{message: string, parents: string[]}} Validated node spec
   * @throws {Error} If the spec is invalid
   * @private
   */
  _validateNodeSpec(spec, index) {
    if (!spec || typeof spec !== 'object') {
      throw new Error(`Node at index ${index} must be an object`);
    }

    const { message, parents = [] } = spec;

    if (typeof message !== 'string') {
      throw new Error(`Node at index ${index}: message must be a string`);
    }
    if (message.length === 0) {
      throw new EmptyMessageError(`Node at index ${index}: message must be non-empty`, {
        operation: 'createNodes',
        context: { index }
      });
    }

    const messageBytes = Buffer.byteLength(message, 'utf-8');
    if (messageBytes > this.maxMessageBytes) {
      this.logger.warn('Message size exceeds limit in bulk create', {
        operation: 'createNodes',
        index,
        messageBytes,
        maxMessageBytes: this.maxMessageBytes,
      });
      throw new Error(
        `Node at index ${index}: message size ${messageBytes} bytes exceeds maximum allowed ${this.maxMessageBytes} bytes`
      );
    }

    if (!Array.isArray(parents)) {
      throw new Error(`Node at index ${index}: parents must be an array`);
    }

    this._validateParentRefs(parents, index);

    return { message, parents };
  }

  /**
   * Validates parent references for a node in bulk creation.
   * @param {string[]} parents - Array of parent references
   * @param {number} nodeIndex - The index of the node in the batch
   * @throws {Error} If any parent reference is invalid
   * @private
   */
  _validateParentRefs(parents, nodeIndex) {
    for (let j = 0; j < parents.length; j++) {
      const parent = parents[j];
      if (typeof parent !== 'string') {
        throw new Error(`Node at index ${nodeIndex}: parent at index ${j} must be a string`);
      }

      if (parent.startsWith('$')) {
        const refIndex = parseInt(parent.slice(1), 10);
        if (isNaN(refIndex) || refIndex < 0 || refIndex >= nodeIndex) {
          const errorDetail = nodeIndex === 0
            ? `Placeholder '${parent}' is invalid: must reference an earlier node, but this is the first node`
            : `Must reference an earlier node index (0 to ${nodeIndex - 1})`;
          throw new Error(
            `Node at index ${nodeIndex}: invalid placeholder '${parent}'. ${errorDetail}`
          );
        }
      }
    }
  }

  /**
   * Resolves placeholder references in parent array to actual SHAs.
   * @param {string[]} parents - Array of parent references
   * @param {string[]} createdShas - Array of already-created SHAs
   * @returns {string[]} Resolved parent SHAs
   * @private
   */
  _resolveParentRefs(parents, createdShas) {
    return parents.map(parent => {
      if (parent.startsWith('$')) {
        const refIndex = parseInt(parent.slice(1), 10);
        return createdShas[refIndex];
      }
      return parent;
    });
  }

  /**
   * Creates multiple nodes in the graph in bulk.
   *
   * Validates all inputs upfront before creating any nodes, ensuring atomicity
   * at the validation level - if any node spec is invalid, no nodes are created.
   *
   * Nodes can reference each other via a special placeholder syntax: `$0`, `$1`, etc.
   * These placeholders refer to the SHA of nodes created earlier in the same batch
   * (by their array index).
   *
   * @param {Array<{message: string, parents?: string[]}>} nodes - Array of node specifications
   * @param {Object} [options={}] - Options for bulk creation
   * @param {boolean} [options.sign=false] - Whether to GPG-sign the commits
   * @returns {Promise<string[]>} Array of created SHAs in the same order as input
   * @throws {Error} If any node spec is invalid (message not string, message too large, invalid parent)
   *
   * @example
   * // Create independent nodes
   * const shas = await service.createNodes([
   *   { message: 'Node A' },
   *   { message: 'Node B' },
   * ]);
   *
   * @example
   * // Create nodes with parent relationships to each other
   * const shas = await service.createNodes([
   *   { message: 'Root node' },
   *   { message: 'Child of root', parents: ['$0'] }, // References first node
   *   { message: 'Another child', parents: ['$0'] },
   *   { message: 'Grandchild', parents: ['$1', '$2'] }, // References both children
   * ]);
   *
   * @example
   * // Mix external and internal parents
   * const existingSha = 'abc123...';
   * const shas = await service.createNodes([
   *   { message: 'Branch from existing', parents: [existingSha] },
   *   { message: 'Continue branch', parents: ['$0'] },
   * ]);
   *
   * @example
   * // Create signed commits
   * const shas = await service.createNodes([
   *   { message: 'Signed node' },
   * ], { sign: true });
   */
  async createNodes(nodes, { sign = false } = {}) {
    const startTime = performance.now();

    if (!Array.isArray(nodes)) {
      throw new Error('createNodes requires an array of node specifications');
    }

    if (nodes.length === 0) {
      this.logger.debug('createNodes called with empty array', {
        operation: 'createNodes',
        nodeCount: 0,
        durationMs: performance.now() - startTime,
      });
      return [];
    }

    // Phase 1: Validate all inputs upfront
    const validatedNodes = nodes.map((spec, i) => this._validateNodeSpec(spec, i));

    // Phase 2: Create nodes sequentially (required for placeholder resolution)
    const createdShas = [];
    for (const { message, parents } of validatedNodes) {
      const resolvedParents = this._resolveParentRefs(parents, createdShas);
      const sha = await this.persistence.commitNode({
        message,
        parents: resolvedParents,
        sign,
      });
      createdShas.push(sha);
    }

    const durationMs = performance.now() - startTime;
    this.logger.debug('Bulk node creation complete', {
      operation: 'createNodes',
      nodeCount: createdShas.length,
      durationMs,
    });

    return createdShas;
  }
}
