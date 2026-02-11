/**
 * Service for DAG traversal operations: BFS, DFS, ancestor/descendant
 * enumeration, and reachability checks.
 *
 * Split from CommitDagTraversalService as part of the SRP refactor.
 *
 * @module domain/services/DagTraversal
 */

import nullLogger from '../utils/nullLogger.js';
import { checkAborted } from '../utils/cancellation.js';

/**
 * @typedef {'forward' | 'reverse'} TraversalDirection
 */

/**
 * @typedef {Object} TraversalNode
 * @property {string} sha - The node's SHA
 * @property {number} depth - Distance from start node
 * @property {string|null} parent - SHA of the node that led to this one
 */

/**
 * Default limits for traversal operations.
 * @const
 */
const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;

/**
 * Service for DAG traversal operations.
 *
 * Provides BFS, DFS, ancestor/descendant enumeration,
 * and reachability checks using async generators for
 * memory-efficient processing of arbitrarily large graphs.
 */
export default class DagTraversal {
  /**
   * Creates a new DagTraversal service.
   *
   * @param {Object} options
   * @param {import('./BitmapIndexReader.js').default} options.indexReader - Index reader for O(1) lookups
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger instance
   */
  constructor(/** @type {{ indexReader: import('./BitmapIndexReader.js').default, logger?: import('../../ports/LoggerPort.js').default }} */ { indexReader, logger = nullLogger } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
    if (!indexReader) {
      throw new Error('DagTraversal requires an indexReader');
    }
    this._indexReader = indexReader;
    this._logger = logger;
  }

  /**
   * Gets neighbors for a node based on direction.
   *
   * @param {string} sha - Node SHA to get neighbors for
   * @param {TraversalDirection} direction - 'forward' for children, 'reverse' for parents
   * @returns {Promise<string[]>} Array of neighbor SHAs
   * @private
   */
  async _getNeighbors(sha, direction) {
    if (direction === 'forward') {
      return await this._indexReader.getChildren(sha);
    }
    return await this._indexReader.getParents(sha);
  }

  /**
   * Breadth-first traversal from a starting node.
   *
   * BFS explores nodes level-by-level, visiting all nodes at depth N before
   * moving to depth N+1. This guarantees that nodes are yielded in order of
   * increasing distance from the start node.
   *
   * @param {Object} options - Traversal options
   * @param {string} options.start - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit
   * @param {number} [options.maxDepth=1000] - Maximum depth to traverse
   * @param {TraversalDirection} [options.direction='forward'] - Traversal direction
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @yields {TraversalNode} Nodes in BFS order
   */
  async *bfs({
    start,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    direction = 'forward',
    signal,
  }) {
    const visited = new Set();
    /** @type {TraversalNode[]} */
    const queue = [{ sha: start, depth: 0, parent: null }];
    let nodesYielded = 0;

    this._logger.debug('BFS started', { start, direction, maxNodes, maxDepth });

    while (queue.length > 0 && nodesYielded < maxNodes) {
      if (nodesYielded % 1000 === 0) {
        checkAborted(signal, 'bfs');
      }

      const current = /** @type {TraversalNode} */ (queue.shift());

      if (visited.has(current.sha)) { continue; }
      if (current.depth > maxDepth) { continue; }

      visited.add(current.sha);
      nodesYielded++;
      yield current;

      if (current.depth < maxDepth) {
        const neighbors = await this._getNeighbors(current.sha, direction);
        for (const neighborSha of neighbors) {
          if (!visited.has(neighborSha)) {
            queue.push({ sha: neighborSha, depth: current.depth + 1, parent: current.sha });
          }
        }
      }
    }

    this._logger.debug('BFS completed', { nodesVisited: nodesYielded, start, direction });
  }

  /**
   * Depth-first pre-order traversal from a starting node.
   *
   * DFS explores as far as possible along each branch before backtracking.
   *
   * @param {Object} options - Traversal options
   * @param {string} options.start - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit
   * @param {number} [options.maxDepth=1000] - Maximum depth to traverse
   * @param {TraversalDirection} [options.direction='forward'] - Traversal direction
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @yields {TraversalNode} Nodes in DFS pre-order
   */
  async *dfs({
    start,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    direction = 'forward',
    signal,
  }) {
    const visited = new Set();
    /** @type {TraversalNode[]} */
    const stack = [{ sha: start, depth: 0, parent: null }];
    let nodesYielded = 0;

    this._logger.debug('DFS started', { start, direction, maxNodes, maxDepth });

    while (stack.length > 0 && nodesYielded < maxNodes) {
      if (nodesYielded % 1000 === 0) {
        checkAborted(signal, 'dfs');
      }

      const current = /** @type {TraversalNode} */ (stack.pop());

      if (visited.has(current.sha)) { continue; }
      if (current.depth > maxDepth) { continue; }

      visited.add(current.sha);
      nodesYielded++;
      yield current;

      if (current.depth < maxDepth) {
        const neighbors = await this._getNeighbors(current.sha, direction);
        // Push in reverse order so first neighbor is processed first
        for (let i = neighbors.length - 1; i >= 0; i--) {
          if (!visited.has(neighbors[i])) {
            stack.push({ sha: neighbors[i], depth: current.depth + 1, parent: current.sha });
          }
        }
      }
    }

    this._logger.debug('DFS completed', { nodesVisited: nodesYielded, start, direction });
  }

  /**
   * Yields all ancestors of a node (transitive closure going backwards).
   *
   * @param {Object} options - Traversal options
   * @param {string} options.sha - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum ancestor nodes to yield
   * @param {number} [options.maxDepth=1000] - Maximum generations to traverse
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @yields {TraversalNode} Ancestor nodes in BFS order
   */
  async *ancestors({ sha, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    yield* this.bfs({ start: sha, maxNodes, maxDepth, direction: 'reverse', signal });
  }

  /**
   * Yields all descendants of a node (transitive closure going forwards).
   *
   * @param {Object} options - Traversal options
   * @param {string} options.sha - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum descendant nodes to yield
   * @param {number} [options.maxDepth=1000] - Maximum generations to traverse
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @yields {TraversalNode} Descendant nodes in BFS order
   */
  async *descendants({ sha, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    yield* this.bfs({ start: sha, maxNodes, maxDepth, direction: 'forward', signal });
  }

  /**
   * Checks if there is any path from one node to another.
   *
   * Delegates to the path-finding service's findPath if one is set,
   * otherwise performs its own BFS-based reachability check.
   *
   * @param {Object} options - Reachability options
   * @param {string} options.from - Source node SHA
   * @param {string} options.to - Target node SHA
   * @param {number} [options.maxDepth=1000] - Maximum search depth
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<boolean>} True if a path exists
   */
  async isReachable({ from, to, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    if (this._pathFinder) {
      const result = await this._pathFinder.findPath({ from, to, maxDepth, signal });
      return result.found;
    }
    // Fallback: BFS-based reachability
    if (from === to) {
      return true;
    }
    for await (const node of this.bfs({ start: from, maxDepth, direction: 'forward', signal })) {
      if (node.sha === to) {
        return true;
      }
    }
    return false;
  }

  /**
   * Sets the path-finding service for reachability delegation.
   *
   * @param {import('./DagPathFinding.js').default} pathFinder - Path finding service
   * @internal
   */
  _setPathFinder(pathFinder) {
    this._pathFinder = pathFinder;
  }
}
