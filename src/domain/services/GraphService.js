import { performance } from 'perf_hooks';
import GitLogParser, { RECORD_SEPARATOR } from './GitLogParser.js';
import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import { checkAborted } from '../utils/cancellation.js';

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
}
