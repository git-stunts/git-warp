/**
 * Service for DAG topology operations: topological sort and
 * common ancestor finding.
 *
 * Split from CommitDagTraversalService as part of the SRP refactor.
 *
 * @module domain/services/DagTopology
 */

import nullLogger from '../utils/nullLogger.js';
import TraversalError from '../errors/TraversalError.js';
import { checkAborted } from '../utils/cancellation.js';

/**
 * @typedef {'forward' | 'reverse'} TraversalDirection
 */

/**
 * Default limits for topology operations.
 * @const
 */
const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;

/**
 * Service for DAG topology operations.
 *
 * Provides topological sort (Kahn's algorithm) and common
 * ancestor finding using the index reader for O(1) lookups.
 */
export default class DagTopology {
  /**
   * Creates a new DagTopology service.
   *
   * @param {Object} options
   * @param {import('./BitmapIndexReader.js').default} options.indexReader - Index reader for O(1) lookups
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger instance
   * @param {import('./DagTraversal.js').default} [options.traversal] - Traversal service for ancestor enumeration
   */
  constructor(/** @type {{ indexReader: import('./BitmapIndexReader.js').default, logger?: import('../../ports/LoggerPort.js').default, traversal?: import('./DagTraversal.js').default }} */ { indexReader, logger = nullLogger, traversal } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
    if (!indexReader) {
      throw new Error('DagTopology requires an indexReader');
    }
    this._indexReader = indexReader;
    this._logger = logger;
    this._traversal = traversal;
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
   * Finds common ancestors of multiple nodes.
   *
   * An ancestor is "common" if it can be reached by following parent edges
   * from ALL of the input nodes.
   *
   * @param {Object} options - Common ancestor options
   * @param {string[]} options.shas - Array of node SHAs
   * @param {number} [options.maxResults=100] - Maximum ancestors to return
   * @param {number} [options.maxDepth=1000] - Maximum depth to search
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<string[]>} Array of common ancestor SHAs
   */
  async commonAncestors({ shas, maxResults = 100, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    if (shas.length === 0) { return []; }
    const traversal = /** @type {import('./DagTraversal.js').default} */ (this._traversal);
    if (shas.length === 1) {
      const ancestors = [];
      for await (const node of traversal.ancestors({ sha: shas[0], maxNodes: maxResults, maxDepth, signal })) {
        ancestors.push(node.sha);
      }
      return ancestors;
    }

    this._logger.debug('commonAncestors started', { shaCount: shas.length, maxDepth });

    const ancestorCounts = new Map();
    const requiredCount = shas.length;

    for (const sha of shas) {
      checkAborted(signal, 'commonAncestors');
      const visited = new Set();
      for await (const node of traversal.ancestors({ sha, maxDepth, signal })) {
        if (!visited.has(node.sha)) {
          visited.add(node.sha);
          ancestorCounts.set(node.sha, (ancestorCounts.get(node.sha) || 0) + 1);
        }
      }
    }

    const common = [];
    for (const [ancestor, count] of ancestorCounts) {
      if (count === requiredCount) {
        common.push(ancestor);
        if (common.length >= maxResults) { break; }
      }
    }

    this._logger.debug('commonAncestors completed', { found: common.length });
    return common;
  }

  /**
   * Yields nodes in topological order using Kahn's algorithm.
   *
   * Topological order ensures that for every directed edge A -> B, node A
   * is yielded before node B.
   *
   * @param {Object} options - Topological sort options
   * @param {string} options.start - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to yield
   * @param {TraversalDirection} [options.direction='forward'] - Direction
   * @param {boolean} [options.throwOnCycle=false] - If true, throws on cycle detection
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @yields {{sha: string, depth: number, parent: null}} Nodes in topological order
   * @throws {TraversalError} With code 'CYCLE_DETECTED' if throwOnCycle is true
   */
  async *topologicalSort({
    start,
    maxNodes = DEFAULT_MAX_NODES,
    direction = 'forward',
    throwOnCycle = false,
    signal,
  }) {
    this._logger.debug('topologicalSort started', { start, direction, maxNodes });

    // Phase 1: Discover all reachable nodes and compute in-degrees
    const inDegree = new Map();
    const allNodes = new Set();
    const edges = new Map();

    const queue = [start];
    allNodes.add(start);

    while (queue.length > 0) {
      if (allNodes.size % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }

      const sha = /** @type {string} */ (queue.shift());
      const neighbors = await this._getNeighbors(sha, direction);
      edges.set(sha, neighbors);

      for (const neighbor of neighbors) {
        inDegree.set(neighbor, (inDegree.get(neighbor) || 0) + 1);
        if (!allNodes.has(neighbor)) {
          allNodes.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (!inDegree.has(start)) {
      inDegree.set(start, 0);
    }

    // Phase 2: Yield nodes with in-degree 0
    const ready = [];
    for (const sha of allNodes) {
      if (!inDegree.has(sha) || inDegree.get(sha) === 0) {
        ready.push(sha);
      }
    }

    let nodesYielded = 0;
    const depthMap = new Map([[start, 0]]);

    while (ready.length > 0 && nodesYielded < maxNodes) {
      if (nodesYielded % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }

      const sha = /** @type {string} */ (ready.shift());
      const depth = depthMap.get(sha) || 0;

      nodesYielded++;
      yield { sha, depth, parent: null };

      const neighbors = edges.get(sha) || [];
      for (const neighbor of neighbors) {
        const newDegree = /** @type {number} */ (inDegree.get(neighbor)) - 1;
        inDegree.set(neighbor, newDegree);

        if (!depthMap.has(neighbor)) {
          depthMap.set(neighbor, depth + 1);
        }

        if (newDegree === 0) {
          ready.push(neighbor);
        }
      }
    }

    // Phase 3: Detect cycles
    const cycleDetected = nodesYielded < allNodes.size;

    if (cycleDetected) {
      const cycleNodeCount = allNodes.size - nodesYielded;
      this._logger.warn('Cycle detected in topological sort', {
        start,
        direction,
        nodesYielded,
        totalNodes: allNodes.size,
        nodesInCycle: cycleNodeCount,
      });

      if (throwOnCycle) {
        throw new TraversalError('Cycle detected in graph during topological sort', {
          code: 'CYCLE_DETECTED',
          context: {
            start,
            direction,
            nodesYielded,
            totalNodes: allNodes.size,
            nodesInCycle: cycleNodeCount,
          },
        });
      }
    }

    this._logger.debug('topologicalSort completed', {
      nodesYielded,
      totalNodes: allNodes.size,
      cycleDetected,
    });
  }
}
