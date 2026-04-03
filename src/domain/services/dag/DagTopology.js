/**
 * Service for DAG topology operations: topological sort and
 * common ancestor finding.
 *
 * Split from CommitDagTraversalService as part of the SRP refactor.
 *
 * @module domain/services/dag/DagTopology
 */

import nullLogger from '../../utils/nullLogger.js';
import TraversalError from '../../errors/TraversalError.js';
import { checkAborted } from '../../utils/cancellation.js';

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
   * @param {{ indexReader: import('../index/BitmapIndexReader.js').default, logger?: import('../../../ports/LoggerPort.js').default, traversal?: import('./DagTraversal.js').default }} options
   */
  constructor({ indexReader, logger = nullLogger, traversal }) {
    if (indexReader === null || indexReader === undefined) {
      throw new TraversalError('DagTopology requires an indexReader', { code: 'E_MISSING_INDEX_READER' });
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
   * @param {{ shas: string[], maxResults?: number, maxDepth?: number, signal?: AbortSignal }} options - Common ancestor options
   * @returns {Promise<string[]>} Array of common ancestor SHAs
   */
  async commonAncestors({ shas, maxResults = 100, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    if (shas.length === 0) { return []; }
    const traversal = /** @type {import('./DagTraversal.js').default} */ (this._traversal);
    if (shas.length === 1) {
      const firstSha = shas[0] ?? '';
      const ancestors = [];
      for await (const node of traversal.ancestors({ sha: firstSha, maxNodes: maxResults, maxDepth, ...(signal ? { signal } : {}) })) {
        ancestors.push(node.sha);
      }
      return ancestors;
    }

    this._logger.debug('commonAncestors started', { shaCount: shas.length, maxDepth });

    /** @type {Map<string, number>} */
    const ancestorCounts = new Map();
    const requiredCount = shas.length;

    for (const sha of shas) {
      checkAborted(signal, 'commonAncestors');
      const visited = new Set();
      for await (const node of traversal.ancestors({ sha, maxDepth, ...(signal ? { signal } : {}) })) {
        if (!visited.has(node.sha)) {
          visited.add(node.sha);
          ancestorCounts.set(node.sha, (/** @type {number} */ (ancestorCounts.get(node.sha)) ?? 0) + 1);
        }
      }
    }

    /** @type {string[]} */
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
   * @param {{ start: string, maxNodes?: number, direction?: TraversalDirection, throwOnCycle?: boolean, signal?: AbortSignal }} options - Topological sort options
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
    /** @type {Map<string, number>} */
    const inDegree = new Map();
    /** @type {Set<string>} */
    const allNodes = new Set();
    /** @type {Map<string, string[]>} */
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
        inDegree.set(neighbor, (/** @type {number} */ (inDegree.get(neighbor)) ?? 0) + 1);
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
    /** @type {Map<string, number>} */
    const depthMap = new Map([[start, 0]]);

    while (ready.length > 0 && nodesYielded < maxNodes) {
      if (nodesYielded % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }

      const sha = /** @type {string} */ (ready.shift());
      /** @type {number} */
      const depth = depthMap.get(sha) ?? 0;

      nodesYielded++;
      yield { sha, depth, parent: null };

      /** @type {string[]} */
      const neighbors = edges.get(sha) ?? [];
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
