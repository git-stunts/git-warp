import GitLogParser, { RECORD_SEPARATOR } from './GitLogParser.js';

/**
 * Domain service for graph database operations.
 *
 * Orchestrates graph operations using injected dependencies:
 * - **persistence**: Adapter for git operations (commits, logs, refs)
 * - **parser**: Parser for git log output streams
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
   */
  constructor({ persistence, parser = new GitLogParser() }) {
    this.persistence = persistence;
    this.parser = parser;
  }

  /**
   * Creates a new node in the graph.
   *
   * @param {Object} options - Node creation options
   * @param {string} options.message - The commit message (required)
   * @param {string[]} [options.parents=[]] - Parent commit SHAs
   * @param {boolean} [options.sign=false] - Whether to GPG-sign the commit
   * @returns {Promise<string>} The SHA of the newly created node
   */
  async createNode({ message, parents = [], sign = false }) {
    return await this.persistence.commitNode({ message, parents, sign });
  }

  /**
   * Reads a node's message by SHA.
   *
   * @param {string} sha - The node's SHA
   * @returns {Promise<string>} The node's commit message
   */
  async readNode(sha) {
    return await this.persistence.showNode(sha);
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
   * @yields {GraphNode} Graph nodes parsed from git history
   * @throws {Error} If limit is invalid (not a number, < 1, or > 10,000,000)
   *
   * @example
   * // Stream through a large history
   * for await (const node of service.iterateNodes({ ref: 'main', limit: 1000000 })) {
   *   processNode(node);
   * }
   */
  async *iterateNodes({ ref, limit = 1000000 }) {
    // Validate limit to prevent DoS attacks
    if (typeof limit !== 'number' || limit < 1 || limit > 10000000) {
      throw new Error(`Invalid limit: ${limit}. Must be between 1 and 10,000,000`);
    }

    // Format: SHA, author, date, parents (newline-separated), then message, terminated by NUL
    // NUL bytes cannot appear in git commit messages, making this a safe unambiguous delimiter
    const format = ['%H', '%an', '%ad', '%P', '%B'].join('%n') + RECORD_SEPARATOR;

    const stream = await this.persistence.logNodesStream({ ref, limit, format });

    yield* this.parser.parse(stream);
  }
}
