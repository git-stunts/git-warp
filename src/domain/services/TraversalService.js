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
import MinHeap from '../utils/MinHeap.js';

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
   * Finds shortest path using Dijkstra's algorithm with custom edge weights.
   *
   * @param {Object} options
   * @param {string} options.from - Starting SHA
   * @param {string} options.to - Target SHA
   * @param {Function} [options.weightProvider] - Callback (fromSha, toSha) => number, defaults to 1
   * @param {string} [options.direction='children'] - 'children' or 'parents'
   * @returns {Promise<{path: string[], totalCost: number}>}
   * @throws {TraversalError} If no path exists between from and to
   */
  async weightedShortestPath({ from, to, weightProvider = () => 1, direction = 'children' }) {
    this._logger.debug('weightedShortestPath started', { from, to, direction });

    // Initialize distances map with Infinity for all except `from` (0)
    const distances = new Map();
    distances.set(from, 0);

    // Track previous node for path reconstruction
    const previous = new Map();

    // Use MinHeap as priority queue
    const pq = new MinHeap();
    pq.insert(from, 0);

    // Track visited nodes
    const visited = new Set();

    while (!pq.isEmpty()) {
      const current = pq.extractMin();

      // Skip if already visited
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      // If we reached the target, reconstruct and return path
      if (current === to) {
        const path = this._reconstructWeightedPath(previous, from, to);
        const totalCost = distances.get(to);
        this._logger.debug('weightedShortestPath found', { pathLength: path.length, totalCost });
        return { path, totalCost };
      }

      // Get neighbors based on direction
      const neighbors =
        direction === 'children'
          ? await this._indexReader.getChildren(current)
          : await this._indexReader.getParents(current);

      // Relax edges to neighbors
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) {
          continue;
        }

        const edgeWeight = weightProvider(current, neighbor);
        const newDist = distances.get(current) + edgeWeight;
        const currentDist = distances.has(neighbor) ? distances.get(neighbor) : Infinity;

        if (newDist < currentDist) {
          distances.set(neighbor, newDist);
          previous.set(neighbor, current);
          pq.insert(neighbor, newDist);
        }
      }
    }

    // No path found
    this._logger.debug('weightedShortestPath not found', { from, to });
    throw new TraversalError(`No path exists from ${from} to ${to}`, {
      code: 'NO_PATH',
      context: { from, to, direction },
    });
  }

  /**
   * Finds shortest path using A* algorithm with heuristic guidance.
   *
   * A* uses f(n) = g(n) + h(n) where:
   * - g(n) = actual cost from start to n
   * - h(n) = heuristic estimate from n to goal
   *
   * Tie-breaking strategy: When two nodes have equal f(n) values, we favor
   * the node with higher g(n) (more actual progress made, less heuristic
   * estimate remaining). This improves efficiency by preferring nodes that
   * are closer to the goal. We achieve this by using priority = f - epsilon * g
   * where epsilon is very small (1e-10), so nodes with higher g get slightly
   * lower priority values and are extracted first from the min-heap.
   *
   * @param {Object} options
   * @param {string} options.from - Starting SHA
   * @param {string} options.to - Target SHA
   * @param {Function} [options.weightProvider] - (fromSha, toSha) => number, defaults to 1
   * @param {Function} [options.heuristicProvider] - (sha, targetSha) => number, defaults to 0 (becomes Dijkstra)
   * @param {string} [options.direction='children'] - 'children' or 'parents'
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number}>}
   * @throws {TraversalError} If no path exists
   */
  async aStarSearch({ from, to, weightProvider = () => 1, heuristicProvider = () => 0, direction = 'children' }) {
    this._logger.debug('aStarSearch started', { from, to, direction });

    // Epsilon for tie-breaking: small enough not to affect ordering by f,
    // but large enough to break ties in favor of higher g (more progress made)
    const EPSILON = 1e-10;

    // gScore: actual cost from start to node
    const gScore = new Map();
    gScore.set(from, 0);

    // fScore: g(n) + h(n) - used for priority queue ordering
    const fScore = new Map();
    const initialH = heuristicProvider(from, to);
    const initialG = 0;
    fScore.set(from, initialH);

    // Track previous node for path reconstruction
    const previous = new Map();

    // Use MinHeap as priority queue, ordered by fScore with tie-breaking
    // Priority = f - epsilon * g: when f values are equal, higher g wins
    const pq = new MinHeap();
    pq.insert(from, initialH - EPSILON * initialG);

    // Track visited nodes
    const visited = new Set();

    // Track nodes explored for benchmarking heuristic quality
    let nodesExplored = 0;

    while (!pq.isEmpty()) {
      const current = pq.extractMin();

      // Skip if already visited
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      nodesExplored++;

      // If we reached the target, reconstruct and return path
      if (current === to) {
        const path = this._reconstructWeightedPath(previous, from, to);
        const totalCost = gScore.get(to);
        this._logger.debug('aStarSearch found', { pathLength: path.length, totalCost, nodesExplored });
        return { path, totalCost, nodesExplored };
      }

      // Get neighbors based on direction
      const neighbors =
        direction === 'children'
          ? await this._indexReader.getChildren(current)
          : await this._indexReader.getParents(current);

      // Relax edges to neighbors
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) {
          continue;
        }

        const edgeWeight = weightProvider(current, neighbor);
        const tentativeG = gScore.get(current) + edgeWeight;
        const currentG = gScore.has(neighbor) ? gScore.get(neighbor) : Infinity;

        if (tentativeG < currentG) {
          // This path to neighbor is better
          previous.set(neighbor, current);
          gScore.set(neighbor, tentativeG);
          const h = heuristicProvider(neighbor, to);
          const f = tentativeG + h;
          fScore.set(neighbor, f);
          // Tie-breaking: subtract epsilon * g so higher g values get lower priority
          pq.insert(neighbor, f - EPSILON * tentativeG);
        }
      }
    }

    // No path found
    this._logger.debug('aStarSearch not found', { from, to, nodesExplored });
    throw new TraversalError(`No path exists from ${from} to ${to}`, {
      code: 'NO_PATH',
      context: { from, to, direction, nodesExplored },
    });
  }

  /**
   * Bi-directional A* search - meets in the middle from both ends.
   *
   * Runs two A* searches simultaneously: forward from 'from' and backward from 'to'.
   * Terminates when the searches meet, potentially exploring far fewer nodes than
   * unidirectional A*.
   *
   * @param {Object} options
   * @param {string} options.from - Starting SHA
   * @param {string} options.to - Target SHA
   * @param {Function} [options.weightProvider] - (fromSha, toSha) => number
   * @param {Function} [options.forwardHeuristic] - (sha, targetSha) => number, for forward search
   * @param {Function} [options.backwardHeuristic] - (sha, targetSha) => number, for backward search
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number}>}
   * @throws {TraversalError} If no path exists between from and to
   */
  async bidirectionalAStar({
    from,
    to,
    weightProvider = () => 1,
    forwardHeuristic = () => 0,
    backwardHeuristic = () => 0,
  }) {
    this._logger.debug('bidirectionalAStar started', { from, to });

    // Handle trivial case
    if (from === to) {
      return { path: [from], totalCost: 0, nodesExplored: 1 };
    }

    // Forward search state (from -> to, using children)
    const fwdGScore = new Map();
    fwdGScore.set(from, 0);
    const fwdPrevious = new Map(); // Maps node -> predecessor in forward path
    const fwdVisited = new Set();
    const fwdHeap = new MinHeap();
    const fwdInitialH = forwardHeuristic(from, to);
    fwdHeap.insert(from, fwdInitialH);

    // Backward search state (to -> from, using parents)
    const bwdGScore = new Map();
    bwdGScore.set(to, 0);
    const bwdNext = new Map(); // Maps node -> successor in backward path (toward 'to')
    const bwdVisited = new Set();
    const bwdHeap = new MinHeap();
    const bwdInitialH = backwardHeuristic(to, from);
    bwdHeap.insert(to, bwdInitialH);

    // Best path found so far
    let mu = Infinity; // Best total cost found
    let meetingPoint = null;

    let nodesExplored = 0;

    while (!fwdHeap.isEmpty() || !bwdHeap.isEmpty()) {
      // Get minimum f-values from each frontier
      const fwdMinF = fwdHeap.isEmpty() ? Infinity : fwdHeap.peekPriority();
      const bwdMinF = bwdHeap.isEmpty() ? Infinity : bwdHeap.peekPriority();

      // Termination condition: when min f-value from either frontier >= best path found
      // This guarantees optimality because any future path through unexpanded nodes
      // would have cost >= their f-value >= mu
      if (Math.min(fwdMinF, bwdMinF) >= mu) {
        break;
      }

      // Expand from whichever frontier has smaller minimum f-value
      if (fwdMinF <= bwdMinF) {
        // Expand forward
        const current = fwdHeap.extractMin();

        if (fwdVisited.has(current)) {
          continue;
        }
        fwdVisited.add(current);
        nodesExplored++;

        // Check if backward search has already visited this node - potential meeting point
        if (bwdVisited.has(current)) {
          const totalCost = fwdGScore.get(current) + bwdGScore.get(current);
          if (totalCost < mu) {
            mu = totalCost;
            meetingPoint = current;
          }
        }

        // Expand forward neighbors (children)
        const children = await this._indexReader.getChildren(current);
        for (const child of children) {
          if (fwdVisited.has(child)) {
            continue;
          }

          const edgeWeight = weightProvider(current, child);
          const tentativeG = fwdGScore.get(current) + edgeWeight;
          const currentG = fwdGScore.has(child) ? fwdGScore.get(child) : Infinity;

          if (tentativeG < currentG) {
            fwdPrevious.set(child, current);
            fwdGScore.set(child, tentativeG);
            const h = forwardHeuristic(child, to);
            const f = tentativeG + h;
            fwdHeap.insert(child, f);

            // Check if this creates a new meeting point candidate
            if (bwdGScore.has(child)) {
              const totalCost = tentativeG + bwdGScore.get(child);
              if (totalCost < mu) {
                mu = totalCost;
                meetingPoint = child;
              }
            }
          }
        }
      } else {
        // Expand backward
        const current = bwdHeap.extractMin();

        if (bwdVisited.has(current)) {
          continue;
        }
        bwdVisited.add(current);
        nodesExplored++;

        // Check if forward search has already visited this node - potential meeting point
        if (fwdVisited.has(current)) {
          const totalCost = fwdGScore.get(current) + bwdGScore.get(current);
          if (totalCost < mu) {
            mu = totalCost;
            meetingPoint = current;
          }
        }

        // Expand backward neighbors (parents)
        const parents = await this._indexReader.getParents(current);
        for (const parent of parents) {
          if (bwdVisited.has(parent)) {
            continue;
          }

          // Weight is from parent -> current (the actual edge direction)
          const edgeWeight = weightProvider(parent, current);
          const tentativeG = bwdGScore.get(current) + edgeWeight;
          const currentG = bwdGScore.has(parent) ? bwdGScore.get(parent) : Infinity;

          if (tentativeG < currentG) {
            bwdNext.set(parent, current);
            bwdGScore.set(parent, tentativeG);
            const h = backwardHeuristic(parent, from);
            const f = tentativeG + h;
            bwdHeap.insert(parent, f);

            // Check if this creates a new meeting point candidate
            if (fwdGScore.has(parent)) {
              const totalCost = fwdGScore.get(parent) + tentativeG;
              if (totalCost < mu) {
                mu = totalCost;
                meetingPoint = parent;
              }
            }
          }
        }
      }
    }

    // If no meeting point found, no path exists
    if (meetingPoint === null) {
      this._logger.debug('bidirectionalAStar not found', { from, to, nodesExplored });
      throw new TraversalError(`No path exists from ${from} to ${to}`, {
        code: 'NO_PATH',
        context: { from, to, nodesExplored },
      });
    }

    // Reconstruct path: forward path to meeting point + backward path from meeting point
    const path = this._reconstructBidirectionalAStarPath(fwdPrevious, bwdNext, from, to, meetingPoint);

    this._logger.debug('bidirectionalAStar found', { pathLength: path.length, totalCost: mu, nodesExplored });
    return { path, totalCost: mu, nodesExplored };
  }

  /**
   * Reconstructs path from bidirectional A* search.
   * @param {Map} fwdPrevious - Forward search predecessor map
   * @param {Map} bwdNext - Backward search successor map
   * @param {string} from - Start node
   * @param {string} to - End node
   * @param {string} meeting - Meeting point
   * @returns {string[]} Complete path from start to end
   * @private
   */
  _reconstructBidirectionalAStarPath(fwdPrevious, bwdNext, from, to, meeting) {
    // Build forward path (from -> meeting)
    const forwardPath = [];
    let current = meeting;
    while (current !== from) {
      forwardPath.unshift(current);
      current = fwdPrevious.get(current);
    }
    forwardPath.unshift(from);

    // Build backward path (meeting -> to), excluding meeting point (already in forwardPath)
    current = meeting;
    while (current !== to) {
      current = bwdNext.get(current);
      forwardPath.push(current);
    }

    return forwardPath;
  }

  /**
   * Reconstructs path from weighted search previous pointers.
   * @private
   */
  _reconstructWeightedPath(previous, from, to) {
    const path = [to];
    let current = to;
    while (current !== from) {
      current = previous.get(current);
      path.unshift(current);
    }
    return path;
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
