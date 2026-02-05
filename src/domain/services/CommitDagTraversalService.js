/**
 * Service for commit DAG traversal operations.
 *
 * Provides BFS, DFS, path finding, and topological sort algorithms
 * using the O(1) bitmap index lookups from BitmapIndexReader.
 *
 * @module domain/services/CommitDagTraversalService
 */

import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import TraversalError from '../errors/TraversalError.js';
import MinHeap from '../utils/MinHeap.js';
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
 * Service for commit DAG traversal operations.
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
  constructor({ indexReader, logger = new NoOpLogger() } = {}) {
    if (!indexReader) {
      throw new Error('CommitDagTraversalService requires an indexReader');
    }
    this._indexReader = indexReader;
    this._logger = logger;
  }

  /**
   * Gets neighbors for a node based on direction.
   *
   * This is an internal helper that abstracts the direction-specific neighbor
   * lookup. For 'forward' direction, it returns children (nodes that this node
   * points to). For 'reverse' direction, it returns parents (nodes that point
   * to this node).
   *
   * @param {string} sha - Node SHA to get neighbors for
   * @param {TraversalDirection} direction - 'forward' for children, 'reverse' for parents
   * @returns {Promise<string[]>} Array of neighbor SHAs (may be empty if node has no neighbors)
   * @throws {Error} If sha is not found in the index (propagated from indexReader)
   * @throws {ShardLoadError} If the required shard cannot be loaded from storage
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
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
   * The traversal stops when any of these conditions are met:
   * - `maxNodes` nodes have been yielded
   * - `maxDepth` has been reached
   * - No more reachable nodes exist
   * - The operation is aborted via the signal
   *
   * @param {Object} options - Traversal options
   * @param {string} options.start - Starting node SHA (must exist in index)
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit before stopping
   * @param {number} [options.maxDepth=1000] - Maximum depth to traverse (nodes beyond this are skipped)
   * @param {TraversalDirection} [options.direction='forward'] - Traversal direction:
   *   'forward' follows children (outgoing edges), 'reverse' follows parents (incoming edges)
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @yields {TraversalNode} Nodes in BFS order with their depth and parent information
   * @throws {OperationAbortedError} If the signal is aborted during traversal
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // Basic BFS from a starting node
   * for await (const node of traversal.bfs({ start: sha, maxDepth: 5 })) {
   *   console.log(`${node.sha} at depth ${node.depth}`);
   * }
   *
   * @example
   * // BFS with cancellation support
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 5000); // Cancel after 5s
   * for await (const node of traversal.bfs({ start: sha, signal: controller.signal })) {
   *   processNode(node);
   * }
   */
  async *bfs({ start, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, direction = 'forward', signal }) {
    const visited = new Set();
    const queue = [{ sha: start, depth: 0, parent: null }];
    let nodesYielded = 0;

    this._logger.debug('BFS started', { start, direction, maxNodes, maxDepth });

    while (queue.length > 0 && nodesYielded < maxNodes) {
      if (nodesYielded % 1000 === 0) {
        checkAborted(signal, 'bfs');
      }

      const current = queue.shift();

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
   * Pre-order means nodes are yielded when first visited (before their children).
   * This is useful for exploring deep paths or when you need to process ancestors
   * before descendants.
   *
   * The traversal stops when any of these conditions are met:
   * - `maxNodes` nodes have been yielded
   * - `maxDepth` has been reached on a path
   * - No more reachable nodes exist
   * - The operation is aborted via the signal
   *
   * @param {Object} options - Traversal options
   * @param {string} options.start - Starting node SHA (must exist in index)
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit before stopping
   * @param {number} [options.maxDepth=1000] - Maximum depth to traverse (paths beyond this are pruned)
   * @param {TraversalDirection} [options.direction='forward'] - Traversal direction:
   *   'forward' follows children, 'reverse' follows parents
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @yields {TraversalNode} Nodes in DFS pre-order with their depth and parent information
   * @throws {OperationAbortedError} If the signal is aborted during traversal
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // DFS to explore deep paths first
   * for await (const node of traversal.dfs({ start: sha })) {
   *   console.log(`${node.sha} at depth ${node.depth}`);
   * }
   */
  async *dfs({ start, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, direction = 'forward', signal }) {
    const visited = new Set();
    const stack = [{ sha: start, depth: 0, parent: null }];
    let nodesYielded = 0;

    this._logger.debug('DFS started', { start, direction, maxNodes, maxDepth });

    while (stack.length > 0 && nodesYielded < maxNodes) {
      if (nodesYielded % 1000 === 0) {
        checkAborted(signal, 'dfs');
      }

      const current = stack.pop();

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
   * Ancestors are nodes reachable by following parent edges from the starting node.
   * This is equivalent to BFS with direction='reverse'. The starting node itself
   * is included as the first yielded node (depth 0).
   *
   * @param {Object} options - Traversal options
   * @param {string} options.sha - Starting node SHA (must exist in index)
   * @param {number} [options.maxNodes=100000] - Maximum ancestor nodes to yield
   * @param {number} [options.maxDepth=1000] - Maximum generations to traverse backwards
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @yields {TraversalNode} Ancestor nodes in BFS order (closest ancestors first)
   * @throws {OperationAbortedError} If the signal is aborted during traversal
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // Find all ancestors of a commit
   * for await (const ancestor of traversal.ancestors({ sha: commitSha })) {
   *   console.log(`Ancestor: ${ancestor.sha}, generations back: ${ancestor.depth}`);
   * }
   */
  async *ancestors({ sha, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    yield* this.bfs({ start: sha, maxNodes, maxDepth, direction: 'reverse', signal });
  }

  /**
   * Yields all descendants of a node (transitive closure going forwards).
   *
   * Descendants are nodes reachable by following child edges from the starting node.
   * This is equivalent to BFS with direction='forward'. The starting node itself
   * is included as the first yielded node (depth 0).
   *
   * @param {Object} options - Traversal options
   * @param {string} options.sha - Starting node SHA (must exist in index)
   * @param {number} [options.maxNodes=100000] - Maximum descendant nodes to yield
   * @param {number} [options.maxDepth=1000] - Maximum generations to traverse forwards
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @yields {TraversalNode} Descendant nodes in BFS order (closest descendants first)
   * @throws {OperationAbortedError} If the signal is aborted during traversal
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // Find all descendants of a commit
   * for await (const descendant of traversal.descendants({ sha: commitSha })) {
   *   console.log(`Descendant: ${descendant.sha}, generations forward: ${descendant.depth}`);
   * }
   */
  async *descendants({ sha, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    yield* this.bfs({ start: sha, maxNodes, maxDepth, direction: 'forward', signal });
  }

  /**
   * Finds ANY path between two nodes using BFS (forward direction only).
   *
   * Uses unidirectional BFS from source to target, following child edges.
   * Returns the first path found, which is guaranteed to be a shortest path
   * (in terms of number of edges) due to BFS's level-order exploration.
   *
   * For bidirectional search that may be faster on sparse graphs, use
   * `shortestPath()` instead.
   *
   * Edge case: If `from === to`, returns immediately with a single-node path.
   *
   * @param {Object} options - Path finding options
   * @param {string} options.from - Source node SHA (must exist in index)
   * @param {string} options.to - Target node SHA (must exist in index)
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit before giving up
   * @param {number} [options.maxDepth=1000] - Maximum path length to consider
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @returns {Promise<PathResult>} Result object containing:
   *   - `found`: true if path exists, false otherwise
   *   - `path`: Array of SHAs from source to target (empty if not found)
   *   - `length`: Number of edges in path (-1 if not found)
   * @throws {OperationAbortedError} If the signal is aborted during search
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * const result = await traversal.findPath({ from: sha1, to: sha2 });
   * if (result.found) {
   *   console.log(`Path of length ${result.length}: ${result.path.join(' -> ')}`);
   * }
   */
  async findPath({ from, to, maxNodes = DEFAULT_MAX_NODES, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    if (from === to) {
      return { found: true, path: [from], length: 0 };
    }

    this._logger.debug('findPath started', { from, to, maxNodes, maxDepth });

    const visited = new Set();
    const parentMap = new Map();
    const queue = [{ sha: from, depth: 0 }];

    while (queue.length > 0 && visited.size < maxNodes) {
      if (visited.size % 1000 === 0) {
        checkAborted(signal, 'findPath');
      }

      const current = queue.shift();

      if (current.depth > maxDepth) { continue; }
      if (visited.has(current.sha)) { continue; }

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
   * Bidirectional BFS searches from both ends simultaneously: forward from
   * `from` (following children) and backward from `to` (following parents).
   * When the two frontiers meet, a shortest path has been found.
   *
   * This approach is more efficient than unidirectional BFS for sparse graphs:
   * - Unidirectional: O(b^d) where b=branching factor, d=path length
   * - Bidirectional: O(b^(d/2)) - searches two smaller spheres instead of one large one
   *
   * Edge case: If `from === to`, returns immediately with a single-node path.
   *
   * @param {Object} options - Path finding options
   * @param {string} options.from - Source node SHA (must exist in index)
   * @param {string} options.to - Target node SHA (must exist in index)
   * @param {number} [options.maxDepth=1000] - Maximum search depth per direction
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @returns {Promise<PathResult>} Result object containing:
   *   - `found`: true if path exists, false otherwise
   *   - `path`: Array of SHAs from source to target (empty if not found)
   *   - `length`: Number of edges in path (-1 if not found)
   * @throws {OperationAbortedError} If the signal is aborted during search
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * const result = await traversal.shortestPath({ from: sha1, to: sha2 });
   * if (result.found) {
   *   console.log(`Shortest path has ${result.length} edges`);
   * }
   */
  async shortestPath({ from, to, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
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
      checkAborted(signal, 'shortestPath');

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
   * Dijkstra's algorithm finds the minimum-cost path when edges have non-negative
   * weights. Unlike BFS which minimizes edge count, this minimizes total weight.
   * Uses a min-heap priority queue for O((V + E) log V) complexity.
   *
   * The `weightProvider` callback is called for each edge traversed and can be
   * async. Return higher values for less desirable edges (e.g., longer latency,
   * lower reliability).
   *
   * Edge case: If `from === to`, the algorithm still runs but will return
   * immediately with path [from] and cost 0.
   *
   * @param {Object} options - Path finding options
   * @param {string} options.from - Starting SHA (must exist in index)
   * @param {string} options.to - Target SHA (must exist in index)
   * @param {Function} [options.weightProvider] - Async callback `(fromSha, toSha) => number`
   *   returning the cost of traversing the edge. Must return non-negative values.
   *   Defaults to constant 1 (equivalent to BFS shortest path).
   * @param {string} [options.direction='children'] - Edge direction to follow:
   *   'children' for forward edges, 'parents' for reverse edges
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @returns {Promise<{path: string[], totalCost: number}>} Object containing:
   *   - `path`: Array of SHAs from source to target
   *   - `totalCost`: Sum of edge weights along the path
   * @throws {TraversalError} With code 'NO_PATH' if no path exists between from and to
   * @throws {OperationAbortedError} If the signal is aborted during search
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // Find path minimizing total latency
   * const result = await traversal.weightedShortestPath({
   *   from: sha1,
   *   to: sha2,
   *   weightProvider: async (from, to) => await getEdgeLatency(from, to),
   * });
   * console.log(`Path cost: ${result.totalCost}ms`);
   */
  async weightedShortestPath({ from, to, weightProvider = () => 1, direction = 'children', signal }) {
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
      if (visited.size % 1000 === 0) {
        checkAborted(signal, 'weightedShortestPath');
      }

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

        const edgeWeight = await weightProvider(current, neighbor);
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
   * A* is optimal when the heuristic is admissible (never overestimates).
   * With h(n) = 0, A* degenerates to Dijkstra's algorithm.
   *
   * **Tie-breaking strategy**: When two nodes have equal f(n) values, we favor
   * the node with higher g(n) (more actual progress made, less heuristic
   * estimate remaining). This improves efficiency by preferring nodes that
   * are closer to the goal. We achieve this by using priority = f - epsilon * g
   * where epsilon is very small (1e-10), so nodes with higher g get slightly
   * lower priority values and are extracted first from the min-heap.
   *
   * **Heuristic quality**: The `nodesExplored` return value can be used to
   * benchmark heuristic quality. A perfect heuristic explores only nodes on
   * the optimal path. Compare against Dijkstra (h=0) to measure improvement.
   *
   * @param {Object} options - Path finding options
   * @param {string} options.from - Starting SHA (must exist in index)
   * @param {string} options.to - Target SHA (must exist in index)
   * @param {Function} [options.weightProvider] - Async callback `(fromSha, toSha) => number`
   *   returning the cost of traversing the edge. Must return non-negative values.
   *   Defaults to constant 1.
   * @param {Function} [options.heuristicProvider] - Callback `(sha, targetSha) => number`
   *   returning an estimate of cost from sha to target. Must be admissible
   *   (never overestimate) for optimality. Defaults to 0 (becomes Dijkstra).
   * @param {string} [options.direction='children'] - Edge direction to follow:
   *   'children' for forward edges, 'parents' for reverse edges
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number}>} Object containing:
   *   - `path`: Array of SHAs from source to target
   *   - `totalCost`: Sum of edge weights along the path
   *   - `nodesExplored`: Number of nodes expanded (for benchmarking heuristic quality)
   * @throws {TraversalError} With code 'NO_PATH' if no path exists between from and to
   * @throws {OperationAbortedError} If the signal is aborted during search
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // A* with depth-based heuristic
   * const result = await traversal.aStarSearch({
   *   from: sha1,
   *   to: sha2,
   *   heuristicProvider: (sha, target) => estimateDistance(sha, target),
   * });
   * console.log(`Explored ${result.nodesExplored} nodes`);
   */
  async aStarSearch({ from, to, weightProvider = () => 1, heuristicProvider = () => 0, direction = 'children', signal }) {
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
      if (nodesExplored % 1000 === 0) {
        checkAborted(signal, 'aStarSearch');
      }

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

        const edgeWeight = await weightProvider(current, neighbor);
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
   * Runs two A* searches simultaneously: forward from 'from' (following children)
   * and backward from 'to' (following parents). Terminates when the searches meet,
   * potentially exploring far fewer nodes than unidirectional A*.
   *
   * The algorithm alternates between expanding the frontier with the smaller
   * minimum f-value, which keeps both frontiers roughly balanced.
   *
   * **Termination**: The search terminates when the minimum f-value from either
   * frontier exceeds the best path found so far. This guarantees optimality.
   *
   * **Trivial case**: If `from === to`, returns immediately without exploration.
   *
   * @param {Object} options - Path finding options
   * @param {string} options.from - Starting SHA (must exist in index)
   * @param {string} options.to - Target SHA (must exist in index)
   * @param {Function} [options.weightProvider] - Async callback `(fromSha, toSha) => number`
   *   returning the cost of traversing the edge. Must return non-negative values.
   *   Defaults to constant 1.
   * @param {Function} [options.forwardHeuristic] - Callback `(sha, targetSha) => number`
   *   for the forward search (estimating cost from sha to 'to'). Defaults to 0.
   * @param {Function} [options.backwardHeuristic] - Callback `(sha, targetSha) => number`
   *   for the backward search (estimating cost from sha to 'from'). Defaults to 0.
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number}>} Object containing:
   *   - `path`: Array of SHAs from source to target
   *   - `totalCost`: Sum of edge weights along the optimal path
   *   - `nodesExplored`: Total nodes expanded from both directions
   * @throws {TraversalError} With code 'NO_PATH' if no path exists between from and to
   * @throws {OperationAbortedError} If the signal is aborted during search
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // Bidirectional A* with symmetric heuristics
   * const result = await traversal.bidirectionalAStar({
   *   from: sha1,
   *   to: sha2,
   *   forwardHeuristic: (sha, target) => estimateDistance(sha, target),
   *   backwardHeuristic: (sha, source) => estimateDistance(sha, source),
   * });
   * console.log(`Found path exploring only ${result.nodesExplored} nodes`);
   */
  async bidirectionalAStar({
    from,
    to,
    weightProvider = () => 1,
    forwardHeuristic = () => 0,
    backwardHeuristic = () => 0,
    signal,
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
      if (nodesExplored % 1000 === 0) {
        checkAborted(signal, 'bidirectionalAStar');
      }

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

          const edgeWeight = await weightProvider(current, child);
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
          const edgeWeight = await weightProvider(parent, current);
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
   * Unified helper to reconstruct a path by walking a predecessor map backwards.
   *
   * Walks from `to` back to `from` using the provided predecessor map,
   * building the path in order from start to end.
   *
   * **Edge case handling**: If the predecessor chain is broken (missing entry
   * in the map), logs an error and returns the partial path reconstructed so far.
   * This guards against infinite loops if the search algorithm has a bug, but
   * indicates an internal error that should be investigated.
   *
   * **Invariant**: The returned path always starts with the first node reached
   * during backward traversal and ends with `to`. If reconstruction succeeds
   * fully, the first element is `from`.
   *
   * @param {Map<string, string>} predecessorMap - Maps each node to its predecessor
   *   in the search tree. Built during BFS/DFS/Dijkstra/A* exploration.
   * @param {string} from - Start node (path reconstruction stops here)
   * @param {string} to - End node (path reconstruction starts here)
   * @param {string} [context='Path'] - Context label for error logging (helps identify
   *   which algorithm had the reconstruction failure)
   * @returns {string[]} Path from `from` to `to`. May be partial if predecessor
   *   chain is broken (indicates internal error).
   * @private
   */
  _walkPredecessors(predecessorMap, from, to, context = 'Path') {
    const path = [to];
    let current = to;
    while (current !== from) {
      const prev = predecessorMap.get(current);
      if (prev === undefined) {
        // Guard against infinite loop if algorithm has a bug
        this._logger.error(`${context} reconstruction failed: missing predecessor`, { from, to, path });
        break;
      }
      current = prev;
      path.unshift(current);
    }
    return path;
  }

  /**
   * Unified helper to reconstruct a path by walking a successor map forwards.
   *
   * Walks from `from` to `to` using the provided successor map,
   * building the path in order.
   *
   * **Edge case handling**: If the successor chain is broken (missing entry
   * in the map), logs an error and returns the partial path reconstructed so far.
   * This guards against infinite loops if the search algorithm has a bug, but
   * indicates an internal error that should be investigated.
   *
   * **Invariant**: The returned path always starts with `from` and ends with
   * the last node reached during forward traversal. If reconstruction succeeds
   * fully, the last element is `to`.
   *
   * @param {Map<string, string>} successorMap - Maps each node to its successor
   *   in the search tree. Built during backward searches in bidirectional algorithms.
   * @param {string} from - Start node (path reconstruction starts here)
   * @param {string} to - End node (path reconstruction stops here)
   * @param {string} [context='Path'] - Context label for error logging (helps identify
   *   which algorithm had the reconstruction failure)
   * @returns {string[]} Path from `from` to `to`. May be partial if successor
   *   chain is broken (indicates internal error).
   * @private
   */
  _walkSuccessors(successorMap, from, to, context = 'Path') {
    const path = [from];
    let current = from;
    while (current !== to) {
      const next = successorMap.get(current);
      if (next === undefined) {
        // Guard against infinite loop if algorithm has a bug
        this._logger.error(`${context} reconstruction failed: missing successor`, { from, to, path });
        break;
      }
      current = next;
      path.push(current);
    }
    return path;
  }

  /**
   * Reconstructs path from bidirectional A* search.
   *
   * Combines the forward path (from -> meeting) and backward path (meeting -> to)
   * into a single complete path. The meeting point is included exactly once.
   *
   * **Algorithm**:
   * 1. Walk predecessors from meeting back to from (forward search tree)
   * 2. Walk successors from meeting forward to to (backward search tree)
   * 3. Concatenate, removing duplicate meeting point
   *
   * @param {Map<string, string>} fwdPrevious - Forward search predecessor map
   *   (maps each node to its predecessor toward 'from')
   * @param {Map<string, string>} bwdNext - Backward search successor map
   *   (maps each node to its successor toward 'to')
   * @param {string} from - Start node of the path
   * @param {string} to - End node of the path
   * @param {string} meeting - Meeting point where the two searches intersected
   * @returns {string[]} Complete path from start to end, with meeting point included once
   * @private
   */
  _reconstructBidirectionalAStarPath(fwdPrevious, bwdNext, from, to, meeting) {
    // Build forward path (from -> meeting) using predecessors
    const forwardPath = this._walkPredecessors(fwdPrevious, from, meeting, 'Forward path');

    // Build backward path (meeting -> to) using successors, excluding meeting (already included)
    const backwardPath = this._walkSuccessors(bwdNext, meeting, to, 'Backward path');

    // Combine paths, avoiding duplicate meeting point
    return forwardPath.concat(backwardPath.slice(1));
  }

  /**
   * Reconstructs path from weighted search (Dijkstra/A*) previous pointers.
   *
   * Delegates to `_walkPredecessors` with appropriate context label for debugging.
   *
   * @param {Map<string, string>} previous - Maps each node to its predecessor
   *   in the shortest-path tree built by Dijkstra or A*
   * @param {string} from - Start node (root of shortest-path tree)
   * @param {string} to - End node (target reached by search)
   * @returns {string[]} Path from start to end
   * @private
   */
  _reconstructWeightedPath(previous, from, to) {
    return this._walkPredecessors(previous, from, to, 'Weighted path');
  }

  /**
   * Reconstructs path from BFS parent map.
   *
   * Delegates to `_walkPredecessors` with appropriate context label for debugging.
   * Used by `findPath()` which uses unidirectional BFS.
   *
   * @param {Map<string, string>} parentMap - Maps each node to its predecessor
   *   in the BFS tree (node that first discovered this node)
   * @param {string} from - Start node (root of BFS tree)
   * @param {string} to - End node (target found by BFS)
   * @returns {string[]} Path from start to end
   * @private
   */
  _reconstructPath(parentMap, from, to) {
    return this._walkPredecessors(parentMap, from, to, 'Path');
  }

  /**
   * Reconstructs path from bidirectional BFS search.
   *
   * Combines the forward path (from -> meeting) and backward path (meeting -> to)
   * into a single complete path. Handles edge cases where the meeting point
   * is at an endpoint.
   *
   * **Algorithm**:
   * 1. Walk fwdParent backwards from meeting to from
   * 2. Walk bwdParent forwards from meeting to to
   * 3. Ensure from and to are included even if not in maps
   *
   * **Note**: This method uses a different reconstruction strategy than
   * `_reconstructBidirectionalAStarPath` because bidirectional BFS stores
   * parent pointers differently (both maps point "backwards" in their
   * respective search directions).
   *
   * @param {Map<string, string>} fwdParent - Forward search predecessor map
   *   (maps each node to the node that discovered it from the 'from' side)
   * @param {Map<string, string>} bwdParent - Backward search predecessor map
   *   (maps each node to the node that discovered it from the 'to' side)
   * @param {string} from - Start node of the path
   * @param {string} to - End node of the path
   * @param {string} meeting - Meeting point where forward and backward searches met
   * @returns {string[]} Complete path from start to end
   * @private
   */
  _reconstructBidirectionalPath(fwdParent, bwdParent, from, to, meeting) {
    // Build forward path (from -> meeting)
    const forwardPath = [meeting];
    let current = meeting;
    while (fwdParent.has(current) && fwdParent.get(current) !== undefined) {
      current = fwdParent.get(current);
      forwardPath.unshift(current);
    }
    if (forwardPath[0] !== from) {
      forwardPath.unshift(from);
    }

    // Build backward path (meeting -> to)
    current = meeting;
    while (bwdParent.has(current) && bwdParent.get(current) !== undefined) {
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
   * This is a convenience wrapper around `findPath()` that returns only
   * the boolean reachability result. Use this when you don't need the
   * actual path, just existence.
   *
   * @param {Object} options - Reachability options
   * @param {string} options.from - Source node SHA (must exist in index)
   * @param {string} options.to - Target node SHA (must exist in index)
   * @param {number} [options.maxDepth=1000] - Maximum search depth
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @returns {Promise<boolean>} True if a path exists from source to target
   * @throws {OperationAbortedError} If the signal is aborted during search
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * if (await traversal.isReachable({ from: sha1, to: sha2 })) {
   *   console.log('Target is reachable from source');
   * }
   */
  async isReachable({ from, to, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    const result = await this.findPath({ from, to, maxDepth, signal });
    return result.found;
  }

  /**
   * Finds common ancestors of multiple nodes.
   *
   * An ancestor is "common" if it can be reached by following parent edges
   * from ALL of the input nodes. This is useful for finding merge bases
   * or common history points.
   *
   * **Algorithm**: For each input node, collect all ancestors into a set.
   * Return nodes that appear in ALL sets. Results are not ordered by
   * distance; use additional filtering if you need the nearest common ancestor.
   *
   * **Edge cases**:
   * - Empty `shas` array: Returns empty array
   * - Single SHA: Returns all ancestors of that node (up to maxResults)
   * - Disconnected nodes: Returns empty array (no common ancestors)
   *
   * @param {Object} options - Common ancestor options
   * @param {string[]} options.shas - Array of node SHAs to find common ancestors for
   *   (all must exist in index)
   * @param {number} [options.maxResults=100] - Maximum ancestors to return
   * @param {number} [options.maxDepth=1000] - Maximum depth to search from each node
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @returns {Promise<string[]>} Array of common ancestor SHAs (unordered)
   * @throws {OperationAbortedError} If the signal is aborted during search
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // Find common ancestors of two branches
   * const ancestors = await traversal.commonAncestors({
   *   shas: [branchASha, branchBSha],
   * });
   * console.log(`Found ${ancestors.length} common ancestors`);
   */
  async commonAncestors({ shas, maxResults = 100, maxDepth = DEFAULT_MAX_DEPTH, signal }) {
    if (shas.length === 0) { return []; }
    if (shas.length === 1) {
      const ancestors = [];
      for await (const node of this.ancestors({ sha: shas[0], maxNodes: maxResults, maxDepth, signal })) {
        ancestors.push(node.sha);
      }
      return ancestors;
    }

    this._logger.debug('commonAncestors started', { shaCount: shas.length, maxDepth });

    // Count how many times each ancestor appears
    const ancestorCounts = new Map();
    const requiredCount = shas.length;

    for (const sha of shas) {
      checkAborted(signal, 'commonAncestors');
      const visited = new Set();
      for await (const node of this.ancestors({ sha, maxDepth, signal })) {
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
   * is yielded before node B. This is useful for dependency resolution,
   * build ordering, and causality-respecting iteration.
   *
   * **Algorithm (Kahn's)**:
   * 1. Discover all reachable nodes and compute in-degrees
   * 2. Initialize queue with nodes having in-degree 0
   * 3. Repeatedly: yield a node, decrement neighbors' in-degrees, add to queue when 0
   *
   * **Cycle handling**: Cycles make true topological ordering impossible.
   * If a cycle is detected (fewer nodes yielded than discovered), behavior
   * depends on `throwOnCycle`:
   * - `false` (default): Logs warning, returns partial ordering (nodes outside cycle)
   * - `true`: Throws TraversalError with code 'CYCLE_DETECTED'
   *
   * **Direction semantics**:
   * - 'forward': Yields parents before children (standard dependency order)
   * - 'reverse': Yields children before parents (reverse dependency order)
   *
   * @param {Object} options - Topological sort options
   * @param {string} options.start - Starting node SHA (must exist in index)
   * @param {number} [options.maxNodes=100000] - Maximum nodes to yield
   * @param {TraversalDirection} [options.direction='forward'] - Direction determines edge interpretation
   * @param {boolean} [options.throwOnCycle=false] - If true, throws TraversalError when cycle detected
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation support
   * @yields {TraversalNode} Nodes in topological order. The `depth` field indicates
   *   the node's level in the DAG (distance from nodes with no incoming edges).
   * @throws {TraversalError} With code 'CYCLE_DETECTED' if throwOnCycle is true and
   *   the reachable subgraph contains a cycle
   * @throws {OperationAbortedError} If the signal is aborted during traversal
   * @throws {ShardLoadError} If a required index shard cannot be loaded
   * @throws {ShardCorruptionError} If shard data integrity check fails (strict mode)
   *
   * @example
   * // Process nodes in dependency order
   * for await (const node of traversal.topologicalSort({ start: rootSha })) {
   *   await processNode(node.sha);
   * }
   *
   * @example
   * // Detect cycles in the graph
   * try {
   *   for await (const node of traversal.topologicalSort({
   *     start: sha,
   *     throwOnCycle: true,
   *   })) {
   *     // ...
   *   }
   * } catch (err) {
   *   if (err.code === 'CYCLE_DETECTED') {
   *     console.error(`Graph has a cycle involving ${err.context.nodesInCycle} nodes`);
   *   }
   * }
   */
  async *topologicalSort({ start, maxNodes = DEFAULT_MAX_NODES, direction = 'forward', throwOnCycle = false, signal }) {
    this._logger.debug('topologicalSort started', { start, direction, maxNodes });

    // Phase 1: Discover all reachable nodes and compute in-degrees
    const inDegree = new Map();
    const allNodes = new Set();
    const edges = new Map(); // sha -> neighbors

    // BFS to find all nodes
    const queue = [start];
    allNodes.add(start);

    while (queue.length > 0) {
      if (allNodes.size % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }

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
      if (nodesYielded % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }

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
