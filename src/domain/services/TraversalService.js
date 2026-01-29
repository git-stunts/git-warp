/**
 * Service for graph traversal operations.
 *
 * Provides BFS, DFS, path finding, and topological sort algorithms
 * using the O(1) bitmap index lookups from BitmapIndexReader.
 *
 * @module domain/services/TraversalService
 */

import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import TraversalError from '../errors/TraversalError.js';

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
 * @typedef {Object} PathResult
 * @property {boolean} found - Whether a path was found
 * @property {string[]} path - Array of SHAs from source to target (empty if not found)
 * @property {number} length - Path length (-1 if not found)
 */

/**
 * Default limits for traversal operations.
 * @const
 */
const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;

/**
 * Service for comprehensive graph traversal operations.
 *
 * All traversal methods use async generators for memory efficiency,
 * allowing processing of arbitrarily large graphs.
 *
 * @example
 * const traversal = new TraversalService({ indexReader });
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
export default class TraversalService {
  /**
   * Creates a new TraversalService.
   *
   * @param {Object} options
   * @param {import('./BitmapIndexReader.js').default} options.indexReader - Index reader for O(1) lookups
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger instance
   */
  constructor({ indexReader, logger = new NoOpLogger() }) {
    this._indexReader = indexReader;
    this._logger = logger;
  }

  /**
   * Gets neighbors for a node based on direction.
   * @param {string} sha - Node SHA
   * @param {TraversalDirection} direction - 'forward' for children, 'reverse' for parents
   * @returns {Promise<string[]>}
   * @private
   */
  async _getNeighbors(sha, direction) {
    if (direction === 'forward') {
      return this._indexReader.getChildren(sha);
    }
    return this._indexReader.getParents(sha);
  }

  /**
   * Breadth-first traversal from a starting node.
   *
   * @param {Object} options
   * @param {string} options.start - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit
   * @param {number} [options.maxDepth=1000] - Maximum depth to traverse
   * @param {TraversalDirection} [options.direction='forward'] - Traversal direction
   * @yields {TraversalNode}
   *
   * @example
   * for await (const node of traversal.bfs({ start: sha, maxDepth: 5 })) {
   *   console.log(`${node.sha} at depth ${node.depth}`);
   * }
   */
  async *bfs({ start, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, direction = 'forward' }) {
    const visited = new Set();
    const queue = [{ sha: start, depth: 0, parent: null }];
    let nodesYielded = 0;

    this._logger.debug('BFS started', { start, direction, maxNodes, maxDepth });

    while (queue.length > 0 && nodesYielded < maxNodes) {
      const current = queue.shift();

      if (visited.has(current.sha)) continue;
      if (current.depth > maxDepth) continue;

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
   * @param {Object} options
   * @param {string} options.start - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit
   * @param {number} [options.maxDepth=1000] - Maximum depth to traverse
   * @param {TraversalDirection} [options.direction='forward'] - Traversal direction
   * @yields {TraversalNode}
   */
  async *dfs({ start, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, direction = 'forward' }) {
    const visited = new Set();
    const stack = [{ sha: start, depth: 0, parent: null }];
    let nodesYielded = 0;

    this._logger.debug('DFS started', { start, direction, maxNodes, maxDepth });

    while (stack.length > 0 && nodesYielded < maxNodes) {
      const current = stack.pop();

      if (visited.has(current.sha)) continue;
      if (current.depth > maxDepth) continue;

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
   * @param {Object} options
   * @param {string} options.sha - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit
   * @param {number} [options.maxDepth=1000] - Maximum depth to traverse
   * @yields {TraversalNode}
   */
  async *ancestors({ sha, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH }) {
    yield* this.bfs({ start: sha, maxNodes, maxDepth, direction: 'reverse' });
  }

  /**
   * Yields all descendants of a node (transitive closure going forwards).
   *
   * @param {Object} options
   * @param {string} options.sha - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit
   * @param {number} [options.maxDepth=1000] - Maximum depth to traverse
   * @yields {TraversalNode}
   */
  async *descendants({ sha, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH }) {
    yield* this.bfs({ start: sha, maxNodes, maxDepth, direction: 'forward' });
  }

  /**
   * Finds ANY path between two nodes using BFS.
   *
   * @param {Object} options
   * @param {string} options.from - Source node SHA
   * @param {string} options.to - Target node SHA
   * @param {number} [options.maxDepth=1000] - Maximum search depth
   * @returns {Promise<PathResult>}
   */
  async findPath({ from, to, maxDepth = DEFAULT_MAX_DEPTH }) {
    if (from === to) {
      return { found: true, path: [from], length: 0 };
    }

    this._logger.debug('findPath started', { from, to, maxDepth });

    const visited = new Set();
    const parentMap = new Map();
    const queue = [{ sha: from, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift();

      if (current.depth > maxDepth) continue;
      if (visited.has(current.sha)) continue;

      visited.add(current.sha);

      if (current.sha === to) {
        // Reconstruct path
        const path = this._reconstructPath(parentMap, from, to);
        this._logger.debug('findPath found', { pathLength: path.length });
        return { found: true, path, length: path.length - 1 };
      }

      const children = await this._indexReader.getChildren(current.sha);
      for (const child of children) {
        if (!visited.has(child)) {
          parentMap.set(child, current.sha);
          queue.push({ sha: child, depth: current.depth + 1 });
        }
      }
    }

    this._logger.debug('findPath not found', { from, to });
    return { found: false, path: [], length: -1 };
  }

  /**
   * Finds the shortest path between two nodes using bidirectional BFS.
   *
   * More efficient than regular BFS for sparse graphs: O(b^(d/2)) vs O(b^d).
   *
   * @param {Object} options
   * @param {string} options.from - Source node SHA
   * @param {string} options.to - Target node SHA
   * @param {number} [options.maxDepth=1000] - Maximum search depth
   * @returns {Promise<PathResult>}
   */
  async shortestPath({ from, to, maxDepth = DEFAULT_MAX_DEPTH }) {
    if (from === to) {
      return { found: true, path: [from], length: 0 };
    }

    this._logger.debug('shortestPath started', { from, to, maxDepth });

    // Forward search state (from -> to, using children)
    const fwdVisited = new Set([from]);
    const fwdParent = new Map();
    let fwdFrontier = [from];

    // Backward search state (to -> from, using parents)
    const bwdVisited = new Set([to]);
    const bwdParent = new Map();
    let bwdFrontier = [to];

    for (let depth = 0; depth < maxDepth; depth++) {
      // Check if frontiers are exhausted
      if (fwdFrontier.length === 0 && bwdFrontier.length === 0) {
        break;
      }

      // Expand forward frontier
      if (fwdFrontier.length > 0) {
        const nextFwd = [];
        for (const sha of fwdFrontier) {
          const children = await this._indexReader.getChildren(sha);
          for (const child of children) {
            if (bwdVisited.has(child)) {
              // Found meeting point
              fwdParent.set(child, sha);
              const path = this._reconstructBidirectionalPath(fwdParent, bwdParent, from, to, child);
              this._logger.debug('shortestPath found', { pathLength: path.length });
              return { found: true, path, length: path.length - 1 };
            }
            if (!fwdVisited.has(child)) {
              fwdVisited.add(child);
              fwdParent.set(child, sha);
              nextFwd.push(child);
            }
          }
        }
        fwdFrontier = nextFwd;
      }

      // Expand backward frontier
      if (bwdFrontier.length > 0) {
        const nextBwd = [];
        for (const sha of bwdFrontier) {
          const parents = await this._indexReader.getParents(sha);
          for (const parent of parents) {
            if (fwdVisited.has(parent)) {
              // Found meeting point
              bwdParent.set(parent, sha);
              const path = this._reconstructBidirectionalPath(fwdParent, bwdParent, from, to, parent);
              this._logger.debug('shortestPath found', { pathLength: path.length });
              return { found: true, path, length: path.length - 1 };
            }
            if (!bwdVisited.has(parent)) {
              bwdVisited.add(parent);
              bwdParent.set(parent, sha);
              nextBwd.push(parent);
            }
          }
        }
        bwdFrontier = nextBwd;
      }
    }

    this._logger.debug('shortestPath not found', { from, to });
    return { found: false, path: [], length: -1 };
  }

  /**
   * Reconstructs path from parent map.
   * @private
   */
  _reconstructPath(parentMap, from, to) {
    const path = [to];
    let current = to;
    while (current !== from) {
      current = parentMap.get(current);
      path.unshift(current);
    }
    return path;
  }

  /**
   * Reconstructs path from bidirectional search.
   * @private
   */
  _reconstructBidirectionalPath(fwdParent, bwdParent, from, to, meeting) {
    // Build forward path (from -> meeting)
    const forwardPath = [meeting];
    let current = meeting;
    while (fwdParent.has(current) && fwdParent.get(current) !== null) {
      current = fwdParent.get(current);
      forwardPath.unshift(current);
    }
    if (forwardPath[0] !== from) {
      forwardPath.unshift(from);
    }

    // Build backward path (meeting -> to)
    current = meeting;
    while (bwdParent.has(current) && bwdParent.get(current) !== null) {
      current = bwdParent.get(current);
      forwardPath.push(current);
    }
    if (forwardPath[forwardPath.length - 1] !== to) {
      forwardPath.push(to);
    }

    return forwardPath;
  }

  /**
   * Checks if there is any path from one node to another.
   *
   * @param {Object} options
   * @param {string} options.from - Source node SHA
   * @param {string} options.to - Target node SHA
   * @param {number} [options.maxDepth=1000] - Maximum search depth
   * @returns {Promise<boolean>}
   */
  async isReachable({ from, to, maxDepth = DEFAULT_MAX_DEPTH }) {
    const result = await this.findPath({ from, to, maxDepth });
    return result.found;
  }

  /**
   * Finds common ancestors of multiple nodes.
   *
   * @param {Object} options
   * @param {string[]} options.shas - Array of node SHAs to find common ancestors for
   * @param {number} [options.maxResults=100] - Maximum ancestors to return
   * @param {number} [options.maxDepth=1000] - Maximum depth to search
   * @returns {Promise<string[]>} Array of common ancestor SHAs
   */
  async commonAncestors({ shas, maxResults = 100, maxDepth = DEFAULT_MAX_DEPTH }) {
    if (shas.length === 0) return [];
    if (shas.length === 1) {
      const ancestors = [];
      for await (const node of this.ancestors({ sha: shas[0], maxNodes: maxResults, maxDepth })) {
        ancestors.push(node.sha);
      }
      return ancestors;
    }

    this._logger.debug('commonAncestors started', { shaCount: shas.length, maxDepth });

    // Count how many times each ancestor appears
    const ancestorCounts = new Map();
    const requiredCount = shas.length;

    for (const sha of shas) {
      const visited = new Set();
      for await (const node of this.ancestors({ sha, maxDepth })) {
        if (!visited.has(node.sha)) {
          visited.add(node.sha);
          ancestorCounts.set(node.sha, (ancestorCounts.get(node.sha) || 0) + 1);
        }
      }
    }

    // Return ancestors that appear in ALL sets
    const common = [];
    for (const [ancestor, count] of ancestorCounts) {
      if (count === requiredCount) {
        common.push(ancestor);
        if (common.length >= maxResults) break;
      }
    }

    this._logger.debug('commonAncestors completed', { found: common.length });
    return common;
  }

  /**
   * Yields nodes in topological order using Kahn's algorithm.
   *
   * Nodes are yielded when all their dependencies (based on direction) are satisfied.
   * If a cycle is detected (nodes yielded < nodes discovered), a warning is logged.
   *
   * @param {Object} options
   * @param {string} options.start - Starting node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to yield
   * @param {TraversalDirection} [options.direction='forward'] - Direction determines dependency order
   * @param {boolean} [options.throwOnCycle=false] - If true, throws TraversalError when cycle detected
   * @yields {TraversalNode}
   * @throws {TraversalError} If throwOnCycle is true and a cycle is detected
   */
  async *topologicalSort({ start, maxNodes = DEFAULT_MAX_NODES, direction = 'forward', throwOnCycle = false }) {
    this._logger.debug('topologicalSort started', { start, direction, maxNodes });

    // Phase 1: Discover all reachable nodes and compute in-degrees
    const inDegree = new Map();
    const allNodes = new Set();
    const edges = new Map(); // sha -> neighbors

    // BFS to find all nodes
    const queue = [start];
    allNodes.add(start);

    while (queue.length > 0) {
      const sha = queue.shift();
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

    // Ensure start node has in-degree entry
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
      const sha = ready.shift();
      const depth = depthMap.get(sha) || 0;

      nodesYielded++;
      yield { sha, depth, parent: null };

      const neighbors = edges.get(sha) || [];
      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDegree);

        if (!depthMap.has(neighbor)) {
          depthMap.set(neighbor, depth + 1);
        }

        if (newDegree === 0) {
          ready.push(neighbor);
        }
      }
    }

    // Phase 3: Detect cycles - if we didn't yield all discovered nodes, there's a cycle
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
