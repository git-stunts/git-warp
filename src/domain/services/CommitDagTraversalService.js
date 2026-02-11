/**
 * Facade for commit DAG traversal operations.
 *
 * Composes DagTraversal, DagPathFinding, and DagTopology services
 * into a single backward-compatible API surface. All public methods
 * delegate to the appropriate sub-service.
 *
 * @module domain/services/CommitDagTraversalService
 */

import nullLogger from '../utils/nullLogger.js';
import DagTraversal from './DagTraversal.js';
import DagPathFinding from './DagPathFinding.js';
import DagTopology from './DagTopology.js';

/**
 * Facade for commit DAG traversal, path-finding, and topology operations.
 *
 * All traversal methods use async generators for memory efficiency,
 * allowing processing of arbitrarily large graphs.
 *
 * @example
 * const traversal = new CommitDagTraversalService({ indexReader });
 *
 * // BFS traversal
 * for await (const node of traversal.bfs({ start: sha })) {
 *   console.log(node.sha, node.depth);
 * }
 *
 * // Find shortest path
 * const result = await traversal.shortestPath({ from: a, to: b });
 * console.log(result.path);
 */
export default class CommitDagTraversalService {
  /**
   * Creates a new CommitDagTraversalService.
   *
   * @param {Object} options
   * @param {import('./BitmapIndexReader.js').default} options.indexReader - Index reader for O(1) lookups
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger instance
   */
  constructor({ indexReader, logger = nullLogger } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
    if (!indexReader) {
      throw new Error('CommitDagTraversalService requires an indexReader');
    }

    this._traversal = new DagTraversal({ indexReader, logger });
    this._pathFinding = new DagPathFinding({ indexReader, logger });
    this._topology = new DagTopology({ indexReader, logger, traversal: this._traversal });

    // Wire up cross-dependency: isReachable delegates to pathFinding.findPath
    this._traversal._setPathFinder(this._pathFinding);
  }

  // ── Traversal methods (delegated to DagTraversal) ───────────────────────

  /**
   * Breadth-first traversal from a starting node.
   * @param {*} options
   * @see DagTraversal#bfs
   */
  bfs(options) {
    return this._traversal.bfs(options);
  }

  /**
   * Depth-first pre-order traversal from a starting node.
   * @param {*} options
   * @see DagTraversal#dfs
   */
  dfs(options) {
    return this._traversal.dfs(options);
  }

  /**
   * Yields all ancestors of a node.
   * @param {*} options
   * @see DagTraversal#ancestors
   */
  ancestors(options) {
    return this._traversal.ancestors(options);
  }

  /**
   * Yields all descendants of a node.
   * @param {*} options
   * @see DagTraversal#descendants
   */
  descendants(options) {
    return this._traversal.descendants(options);
  }

  /**
   * Checks if there is any path from one node to another.
   * @param {*} options
   * @see DagTraversal#isReachable
   */
  isReachable(options) {
    return this._traversal.isReachable(options);
  }

  // ── Path-finding methods (delegated to DagPathFinding) ──────────────────

  /**
   * Finds ANY path between two nodes using BFS.
   * @param {*} options
   * @see DagPathFinding#findPath
   */
  findPath(options) {
    return this._pathFinding.findPath(options);
  }

  /**
   * Finds the shortest path using bidirectional BFS.
   * @param {*} options
   * @see DagPathFinding#shortestPath
   */
  shortestPath(options) {
    return this._pathFinding.shortestPath(options);
  }

  /**
   * Finds shortest path using Dijkstra's algorithm.
   * @param {*} options
   * @see DagPathFinding#weightedShortestPath
   */
  weightedShortestPath(options) {
    return this._pathFinding.weightedShortestPath(options);
  }

  /**
   * Finds shortest path using A* with heuristic guidance.
   * @param {*} options
   * @see DagPathFinding#aStarSearch
   */
  aStarSearch(options) {
    return this._pathFinding.aStarSearch(options);
  }

  /**
   * Bi-directional A* search.
   * @param {*} options
   * @see DagPathFinding#bidirectionalAStar
   */
  bidirectionalAStar(options) {
    return this._pathFinding.bidirectionalAStar(options);
  }

  // ── Topology methods (delegated to DagTopology) ─────────────────────────

  /**
   * Finds common ancestors of multiple nodes.
   * @param {*} options
   * @see DagTopology#commonAncestors
   */
  commonAncestors(options) {
    return this._topology.commonAncestors(options);
  }

  /**
   * Yields nodes in topological order using Kahn's algorithm.
   * @param {*} options
   * @see DagTopology#topologicalSort
   */
  topologicalSort(options) {
    return this._topology.topologicalSort(options);
  }
}
