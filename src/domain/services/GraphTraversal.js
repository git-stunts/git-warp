/**
 * GraphTraversal — unified traversal engine for any graph backed by a
 * NeighborProviderPort.
 *
 * Subsumes LogicalTraversal (in-memory adjacency) and DagTraversal /
 * DagPathFinding / DagTopology (bitmap-backed commit DAG). One engine,
 * one set of bugs, one set of fixes.
 *
 * ## Determinism Invariants
 *
 * 1. **BFS**: Nodes at equal depth visited in lexicographic nodeId order.
 * 2. **DFS**: Nodes visited in lexicographic nodeId order (leftmost first
 *    via reverse-push).
 * 3. **PQ/Dijkstra/A***: Equal-priority tie-break by lexicographic nodeId
 *    (ascending). Equal-cost path tie-break: update predecessor when
 *    `altCost === bestCost && candidatePredecessorId < currentPredecessorId`.
 * 4. **Kahn (topoSort)**: Zero-indegree nodes dequeued in lexicographic
 *    nodeId order.
 * 5. **Neighbor lists**: Every NeighborProviderPort returns edges sorted by
 *    (neighborId, label). Strict codepoint comparison, never localeCompare.
 * 6. **Direction 'both'**: union(out, in) deduped by (neighborId, label).
 *    Intentionally lossy about direction.
 * 7. **weightFn/heuristicFn purity**: These functions must be pure and
 *    deterministic for a given (from, to, label) / (nodeId, goalId)
 *    within a traversal run, or determinism is impossible.
 * 8. **Never** rely on JS Map/Set iteration order — always explicit sort.
 *
 * ## Error Handling Convention
 *
 * - `shortestPath` returns `{ found: false, path: [], length: -1 }` on no path.
 * - `weightedShortestPath`, `aStarSearch`, and `bidirectionalAStar` throw
 *   `TraversalError` with code `'NO_PATH'` when no path exists.
 * - All start-node methods throw `TraversalError` with code `'INVALID_START'`
 *   when the start node does not exist in the provider.
 *
 * @module domain/services/GraphTraversal
 */

import nullLogger from '../utils/nullLogger.js';
import TraversalError from '../errors/TraversalError.js';
import MinHeap from '../utils/MinHeap.js';
import LRUCache from '../utils/LRUCache.js';
import { checkAborted } from '../utils/cancellation.js';

/** @typedef {import('../../ports/NeighborProviderPort.js').default} NeighborProviderPort */
/** @typedef {import('../../ports/NeighborProviderPort.js').Direction} Direction */
/** @typedef {import('../../ports/NeighborProviderPort.js').NeighborEdge} NeighborEdge */
/** @typedef {import('../../ports/NeighborProviderPort.js').NeighborOptions} NeighborOptions */

/**
 * @typedef {Object} TraversalStats
 * @property {number} nodesVisited
 * @property {number} edgesTraversed
 * @property {number} cacheHits
 * @property {number} cacheMisses
 */

/**
 * @typedef {Object} TraversalHooks
 * @property {((nodeId: string, depth: number) => void)} [onVisit]
 * @property {((nodeId: string, neighbors: NeighborEdge[]) => void)} [onExpand]
 */

/**
 * Per-run stats accumulator — avoids shared mutable state on the instance.
 * @typedef {Object} RunStats
 * @property {number} cacheHits
 * @property {number} cacheMisses
 * @property {number} edgesTraversed
 */

const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;

/**
 * Default edge weight function: uniform weight of 1.
 * @param {string} _from
 * @param {string} _to
 * @param {string} _label
 * @returns {number}
 */
const DEFAULT_WEIGHT_FN = (_from, _to, _label) => 1;

/**
 * Lexicographic nodeId comparator for MinHeap tie-breaking.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
const lexTieBreaker = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Distinguishes true topological cycles from maxNodes truncation.
 *
 * @param {{ sortedLength: number, discoveredSize: number, maxNodes: number, readyRemaining: boolean }} params
 * @returns {boolean}
 */
function computeTopoHasCycle({
  sortedLength, discoveredSize, maxNodes, readyRemaining,
}) {
  const stoppedByLimit = sortedLength >= maxNodes && readyRemaining;
  return !stoppedByLimit && sortedLength < discoveredSize;
}

// ==== Section 1: Configuration & Neighbor Cache ====

export default class GraphTraversal {
  /**
   * @param {{ provider: NeighborProviderPort, logger?: import('../../ports/LoggerPort.js').default, neighborCacheSize?: number }} params
   */
  constructor({ provider, logger = nullLogger, neighborCacheSize = 256 }) {
    this._provider = provider;
    this._logger = logger;
    /** @type {LRUCache<string, NeighborEdge[]> | null} */
    this._neighborCache = provider.latencyClass === 'sync'
      ? null
      : new LRUCache(neighborCacheSize);
  }

  /**
   * Creates a fresh per-run stats accumulator.
   * @returns {RunStats}
   * @private
   */
  _newRunStats() {
    return { cacheHits: 0, cacheMisses: 0, edgesTraversed: 0 };
  }

  /**
   * Builds a stats snapshot from a per-run accumulator.
   * @param {number} nodesVisited
   * @param {RunStats} rs
   * @returns {TraversalStats}
   * @private
   */
  _stats(nodesVisited, rs) {
    return {
      nodesVisited,
      edgesTraversed: rs.edgesTraversed,
      cacheHits: rs.cacheHits,
      cacheMisses: rs.cacheMisses,
    };
  }

  /**
   * Gets neighbors with optional LRU memoization.
   *
   * @param {string} nodeId
   * @param {Direction} direction
   * @param {RunStats} rs - Per-run stats accumulator
   * @param {NeighborOptions} [options]
   * @returns {Promise<NeighborEdge[]>}
   * @private
   */
  async _getNeighbors(nodeId, direction, rs, options) {
    const cache = this._neighborCache;
    if (!cache) {
      return await this._provider.getNeighbors(nodeId, direction, options);
    }

    const labelsKey = options?.labels
      ? [...options.labels].sort().join('\0')
      : '*';
    const key = `${nodeId}\0${direction}\0${labelsKey}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      rs.cacheHits++;
      return cached;
    }
    rs.cacheMisses++;
    const result = await this._provider.getNeighbors(nodeId, direction, options);
    cache.set(key, result);
    return result;
  }

  // ==== Section 2: Primitive Traversals (BFS, DFS) ====

  /**
   * Breadth-first search.
   *
   * Deterministic: nodes at equal depth are visited in lexicographic nodeId order.
   *
   * @param {{ start: string, direction?: Direction, options?: NeighborOptions, maxNodes?: number, maxDepth?: number, signal?: AbortSignal, hooks?: TraversalHooks }} params
   * @returns {Promise<{nodes: string[], stats: TraversalStats}>}
   */
  async bfs({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal, hooks,
  }) {
    const rs = this._newRunStats();
    await this._validateStart(start);
    const visited = new Set();
    /** @type {Array<{nodeId: string, depth: number}>} */
    let currentLevel = [{ nodeId: start, depth: 0 }];
    const result = [];

    while (currentLevel.length > 0 && visited.size < maxNodes) {
      // Sort current level lexicographically for deterministic order
      currentLevel.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      /** @type {Array<{nodeId: string, depth: number}>} */
      const nextLevel = [];
      /** @type {Set<string>} — dedup within this level to avoid O(E) duplicates */
      const queued = new Set();

      for (const { nodeId, depth } of currentLevel) {
        if (visited.size >= maxNodes) { break; }
        if (visited.has(nodeId)) { continue; }
        if (depth > maxDepth) { continue; }

        if (visited.size % 1000 === 0) {
          checkAborted(signal, 'bfs');
        }

        visited.add(nodeId);
        result.push(nodeId);
        if (hooks?.onVisit) { hooks.onVisit(nodeId, depth); }

        if (depth < maxDepth) {
          const neighbors = await this._getNeighbors(nodeId, direction, rs, options);
          rs.edgesTraversed += neighbors.length;
          if (hooks?.onExpand) { hooks.onExpand(nodeId, neighbors); }
          for (const { neighborId } of neighbors) {
            if (!visited.has(neighborId) && !queued.has(neighborId)) {
              queued.add(neighborId);
              nextLevel.push({ nodeId: neighborId, depth: depth + 1 });
            }
          }
        }
      }
      currentLevel = nextLevel;
    }

    return { nodes: result, stats: this._stats(visited.size, rs) };
  }

  /**
   * Depth-first search (pre-order).
   *
   * Deterministic: leftmost-first via reverse-push of sorted neighbors.
   *
   * @param {{ start: string, direction?: Direction, options?: NeighborOptions, maxNodes?: number, maxDepth?: number, signal?: AbortSignal, hooks?: TraversalHooks }} params
   * @returns {Promise<{nodes: string[], stats: TraversalStats}>}
   */
  async dfs({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal, hooks,
  }) {
    const rs = this._newRunStats();
    await this._validateStart(start);
    const visited = new Set();
    /** @type {Array<{nodeId: string, depth: number}>} */
    const stack = [{ nodeId: start, depth: 0 }];
    const result = [];

    while (stack.length > 0 && visited.size < maxNodes) {
      const { nodeId, depth } = /** @type {{nodeId: string, depth: number}} */ (stack.pop());
      if (visited.has(nodeId)) { continue; }
      if (depth > maxDepth) { continue; }

      if (visited.size % 1000 === 0) {
        checkAborted(signal, 'dfs');
      }

      visited.add(nodeId);
      result.push(nodeId);
      if (hooks?.onVisit) { hooks.onVisit(nodeId, depth); }

      if (depth < maxDepth) {
        const neighbors = await this._getNeighbors(nodeId, direction, rs, options);
        rs.edgesTraversed += neighbors.length;
        if (hooks?.onExpand) { hooks.onExpand(nodeId, neighbors); }
        // Reverse-push so first neighbor (lex smallest) is popped first
        for (let i = neighbors.length - 1; i >= 0; i -= 1) {
          if (!visited.has(neighbors[i].neighborId)) {
            stack.push({ nodeId: neighbors[i].neighborId, depth: depth + 1 });
          }
        }
      }
    }

    return { nodes: result, stats: this._stats(visited.size, rs) };
  }

  // ==== Section 3: Path-Finding (shortestPath, Dijkstra, A*, bidirectional A*) ====

  /**
   * Unweighted shortest path (BFS-based).
   *
   * @param {{ start: string, goal: string, direction?: Direction, options?: NeighborOptions, maxNodes?: number, maxDepth?: number, signal?: AbortSignal }} params
   * @returns {Promise<{found: boolean, path: string[], length: number, stats: TraversalStats}>}
   */
  async shortestPath({
    start, goal, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal,
  }) {
    const rs = this._newRunStats();
    await this._validateStart(start);
    if (start === goal) {
      return { found: true, path: [start], length: 0, stats: this._stats(1, rs) };
    }

    const visited = new Set([start]);
    const parent = new Map();
    /** @type {Array<{nodeId: string, depth: number}>} */
    let frontier = [{ nodeId: start, depth: 0 }];

    while (frontier.length > 0 && visited.size < maxNodes) {
      // Sort frontier for deterministic BFS
      frontier.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      /** @type {Array<{nodeId: string, depth: number}>} */
      const nextFrontier = [];

      for (const { nodeId, depth } of frontier) {
        if (depth >= maxDepth) { continue; }
        if (visited.size % 1000 === 0) {
          checkAborted(signal, 'shortestPath');
        }

        const neighbors = await this._getNeighbors(nodeId, direction, rs, options);
        rs.edgesTraversed += neighbors.length;

        for (const { neighborId } of neighbors) {
          if (visited.has(neighborId)) { continue; }
          visited.add(neighborId);
          parent.set(neighborId, nodeId);

          if (neighborId === goal) {
            const path = this._reconstructPath(parent, start, goal);
            return { found: true, path, length: path.length - 1, stats: this._stats(visited.size, rs) };
          }
          nextFrontier.push({ nodeId: neighborId, depth: depth + 1 });
        }
      }
      frontier = nextFrontier;
    }

    return { found: false, path: [], length: -1, stats: this._stats(visited.size, rs) };
  }

  /**
   * Reachability check — BFS with early termination.
   *
   * @param {{ start: string, goal: string, direction?: Direction, options?: NeighborOptions, maxNodes?: number, maxDepth?: number, signal?: AbortSignal }} params
   * @returns {Promise<{reachable: boolean, stats: TraversalStats}>}
   */
  async isReachable({
    start, goal, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal,
  }) {
    const rs = this._newRunStats();
    if (start === goal) {
      return { reachable: true, stats: this._stats(1, rs) };
    }

    const visited = new Set([start]);
    /** @type {string[]} */
    let frontier = [start];
    let depth = 0;

    while (frontier.length > 0 && depth < maxDepth && visited.size < maxNodes) {
      if (visited.size % 1000 === 0) {
        checkAborted(signal, 'isReachable');
      }
      /** @type {string[]} */
      const nextFrontier = [];
      for (const nodeId of frontier) {
        const neighbors = await this._getNeighbors(nodeId, direction, rs, options);
        rs.edgesTraversed += neighbors.length;
        for (const { neighborId } of neighbors) {
          if (neighborId === goal) {
            return { reachable: true, stats: this._stats(visited.size, rs) };
          }
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            nextFrontier.push(neighborId);
          }
        }
      }
      frontier = nextFrontier;
      depth++;
    }

    return { reachable: false, stats: this._stats(visited.size, rs) };
  }

  /**
   * Weighted shortest path (Dijkstra's algorithm).
   *
   * Tie-breaking: equal-priority by lexicographic nodeId. Equal-cost
   * predecessor update: when altCost === bestCost && candidatePredecessor < currentPredecessor.
   *
   * @param {{ start: string, goal: string, direction?: Direction, options?: NeighborOptions, weightFn?: (from: string, to: string, label: string) => number | Promise<number>, nodeWeightFn?: (nodeId: string) => number | Promise<number>, maxNodes?: number, signal?: AbortSignal }} params
   * @returns {Promise<{path: string[], totalCost: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async weightedShortestPath({
    start, goal, direction = 'out', options,
    weightFn, nodeWeightFn,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    const effectiveWeightFn = this._resolveWeightFn(weightFn, nodeWeightFn);
    const rs = this._newRunStats();
    await this._validateStart(start);
    /** @type {Map<string, number>} */
    const dist = new Map([[start, 0]]);
    /** @type {Map<string, string>} */
    const prev = new Map();
    const visited = new Set();

    const pq = new MinHeap({ tieBreaker: lexTieBreaker });
    pq.insert(start, 0);

    while (!pq.isEmpty() && visited.size < maxNodes) {
      checkAborted(signal, 'weightedShortestPath');

      const current = /** @type {string} */ (pq.extractMin());
      if (visited.has(current)) { continue; }
      visited.add(current);

      if (current === goal) {
        const path = this._reconstructPath(prev, start, goal);
        return { path, totalCost: /** @type {number} */ (dist.get(goal)), stats: this._stats(visited.size, rs) };
      }

      const neighbors = await this._getNeighbors(current, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        if (visited.has(neighborId)) { continue; }
        const w = await effectiveWeightFn(current, neighborId, label);
        const alt = /** @type {number} */ (dist.get(current)) + w;
        const best = dist.has(neighborId) ? /** @type {number} */ (dist.get(neighborId)) : Infinity;

        if (alt < best || (alt === best && this._shouldUpdatePredecessor(prev, neighborId, current))) {
          dist.set(neighborId, alt);
          prev.set(neighborId, current);
          pq.insert(neighborId, alt);
        }
      }
    }

    throw new TraversalError(`No path from ${start} to ${goal}`, {
      code: 'NO_PATH',
      context: { start, goal },
    });
  }

  /**
   * A* search with heuristic guidance.
   *
   * @param {{ start: string, goal: string, direction?: Direction, options?: NeighborOptions, weightFn?: (from: string, to: string, label: string) => number | Promise<number>, nodeWeightFn?: (nodeId: string) => number | Promise<number>, heuristicFn?: (nodeId: string, goalId: string) => number, maxNodes?: number, signal?: AbortSignal }} params
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async aStarSearch({
    start, goal, direction = 'out', options,
    weightFn, nodeWeightFn,
    heuristicFn = () => 0,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    const effectiveWeightFn = this._resolveWeightFn(weightFn, nodeWeightFn);
    const rs = this._newRunStats();
    await this._validateStart(start);
    /** @type {Map<string, number>} */
    const gScore = new Map([[start, 0]]);
    /** @type {Map<string, string>} */
    const prev = new Map();
    const visited = new Set();

    const pq = new MinHeap({ tieBreaker: lexTieBreaker });
    pq.insert(start, heuristicFn(start, goal));

    while (!pq.isEmpty() && visited.size < maxNodes) {
      checkAborted(signal, 'aStarSearch');

      const current = /** @type {string} */ (pq.extractMin());
      if (visited.has(current)) { continue; }
      visited.add(current);

      if (current === goal) {
        const path = this._reconstructPath(prev, start, goal);
        return {
          path,
          totalCost: /** @type {number} */ (gScore.get(goal)),
          nodesExplored: visited.size,
          stats: this._stats(visited.size, rs),
        };
      }

      const neighbors = await this._getNeighbors(current, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        if (visited.has(neighborId)) { continue; }
        const w = await effectiveWeightFn(current, neighborId, label);
        const tentG = /** @type {number} */ (gScore.get(current)) + w;
        const bestG = gScore.has(neighborId) ? /** @type {number} */ (gScore.get(neighborId)) : Infinity;

        if (tentG < bestG || (tentG === bestG && this._shouldUpdatePredecessor(prev, neighborId, current))) {
          gScore.set(neighborId, tentG);
          prev.set(neighborId, current);
          pq.insert(neighborId, tentG + heuristicFn(neighborId, goal));
        }
      }
    }

    throw new TraversalError(`No path from ${start} to ${goal}`, {
      code: 'NO_PATH',
      context: { start, goal, nodesExplored: visited.size },
    });
  }

  /**
   * Bidirectional A* search.
   *
   * **Direction is fixed:** forward expansion uses `'out'` edges, backward
   * expansion uses `'in'` edges. Unlike other pathfinding methods, this one
   * does not accept a `direction` parameter. This is inherent to the
   * bidirectional algorithm — forward always means outgoing, backward always
   * means incoming.
   *
   * @param {{ start: string, goal: string, options?: NeighborOptions, weightFn?: (from: string, to: string, label: string) => number | Promise<number>, nodeWeightFn?: (nodeId: string) => number | Promise<number>, forwardHeuristic?: (nodeId: string, goalId: string) => number, backwardHeuristic?: (nodeId: string, goalId: string) => number, maxNodes?: number, signal?: AbortSignal }} params
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async bidirectionalAStar({
    start, goal, options,
    weightFn, nodeWeightFn,
    forwardHeuristic = () => 0,
    backwardHeuristic = () => 0,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    const effectiveWeightFn = this._resolveWeightFn(weightFn, nodeWeightFn);
    const rs = this._newRunStats();
    await this._validateStart(start);
    if (start === goal) {
      return { path: [start], totalCost: 0, nodesExplored: 1, stats: this._stats(1, rs) };
    }

    const fwdG = new Map([[start, 0]]);
    const fwdPrev = new Map();
    const fwdVisited = new Set();
    const fwdHeap = new MinHeap({ tieBreaker: lexTieBreaker });
    fwdHeap.insert(start, forwardHeuristic(start, goal));

    const bwdG = new Map([[goal, 0]]);
    const bwdNext = new Map();
    const bwdVisited = new Set();
    const bwdHeap = new MinHeap({ tieBreaker: lexTieBreaker });
    bwdHeap.insert(goal, backwardHeuristic(goal, start));

    let mu = Infinity;
    /** @type {string|null} */
    let meeting = null;
    let explored = 0;

    while ((!fwdHeap.isEmpty() || !bwdHeap.isEmpty()) && explored < maxNodes) {
      checkAborted(signal, 'bidirectionalAStar');
      const fwdF = fwdHeap.peekPriority();
      const bwdF = bwdHeap.peekPriority();
      if (Math.min(fwdF, bwdF) >= mu) { break; }

      if (fwdF <= bwdF) {
        const r = await this._biAStarExpand({
          heap: fwdHeap, visited: fwdVisited, gScore: fwdG, predMap: fwdPrev,
          otherVisited: bwdVisited, otherG: bwdG,
          weightFn: effectiveWeightFn, heuristicFn: forwardHeuristic,
          target: goal, directionForNeighbors: 'out', options,
          mu, meeting, rs,
        });
        explored += r.explored;
        mu = r.mu;
        meeting = r.meeting;
      } else {
        const r = await this._biAStarExpand({
          heap: bwdHeap, visited: bwdVisited, gScore: bwdG, predMap: bwdNext,
          otherVisited: fwdVisited, otherG: fwdG,
          weightFn: effectiveWeightFn, heuristicFn: backwardHeuristic,
          target: start, directionForNeighbors: 'in', options,
          mu, meeting, rs,
        });
        explored += r.explored;
        mu = r.mu;
        meeting = r.meeting;
      }
    }

    if (meeting === null) {
      throw new TraversalError(`No path from ${start} to ${goal}`, {
        code: 'NO_PATH',
        context: { start, goal, nodesExplored: explored },
      });
    }

    const path = this._reconstructBiPath(fwdPrev, bwdNext, start, goal, meeting);
    return { path, totalCost: mu, nodesExplored: explored, stats: this._stats(explored, rs) };
  }

  /**
   * Expand one node in bidirectional A*.
   * @private
   * @param {{ heap: MinHeap<string>, visited: Set<string>, gScore: Map<string, number>, predMap: Map<string, string>, otherVisited: Set<string>, otherG: Map<string, number>, weightFn: (from: string, to: string, label: string) => number | Promise<number>, heuristicFn: (nodeId: string, goalId: string) => number, target: string, directionForNeighbors: Direction, options?: NeighborOptions, mu: number, meeting: string|null, rs: RunStats }} p
   * @returns {Promise<{explored: number, mu: number, meeting: string|null}>}
   */
  async _biAStarExpand({
    heap, visited, gScore, predMap,
    otherVisited, otherG,
    weightFn, heuristicFn, target,
    directionForNeighbors, options,
    mu: inputMu, meeting: inputMeeting, rs,
  }) {
    const current = /** @type {string} */ (heap.extractMin());
    if (visited.has(current)) {
      return { explored: 0, mu: inputMu, meeting: inputMeeting };
    }
    visited.add(current);

    let resultMu = inputMu;
    let resultMeeting = inputMeeting;

    if (otherVisited.has(current)) {
      const cost = /** @type {number} */ (gScore.get(current)) + /** @type {number} */ (otherG.get(current));
      if (cost < resultMu || (cost === resultMu && (resultMeeting === null || current < resultMeeting))) {
        resultMu = cost;
        resultMeeting = current;
      }
    }

    const neighbors = await this._getNeighbors(current, directionForNeighbors, rs, options);
    rs.edgesTraversed += neighbors.length;

    for (const { neighborId, label } of neighbors) {
      if (visited.has(neighborId)) { continue; }
      const w = directionForNeighbors === 'in'
        ? await weightFn(neighborId, current, label)
        : await weightFn(current, neighborId, label);
      const tentG = /** @type {number} */ (gScore.get(current)) + w;
      const bestG = gScore.has(neighborId) ? /** @type {number} */ (gScore.get(neighborId)) : Infinity;

      if (tentG < bestG || (tentG === bestG && this._shouldUpdatePredecessor(predMap, neighborId, current))) {
        gScore.set(neighborId, tentG);
        predMap.set(neighborId, current);
        heap.insert(neighborId, tentG + heuristicFn(neighborId, target));

        if (otherG.has(neighborId)) {
          const total = tentG + /** @type {number} */ (otherG.get(neighborId));
          if (total < resultMu || (total === resultMu && (resultMeeting === null || neighborId < resultMeeting))) {
            resultMu = total;
            resultMeeting = neighborId;
          }
        }
      }
    }

    return { explored: 1, mu: resultMu, meeting: resultMeeting };
  }

  // ==== Section 4: Topology & Components (topoSort, CC, weightedLongestPath) ====

  /**
   * Connected component — delegates to BFS with direction 'both'.
   *
   * @param {{ start: string, options?: NeighborOptions, maxNodes?: number, maxDepth?: number, signal?: AbortSignal }} params
   * @returns {Promise<{nodes: string[], stats: TraversalStats}>}
   */
  async connectedComponent({ start, options, maxNodes, maxDepth, signal }) {
    return await this.bfs({ start, direction: 'both', options, maxNodes, maxDepth, signal });
  }

  /**
   * Topological sort (Kahn's algorithm).
   *
   * Deterministic: zero-indegree nodes dequeued in lexicographic nodeId order.
   *
   * @param {{ start: string | string[], direction?: Direction, options?: NeighborOptions, maxNodes?: number, throwOnCycle?: boolean, signal?: AbortSignal, _returnAdjList?: boolean }} params
   * @returns {Promise<{sorted: string[], hasCycle: boolean, stats: TraversalStats, _neighborEdgeMap?: Map<string, NeighborEdge[]>}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if throwOnCycle is true and cycle found
   */
  async topologicalSort({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    throwOnCycle = false,
    signal,
    _returnAdjList = false,
  }) {
    const rs = this._newRunStats();
    const starts = [...new Set(Array.isArray(start) ? start : [start])];
    for (const s of starts) {
      await this._validateStart(s);
    }

    // Phase 1: Discover all reachable nodes + compute in-degrees
    /** @type {Map<string, string[]>} */
    const adjList = new Map();
    /** @type {Map<string, NeighborEdge[]>} — populated when _returnAdjList is true */
    const neighborEdgeMap = new Map();
    /** @type {Map<string, number>} */
    const inDegree = new Map();
    const discovered = new Set();
    /** @type {string[]} */
    const queue = [...starts];
    let qHead = 0;
    for (const s of starts) { discovered.add(s); }

    while (qHead < queue.length) {
      if (discovered.size % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }
      const nodeId = /** @type {string} */ (queue[qHead++]);
      const neighbors = await this._getNeighbors(nodeId, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      /** @type {string[]} */
      const neighborIds = [];
      for (const { neighborId } of neighbors) {
        neighborIds.push(neighborId);
        inDegree.set(neighborId, (inDegree.get(neighborId) || 0) + 1);
        if (!discovered.has(neighborId)) {
          discovered.add(neighborId);
          queue.push(neighborId);
        }
      }
      adjList.set(nodeId, neighborIds);
      neighborEdgeMap.set(nodeId, neighbors);
    }

    // Ensure starts have in-degree entries
    for (const s of starts) {
      if (!inDegree.has(s)) {
        inDegree.set(s, 0);
      }
    }

    // Phase 2: Kahn's — MinHeap for O(N log N) zero-indegree processing
    const ready = new MinHeap({ tieBreaker: lexTieBreaker });
    for (const nodeId of discovered) {
      if ((inDegree.get(nodeId) || 0) === 0) {
        ready.insert(nodeId, 0);
      }
    }

    /** @type {string[]} */
    const sorted = [];
    while (!ready.isEmpty() && sorted.length < maxNodes) {
      if (sorted.length % 1000 === 0) {
        checkAborted(signal, 'topologicalSort');
      }
      const nodeId = /** @type {string} */ (ready.extractMin());
      sorted.push(nodeId);

      const neighbors = adjList.get(nodeId) || [];
      for (const neighborId of neighbors) {
        const deg = /** @type {number} */ (inDegree.get(neighborId)) - 1;
        inDegree.set(neighborId, deg);
        if (deg === 0) {
          ready.insert(neighborId, 0);
        }
      }
    }

    const hasCycle = computeTopoHasCycle({
      sortedLength: sorted.length,
      discoveredSize: discovered.size,
      maxNodes,
      readyRemaining: !ready.isEmpty(),
    });
    if (hasCycle && throwOnCycle) {
      // Find a back-edge as witness
      const inSorted = new Set(sorted);
      /** @type {string|undefined} */
      let cycleWitnessFrom;
      /** @type {string|undefined} */
      let cycleWitnessTo;
      for (const [nodeId, neighbors] of adjList) {
        if (inSorted.has(nodeId)) { continue; }
        for (const neighborId of neighbors) {
          if (!inSorted.has(neighborId)) {
            cycleWitnessFrom = nodeId;
            cycleWitnessTo = neighborId;
            break;
          }
        }
        if (cycleWitnessFrom) { break; }
      }

      throw new TraversalError('Graph contains a cycle', {
        code: 'ERR_GRAPH_HAS_CYCLES',
        context: {
          nodesInCycle: discovered.size - sorted.length,
          cycleWitness: cycleWitnessFrom ? { from: cycleWitnessFrom, to: cycleWitnessTo } : undefined,
        },
      });
    }

    return {
      sorted,
      hasCycle,
      stats: this._stats(sorted.length, rs),
      _neighborEdgeMap: _returnAdjList ? neighborEdgeMap : undefined,
    };
  }

  /**
   * Common ancestors — multi-source ancestor intersection.
   *
   * For each input node, performs a BFS backward ('in') to collect its
   * ancestor set. The result is the intersection of all ancestor sets.
   *
   * **Self-inclusion:** The BFS from each node includes the node itself
   * (depth 0). Therefore, the result may include the input nodes themselves
   * if they are reachable from all other input nodes via backward edges.
   * For example, if A has backward edges to B and C, and you pass
   * `[A, B, C]`, then B and C may appear in the result because A's BFS
   * reaches them and their own BFS includes themselves at depth 0.
   *
   * @param {{ nodes: string[], options?: NeighborOptions, maxDepth?: number, maxResults?: number, signal?: AbortSignal }} params
   * @returns {Promise<{ancestors: string[], stats: TraversalStats}>}
   */
  async commonAncestors({
    nodes, options,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxResults = 100,
    signal,
  }) {
    if (nodes.length === 0) {
      return { ancestors: [], stats: this._stats(0, this._newRunStats()) };
    }

    // For each node, BFS backward ('in') to collect ancestors
    /** @type {Map<string, number>} */
    const ancestorCounts = new Map();
    const requiredCount = nodes.length;
    /** @type {TraversalStats} */
    const totalStats = {
      nodesVisited: 0,
      edgesTraversed: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };

    for (const nodeId of nodes) {
      checkAborted(signal, 'commonAncestors');
      const { nodes: ancestors, stats } = await this.bfs({
        start: nodeId,
        direction: 'in',
        options,
        maxDepth,
        signal,
      });
      totalStats.nodesVisited += stats.nodesVisited;
      totalStats.edgesTraversed += stats.edgesTraversed;
      totalStats.cacheHits += stats.cacheHits;
      totalStats.cacheMisses += stats.cacheMisses;
      for (const a of ancestors) {
        ancestorCounts.set(a, (ancestorCounts.get(a) || 0) + 1);
      }
    }

    // Collect nodes reachable from ALL inputs, sorted lex
    const common = [];
    const entries = [...ancestorCounts.entries()]
      .filter(([, count]) => count === requiredCount)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    for (const [ancestor] of entries) {
      common.push(ancestor);
      if (common.length >= maxResults) { break; }
    }

    return { ancestors: common, stats: totalStats };
  }

  /**
   * Weighted longest path via topological sort + DP.
   *
   * Only valid on DAGs. Throws ERR_GRAPH_HAS_CYCLES if graph has cycles.
   *
   * @param {{ start: string, goal: string, direction?: Direction, options?: NeighborOptions, weightFn?: (from: string, to: string, label: string) => number | Promise<number>, nodeWeightFn?: (nodeId: string) => number | Promise<number>, maxNodes?: number, signal?: AbortSignal }} params
   * @returns {Promise<{path: string[], totalCost: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async weightedLongestPath({
    start, goal, direction = 'out', options,
    weightFn, nodeWeightFn,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    const effectiveWeightFn = this._resolveWeightFn(weightFn, nodeWeightFn);
    await this._validateStart(start);
    // Run topo sort first — will throw on cycles.
    // Request the neighbor edge map so the DP phase can reuse it
    // instead of re-fetching neighbors from the provider.
    const { sorted, _neighborEdgeMap } = await this.topologicalSort({
      start,
      direction,
      options,
      maxNodes,
      throwOnCycle: true,
      signal,
      _returnAdjList: true,
    });

    const rs = this._newRunStats();

    // DP: longest distance from start
    /** @type {Map<string, number>} */
    const dist = new Map([[start, 0]]);
    /** @type {Map<string, string>} */
    const prev = new Map();

    for (const nodeId of sorted) {
      if (!dist.has(nodeId)) { continue; }
      // Reuse neighbor data from topo sort's discovery phase
      const neighbors = _neighborEdgeMap
        ? (_neighborEdgeMap.get(nodeId) || [])
        : await this._getNeighbors(nodeId, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        const w = await effectiveWeightFn(nodeId, neighborId, label);
        const alt = /** @type {number} */ (dist.get(nodeId)) + w;
        const best = dist.has(neighborId) ? /** @type {number} */ (dist.get(neighborId)) : -Infinity;

        if (alt > best || (alt === best && this._shouldUpdatePredecessor(prev, neighborId, nodeId))) {
          dist.set(neighborId, alt);
          prev.set(neighborId, nodeId);
        }
      }
    }

    if (!dist.has(goal)) {
      throw new TraversalError(`No path from ${start} to ${goal}`, {
        code: 'NO_PATH',
        context: { start, goal },
      });
    }

    const path = this._reconstructPath(prev, start, goal);
    return { path, totalCost: /** @type {number} */ (dist.get(goal)), stats: this._stats(sorted.length, rs) };
  }

  // ==== Section 5: Graph Analysis (levels, rootAncestors, transitiveReduction, transitiveClosure) ====

  /**
   * Longest-path level assignment (DAGs only).
   *
   * Each node's level is its longest-path distance from any root.
   * Roots (in-degree 0 within the reachable subgraph) get level 0.
   *
   * @param {{ start: string | string[], direction?: Direction, options?: NeighborOptions, maxNodes?: number, signal?: AbortSignal }} params
   * @returns {Promise<{levels: Map<string, number>, maxLevel: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'INVALID_START' if start node missing
   */
  async levels({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    // Topo sort with cycle detection + neighbor edge map reuse
    const { sorted, _neighborEdgeMap } = await this.topologicalSort({
      start,
      direction,
      options,
      maxNodes,
      throwOnCycle: true,
      signal,
      _returnAdjList: true,
    });

    const rs = this._newRunStats();

    // DP forward: level[v] = max(level[v], level[u] + 1)
    /** @type {Map<string, number>} */
    const levelMap = new Map();
    for (const nodeId of sorted) {
      if (!levelMap.has(nodeId)) {
        levelMap.set(nodeId, 0);
      }
    }

    let maxLevel = 0;
    for (const nodeId of sorted) {
      checkAborted(signal, 'levels');
      const currentLevel = /** @type {number} */ (levelMap.get(nodeId));
      const neighbors = _neighborEdgeMap
        ? (_neighborEdgeMap.get(nodeId) || [])
        : await this._getNeighbors(nodeId, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId } of neighbors) {
        const neighborLevel = levelMap.get(neighborId) ?? 0;
        const candidate = currentLevel + 1;
        if (candidate > neighborLevel) {
          levelMap.set(neighborId, candidate);
          if (candidate > maxLevel) {
            maxLevel = candidate;
          }
        }
      }
    }

    return { levels: levelMap, maxLevel, stats: this._stats(sorted.length, rs) };
  }

  /**
   * Find all root ancestors (in-degree-0 nodes) reachable backward from start.
   *
   * Works on cyclic graphs — uses BFS reachability.
   *
   * @param {{ start: string, options?: NeighborOptions, maxNodes?: number, maxDepth?: number, signal?: AbortSignal }} params
   * @returns {Promise<{roots: string[], stats: TraversalStats}>}
   * @throws {TraversalError} code 'INVALID_START' if start node missing
   */
  async rootAncestors({
    start, options,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal,
  }) {
    // BFS backward from start
    const { nodes: visited, stats: bfsStats } = await this.bfs({
      start,
      direction: 'in',
      options,
      maxNodes,
      maxDepth,
      signal,
    });

    const rs = this._newRunStats();

    // Check each visited node: if it has no incoming neighbors, it's a root
    /** @type {string[]} */
    const roots = [];
    for (const nodeId of visited) {
      checkAborted(signal, 'rootAncestors');
      const inNeighbors = await this._getNeighbors(nodeId, 'in', rs, options);
      rs.edgesTraversed += inNeighbors.length;
      if (inNeighbors.length === 0) {
        roots.push(nodeId);
      }
    }

    // Sort lexicographically for determinism
    roots.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    return {
      roots,
      stats: {
        nodesVisited: bfsStats.nodesVisited,
        edgesTraversed: bfsStats.edgesTraversed + rs.edgesTraversed,
        cacheHits: bfsStats.cacheHits + rs.cacheHits,
        cacheMisses: bfsStats.cacheMisses + rs.cacheMisses,
      },
    };
  }

  /**
   * Transitive reduction — minimal edge set preserving reachability (DAGs only).
   *
   * For each node u with direct successors, BFS from u's grandchildren
   * to find which direct successors are also reachable via longer paths.
   * Those direct edges are redundant and removed.
   *
   * @param {{ start: string | string[], direction?: Direction, options?: NeighborOptions, maxNodes?: number, signal?: AbortSignal }} params
   * @returns {Promise<{edges: Array<{from: string, to: string, label: string}>, removed: number, stats: TraversalStats}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'INVALID_START' if start node missing
   */
  async transitiveReduction({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    signal,
  }) {
    // Topo sort with cycle detection + neighbor edge map reuse
    const { sorted, _neighborEdgeMap } = await this.topologicalSort({
      start,
      direction,
      options,
      maxNodes,
      throwOnCycle: true,
      signal,
      _returnAdjList: true,
    });

    const rs = this._newRunStats();
    /** @type {Map<string, string[]>} */
    const adjList = new Map();

    // Build adjacency list from topo sort data
    for (const nodeId of sorted) {
      const neighbors = _neighborEdgeMap
        ? (_neighborEdgeMap.get(nodeId) || [])
        : await this._getNeighbors(nodeId, direction, rs, options);
      adjList.set(nodeId, neighbors.map((n) => n.neighborId));
    }

    // For each node, find redundant edges via DFS/BFS from grandchildren
    /** @type {Set<string>} — keys are "from\0to" */
    const redundant = new Set();

    for (const u of sorted) {
      checkAborted(signal, 'transitiveReduction');
      const directSuccessors = adjList.get(u) || [];
      if (directSuccessors.length <= 1) {
        continue; // Cannot have redundant edges with 0 or 1 successor
      }

      const directSet = new Set(directSuccessors);

      // BFS from all grandchildren (successors-of-successors)
      // Any direct successor reachable from a grandchild is redundant
      /** @type {Set<string>} */
      const visited = new Set();
      /** @type {string[]} */
      let frontier = [];

      for (const s of directSuccessors) {
        const sSuccessors = adjList.get(s) || [];
        for (const gc of sSuccessors) {
          if (!visited.has(gc)) {
            visited.add(gc);
            frontier.push(gc);
          }
        }
      }

      // BFS forward from grandchildren
      while (frontier.length > 0) {
        /** @type {string[]} */
        const nextFrontier = [];
        for (const nodeId of frontier) {
          if (directSet.has(nodeId)) {
            redundant.add(`${u}\0${nodeId}`);
          }
          const successors = adjList.get(nodeId) || [];
          for (const s of successors) {
            if (!visited.has(s)) {
              visited.add(s);
              nextFrontier.push(s);
            }
          }
        }
        frontier = nextFrontier;
      }
    }

    // Collect non-redundant edges with labels from the original neighbor data
    /** @type {Array<{from: string, to: string, label: string}>} */
    const edges = [];
    let removed = 0;

    for (const nodeId of sorted) {
      const neighbors = _neighborEdgeMap
        ? (_neighborEdgeMap.get(nodeId) || [])
        : [];
      for (const { neighborId, label } of neighbors) {
        if (redundant.has(`${nodeId}\0${neighborId}`)) {
          removed++;
        } else {
          edges.push({ from: nodeId, to: neighborId, label });
        }
      }
    }

    // Sort edges for determinism
    edges.sort((a, b) => {
      if (a.from < b.from) { return -1; }
      if (a.from > b.from) { return 1; }
      if (a.to < b.to) { return -1; }
      if (a.to > b.to) { return 1; }
      if (a.label < b.label) { return -1; }
      if (a.label > b.label) { return 1; }
      return 0;
    });

    return { edges, removed, stats: this._stats(sorted.length, rs) };
  }

  /**
   * Transitive closure — all implied reachability edges.
   *
   * For each node, BFS to find all reachable nodes and emit an edge
   * for each pair. Works on cyclic graphs.
   *
   * @param {{ start: string | string[], direction?: Direction, options?: NeighborOptions, maxNodes?: number, maxEdges?: number, signal?: AbortSignal }} params
   * @returns {Promise<{edges: Array<{from: string, to: string}>, stats: TraversalStats}>}
   * @throws {TraversalError} code 'INVALID_START' if start node missing
   * @throws {TraversalError} code 'E_MAX_EDGES_EXCEEDED' if closure exceeds maxEdges
   */
  async transitiveClosure({
    start, direction = 'out', options,
    maxNodes = DEFAULT_MAX_NODES,
    maxEdges = 1000000,
    signal,
  }) {
    const rs = this._newRunStats();
    const starts = [...new Set(Array.isArray(start) ? start : [start])];
    for (const s of starts) {
      await this._validateStart(s);
    }

    // Phase 1: Discover all reachable nodes via BFS from all starts
    const allVisited = new Set();
    /** @type {string[]} */
    const queue = [...starts];
    let qHead = 0;
    for (const s of starts) {
      allVisited.add(s);
    }

    while (qHead < queue.length) {
      if (allVisited.size % 1000 === 0) {
        checkAborted(signal, 'transitiveClosure');
      }
      if (allVisited.size >= maxNodes) {
        break;
      }
      const nodeId = /** @type {string} */ (queue[qHead++]);
      const neighbors = await this._getNeighbors(nodeId, direction, rs, options);
      rs.edgesTraversed += neighbors.length;
      for (const { neighborId } of neighbors) {
        if (!allVisited.has(neighborId)) {
          allVisited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    // Phase 2: For each node, BFS to collect all reachable nodes
    /** @type {Array<{from: string, to: string}>} */
    const edges = [];
    let edgeCount = 0;

    const nodeList = [...allVisited].sort();

    for (const fromNode of nodeList) {
      checkAborted(signal, 'transitiveClosure');

      // BFS from fromNode
      const visited = new Set([fromNode]);
      /** @type {string[]} */
      let frontier = [fromNode];

      while (frontier.length > 0) {
        /** @type {string[]} */
        const nextFrontier = [];
        for (const nodeId of frontier) {
          const neighbors = await this._getNeighbors(nodeId, direction, rs, options);
          rs.edgesTraversed += neighbors.length;
          for (const { neighborId } of neighbors) {
            if (!visited.has(neighborId)) {
              visited.add(neighborId);
              nextFrontier.push(neighborId);
              edgeCount++;
              if (edgeCount > maxEdges) {
                throw new TraversalError(
                  `Transitive closure exceeds maxEdges limit (${maxEdges})`,
                  { code: 'E_MAX_EDGES_EXCEEDED', context: { maxEdges, edgesSoFar: edgeCount } },
                );
              }
              edges.push({ from: fromNode, to: neighborId });
            }
          }
        }
        frontier = nextFrontier;
      }
    }

    // Sort edges for determinism
    edges.sort((a, b) => {
      if (a.from < b.from) { return -1; }
      if (a.from > b.from) { return 1; }
      if (a.to < b.to) { return -1; }
      if (a.to > b.to) { return 1; }
      return 0;
    });

    return { edges, stats: this._stats(allVisited.size, rs) };
  }

  // ==== Private Helpers ====

  /**
   * Builds an edge-weight-shaped resolver from a nodeWeightFn.
   *
   * Weight = cost to enter the `to` node. The start node's weight is NOT
   * counted (you're already there). Each node is resolved at most once via
   * a lazy memoization cache.
   *
   * @param {(nodeId: string) => number | Promise<number>} nodeWeightFn
   * @returns {(from: string, to: string, label: string) => number | Promise<number>}
   * @private
   */
  _buildNodeWeightResolver(nodeWeightFn) {
    /** @type {Map<string, number>} */
    const cache = new Map();
    return (_from, to, _label) => {
      const cached = cache.get(to);
      if (cached !== undefined) {
        return cached;
      }
      const result = nodeWeightFn(to);
      if (typeof result === 'number') {
        cache.set(to, result);
        return result;
      }
      // Async path: resolve promise, cache, and return
      return /** @type {Promise<number>} */ (result).then((v) => {
        cache.set(to, v);
        return v;
      });
    };
  }

  /**
   * Resolves the effective weight function from weightFn / nodeWeightFn options.
   * Throws if both are provided.
   *
   * @param {((from: string, to: string, label: string) => number | Promise<number>) | undefined} weightFn
   * @param {((nodeId: string) => number | Promise<number>) | undefined} nodeWeightFn
   * @returns {(from: string, to: string, label: string) => number | Promise<number>}
   * @private
   */
  _resolveWeightFn(weightFn, nodeWeightFn) {
    if (weightFn && nodeWeightFn) {
      throw new TraversalError(
        'Cannot provide both weightFn and nodeWeightFn — they are mutually exclusive',
        { code: 'E_WEIGHT_FN_CONFLICT', context: {} },
      );
    }
    if (nodeWeightFn) {
      return this._buildNodeWeightResolver(nodeWeightFn);
    }
    return weightFn ?? DEFAULT_WEIGHT_FN;
  }

  /**
   * Validates that a start node exists in the provider.
   * Throws INVALID_START if the node is not alive.
   *
   * @param {string} nodeId
   * @returns {Promise<void>}
   * @private
   */
  async _validateStart(nodeId) {
    const exists = await this._provider.hasNode(nodeId);
    if (!exists) {
      throw new TraversalError(`Start node '${nodeId}' does not exist in the graph`, {
        code: 'INVALID_START',
        context: { nodeId },
      });
    }
  }

  /**
   * Reconstructs a path by walking backward through a predecessor map.
   * @param {Map<string, string>} predMap
   * @param {string} start
   * @param {string} goal
   * @returns {string[]}
   * @private
   */
  _reconstructPath(predMap, start, goal) {
    const path = [goal];
    let current = goal;
    while (current !== start) {
      const pred = predMap.get(current);
      if (pred === undefined) { break; }
      path.push(pred);
      current = pred;
    }
    path.reverse();
    return path;
  }

  /**
   * Reconstructs a bidirectional path from two predecessor maps.
   * @param {Map<string, string>} fwdPrev - Forward predecessor map
   * @param {Map<string, string>} bwdNext - Backward predecessor map (maps node → its successor toward goal)
   * @param {string} start
   * @param {string} goal
   * @param {string} meeting
   * @returns {string[]}
   * @private
   */
  _reconstructBiPath(fwdPrev, bwdNext, start, goal, meeting) {
    // Forward half: meeting → start (walk fwdPrev backward)
    const fwdHalf = [meeting];
    let cur = meeting;
    while (cur !== start && fwdPrev.has(cur)) {
      cur = /** @type {string} */ (fwdPrev.get(cur));
      fwdHalf.push(cur);
    }
    fwdHalf.reverse();

    // Backward half: meeting → goal (walk bwdNext forward)
    cur = meeting;
    while (cur !== goal && bwdNext.has(cur)) {
      cur = /** @type {string} */ (bwdNext.get(cur));
      fwdHalf.push(cur);
    }

    return fwdHalf;
  }

  /**
   * Determines if a predecessor should be updated on equal cost.
   * Returns true when the candidate predecessor is lexicographically
   * smaller than the current predecessor (deterministic tie-break).
   *
   * @param {Map<string, string>} predMap
   * @param {string} nodeId
   * @param {string} candidatePred
   * @returns {boolean}
   * @private
   */
  _shouldUpdatePredecessor(predMap, nodeId, candidatePred) {
    const current = predMap.get(nodeId);
    if (current === undefined) { return true; }
    return candidatePred < current;
  }

}
