/**
 * Service for DAG path-finding operations: findPath, shortestPath,
 * weightedShortestPath, A*, and bidirectional A*.
 *
 * Split from CommitDagTraversalService as part of the SRP refactor.
 *
 * @module domain/services/DagPathFinding
 */

import nullLogger from '../utils/nullLogger.js';
import TraversalError from '../errors/TraversalError.js';
import MinHeap from '../utils/MinHeap.js';
import { checkAborted } from '../utils/cancellation.js';

/**
 * Default limits for path-finding operations.
 * @const
 */
const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;

/**
 * Epsilon for A* tie-breaking: small enough not to affect ordering by f,
 * but large enough to break ties in favor of higher g (more progress made).
 * @const
 */
const EPSILON = 1e-10;

/**
 * Service for DAG path-finding operations.
 *
 * Provides path finding, shortest path (bidirectional BFS),
 * weighted shortest path (Dijkstra), A*, and bidirectional A*
 * algorithms using async operations for processing large graphs.
 */
export default class DagPathFinding {
  /**
   * Creates a new DagPathFinding service.
   *
   * @param {Object} options
   * @param {import('./BitmapIndexReader.js').default} options.indexReader - Index reader for O(1) lookups
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger instance
   */
  constructor(/** @type {{ indexReader: import('./BitmapIndexReader.js').default, logger?: import('../../ports/LoggerPort.js').default }} */ { indexReader, logger = nullLogger } = /** @type {*} */ ({})) { // TODO(ts-cleanup): needs options type
    if (!indexReader) {
      throw new Error('DagPathFinding requires an indexReader');
    }
    this._indexReader = indexReader;
    this._logger = logger;
  }

  /**
   * Finds ANY path between two nodes using BFS (forward direction only).
   *
   * Uses unidirectional BFS from source to target, following child edges.
   * Returns the first path found, which is guaranteed to be a shortest path
   * (in terms of number of edges) due to BFS's level-order exploration.
   *
   * @param {Object} options - Path finding options
   * @param {string} options.from - Source node SHA
   * @param {string} options.to - Target node SHA
   * @param {number} [options.maxNodes=100000] - Maximum nodes to visit
   * @param {number} [options.maxDepth=1000] - Maximum path length
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<{found: boolean, path: string[], length: number}>} Path result
   */
  async findPath({
    from, to,
    maxNodes = DEFAULT_MAX_NODES,
    maxDepth = DEFAULT_MAX_DEPTH,
    signal,
  }) {
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

      const current = /** @type {{sha: string, depth: number}} */ (queue.shift());

      if (current.depth > maxDepth) { continue; }
      if (visited.has(current.sha)) { continue; }

      visited.add(current.sha);

      if (current.sha === to) {
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
   * @param {Object} options - Path finding options
   * @param {string} options.from - Source node SHA
   * @param {string} options.to - Target node SHA
   * @param {number} [options.maxDepth=1000] - Maximum search depth per direction
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<{found: boolean, path: string[], length: number}>} Path result
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
   * @param {Object} options - Path finding options
   * @param {string} options.from - Starting SHA
   * @param {string} options.to - Target SHA
   * @param {(from: string, to: string) => number|Promise<number>} [options.weightProvider] - Async callback `(fromSha, toSha) => number`
   * @param {string} [options.direction='children'] - Edge direction: 'children' or 'parents'
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<{path: string[], totalCost: number}>} Path and cost
   * @throws {TraversalError} With code 'NO_PATH' if no path exists
   */
  async weightedShortestPath({
    from, to,
    weightProvider = () => 1,
    direction = 'children',
    signal,
  }) {
    this._logger.debug('weightedShortestPath started', { from, to, direction });

    const distances = new Map();
    distances.set(from, 0);

    const previous = new Map();
    const pq = new MinHeap();
    pq.insert(from, 0);

    const visited = new Set();

    while (!pq.isEmpty()) {
      if (visited.size % 1000 === 0) {
        checkAborted(signal, 'weightedShortestPath');
      }

      const current = pq.extractMin();

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      if (current === to) {
        const path = this._reconstructWeightedPath(previous, from, to);
        const totalCost = distances.get(to);
        this._logger.debug('weightedShortestPath found', { pathLength: path.length, totalCost });
        return { path, totalCost };
      }

      const neighbors =
        direction === 'children'
          ? await this._indexReader.getChildren(current)
          : await this._indexReader.getParents(current);

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

    this._logger.debug('weightedShortestPath not found', { from, to });
    throw new TraversalError(`No path exists from ${from} to ${to}`, {
      code: 'NO_PATH',
      context: { from, to, direction },
    });
  }

  /**
   * Finds shortest path using A* algorithm with heuristic guidance.
   *
   * @param {Object} options - Path finding options
   * @param {string} options.from - Starting SHA
   * @param {string} options.to - Target SHA
   * @param {(from: string, to: string) => number|Promise<number>} [options.weightProvider] - Async callback `(fromSha, toSha) => number`
   * @param {(sha: string, target: string) => number} [options.heuristicProvider] - Callback `(sha, targetSha) => number`
   * @param {string} [options.direction='children'] - Edge direction: 'children' or 'parents'
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number}>} Path result
   * @throws {TraversalError} With code 'NO_PATH' if no path exists
   */
  async aStarSearch({
    from, to,
    weightProvider = () => 1,
    heuristicProvider = () => 0,
    direction = 'children',
    signal,
  }) {
    this._logger.debug('aStarSearch started', { from, to, direction });

    const gScore = new Map();
    gScore.set(from, 0);

    const fScore = new Map();
    const initialH = heuristicProvider(from, to);
    const initialG = 0;
    fScore.set(from, initialH);

    const previous = new Map();

    const pq = new MinHeap();
    pq.insert(from, initialH - EPSILON * initialG);

    const visited = new Set();
    let nodesExplored = 0;

    while (!pq.isEmpty()) {
      if (nodesExplored % 1000 === 0) {
        checkAborted(signal, 'aStarSearch');
      }

      const current = pq.extractMin();

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      nodesExplored++;

      if (current === to) {
        const path = this._reconstructWeightedPath(previous, from, to);
        const totalCost = gScore.get(to);
        this._logger.debug('aStarSearch found', { pathLength: path.length, totalCost, nodesExplored });
        return { path, totalCost, nodesExplored };
      }

      const neighbors =
        direction === 'children'
          ? await this._indexReader.getChildren(current)
          : await this._indexReader.getParents(current);

      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) {
          continue;
        }

        const edgeWeight = await weightProvider(current, neighbor);
        const tentativeG = gScore.get(current) + edgeWeight;
        const currentG = gScore.has(neighbor) ? gScore.get(neighbor) : Infinity;

        if (tentativeG < currentG) {
          previous.set(neighbor, current);
          gScore.set(neighbor, tentativeG);
          const h = heuristicProvider(neighbor, to);
          const f = tentativeG + h;
          fScore.set(neighbor, f);
          pq.insert(neighbor, f - EPSILON * tentativeG);
        }
      }
    }

    this._logger.debug('aStarSearch not found', { from, to, nodesExplored });
    throw new TraversalError(`No path exists from ${from} to ${to}`, {
      code: 'NO_PATH',
      context: { from, to, direction, nodesExplored },
    });
  }

  /**
   * Bi-directional A* search - meets in the middle from both ends.
   *
   * @param {Object} options - Path finding options
   * @param {string} options.from - Starting SHA
   * @param {string} options.to - Target SHA
   * @param {(from: string, to: string) => number|Promise<number>} [options.weightProvider] - Async callback `(fromSha, toSha) => number`
   * @param {(sha: string, target: string) => number} [options.forwardHeuristic] - Callback for forward search
   * @param {(sha: string, target: string) => number} [options.backwardHeuristic] - Callback for backward search
   * @param {AbortSignal} [options.signal] - Optional AbortSignal for cancellation
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number}>} Path result
   * @throws {TraversalError} With code 'NO_PATH' if no path exists
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

    if (from === to) {
      return { path: [from], totalCost: 0, nodesExplored: 1 };
    }

    // Forward search state
    const fwdGScore = new Map();
    fwdGScore.set(from, 0);
    const fwdPrevious = new Map();
    const fwdVisited = new Set();
    const fwdHeap = new MinHeap();
    const fwdInitialH = forwardHeuristic(from, to);
    fwdHeap.insert(from, fwdInitialH);

    // Backward search state
    const bwdGScore = new Map();
    bwdGScore.set(to, 0);
    const bwdNext = new Map();
    const bwdVisited = new Set();
    const bwdHeap = new MinHeap();
    const bwdInitialH = backwardHeuristic(to, from);
    bwdHeap.insert(to, bwdInitialH);

    let mu = Infinity;
    let meetingPoint = null;
    let nodesExplored = 0;

    while (!fwdHeap.isEmpty() || !bwdHeap.isEmpty()) {
      if (nodesExplored % 1000 === 0) {
        checkAborted(signal, 'bidirectionalAStar');
      }

      const fwdMinF = fwdHeap.isEmpty() ? Infinity : fwdHeap.peekPriority();
      const bwdMinF = bwdHeap.isEmpty() ? Infinity : bwdHeap.peekPriority();

      if (Math.min(fwdMinF, bwdMinF) >= mu) {
        break;
      }

      if (fwdMinF <= bwdMinF) {
        const result = await this._expandForward({
          fwdHeap, fwdVisited, fwdGScore, fwdPrevious,
          bwdVisited, bwdGScore,
          weightProvider, forwardHeuristic, to,
          mu, meetingPoint,
        });
        nodesExplored += result.explored;
        mu = result.mu;
        meetingPoint = result.meetingPoint;
      } else {
        const result = await this._expandBackward({
          bwdHeap, bwdVisited, bwdGScore, bwdNext,
          fwdVisited, fwdGScore,
          weightProvider, backwardHeuristic, from,
          mu, meetingPoint,
        });
        nodesExplored += result.explored;
        mu = result.mu;
        meetingPoint = result.meetingPoint;
      }
    }

    if (meetingPoint === null) {
      this._logger.debug('bidirectionalAStar not found', { from, to, nodesExplored });
      throw new TraversalError(`No path exists from ${from} to ${to}`, {
        code: 'NO_PATH',
        context: { from, to, nodesExplored },
      });
    }

    const path = this._reconstructBidirectionalAStarPath(fwdPrevious, bwdNext, from, to, meetingPoint);

    this._logger.debug('bidirectionalAStar found', { pathLength: path.length, totalCost: mu, nodesExplored });
    return { path, totalCost: mu, nodesExplored };
  }

  /**
   * Expands the forward frontier by one node in bidirectional A*.
   *
   * @param {Object} state - Forward expansion state
   * @param {import('../utils/MinHeap.js').default} state.fwdHeap
   * @param {Set<string>} state.fwdVisited
   * @param {Map<string, number>} state.fwdGScore
   * @param {Map<string, string>} state.fwdPrevious
   * @param {Set<string>} state.bwdVisited
   * @param {Map<string, number>} state.bwdGScore
   * @param {(from: string, to: string) => number|Promise<number>} state.weightProvider
   * @param {(sha: string, target: string) => number} state.forwardHeuristic
   * @param {string} state.to
   * @param {number} state.mu
   * @param {string|null} state.meetingPoint
   * @returns {Promise<{explored: number, mu: number, meetingPoint: string|null}>}
   * @private
   */
  async _expandForward({
    fwdHeap, fwdVisited, fwdGScore, fwdPrevious,
    bwdVisited, bwdGScore,
    weightProvider, forwardHeuristic, to,
    mu: inputMu, meetingPoint: inputMeeting,
  }) {
    const current = fwdHeap.extractMin();
    let explored = 0;
    let bestMu = inputMu;
    let bestMeeting = inputMeeting;

    if (fwdVisited.has(current)) {
      return { explored, mu: bestMu, meetingPoint: bestMeeting };
    }
    fwdVisited.add(current);
    explored = 1;

    if (bwdVisited.has(current)) {
      const totalCost = /** @type {number} */ (fwdGScore.get(current)) + /** @type {number} */ (bwdGScore.get(current));
      if (totalCost < bestMu) {
        bestMu = totalCost;
        bestMeeting = current;
      }
    }

    const children = await this._indexReader.getChildren(current);
    for (const child of children) {
      if (fwdVisited.has(child)) {
        continue;
      }

      const edgeWeight = await weightProvider(current, child);
      const tentativeG = /** @type {number} */ (fwdGScore.get(current)) + edgeWeight;
      const currentG = fwdGScore.has(child) ? /** @type {number} */ (fwdGScore.get(child)) : Infinity;

      if (tentativeG < currentG) {
        fwdPrevious.set(child, current);
        fwdGScore.set(child, tentativeG);
        const h = forwardHeuristic(child, to);
        const f = tentativeG + h;
        fwdHeap.insert(child, f);

        if (bwdGScore.has(child)) {
          const totalCost = tentativeG + /** @type {number} */ (bwdGScore.get(child));
          if (totalCost < bestMu) {
            bestMu = totalCost;
            bestMeeting = child;
          }
        }
      }
    }

    return { explored, mu: bestMu, meetingPoint: bestMeeting };
  }

  /**
   * Expands the backward frontier by one node in bidirectional A*.
   *
   * @param {Object} state - Backward expansion state
   * @param {import('../utils/MinHeap.js').default} state.bwdHeap
   * @param {Set<string>} state.bwdVisited
   * @param {Map<string, number>} state.bwdGScore
   * @param {Map<string, string>} state.bwdNext
   * @param {Set<string>} state.fwdVisited
   * @param {Map<string, number>} state.fwdGScore
   * @param {(from: string, to: string) => number|Promise<number>} state.weightProvider
   * @param {(sha: string, target: string) => number} state.backwardHeuristic
   * @param {string} state.from
   * @param {number} state.mu
   * @param {string|null} state.meetingPoint
   * @returns {Promise<{explored: number, mu: number, meetingPoint: string|null}>}
   * @private
   */
  async _expandBackward({
    bwdHeap, bwdVisited, bwdGScore, bwdNext,
    fwdVisited, fwdGScore,
    weightProvider, backwardHeuristic, from,
    mu: inputMu, meetingPoint: inputMeeting,
  }) {
    const current = bwdHeap.extractMin();
    let explored = 0;
    let bestMu = inputMu;
    let bestMeeting = inputMeeting;

    if (bwdVisited.has(current)) {
      return { explored, mu: bestMu, meetingPoint: bestMeeting };
    }
    bwdVisited.add(current);
    explored = 1;

    if (fwdVisited.has(current)) {
      const totalCost = /** @type {number} */ (fwdGScore.get(current)) + /** @type {number} */ (bwdGScore.get(current));
      if (totalCost < bestMu) {
        bestMu = totalCost;
        bestMeeting = current;
      }
    }

    const parents = await this._indexReader.getParents(current);
    for (const parent of parents) {
      if (bwdVisited.has(parent)) {
        continue;
      }

      const edgeWeight = await weightProvider(parent, current);
      const tentativeG = /** @type {number} */ (bwdGScore.get(current)) + edgeWeight;
      const currentG = bwdGScore.has(parent) ? /** @type {number} */ (bwdGScore.get(parent)) : Infinity;

      if (tentativeG < currentG) {
        bwdNext.set(parent, current);
        bwdGScore.set(parent, tentativeG);
        const h = backwardHeuristic(parent, from);
        const f = tentativeG + h;
        bwdHeap.insert(parent, f);

        if (fwdGScore.has(parent)) {
          const totalCost = /** @type {number} */ (fwdGScore.get(parent)) + tentativeG;
          if (totalCost < bestMu) {
            bestMu = totalCost;
            bestMeeting = parent;
          }
        }
      }
    }

    return { explored, mu: bestMu, meetingPoint: bestMeeting };
  }

  /**
   * Reconstructs path by walking a predecessor map backwards.
   *
   * @param {Map<string, string>} predecessorMap - Maps each node to its predecessor
   * @param {string} from - Start node
   * @param {string} to - End node
   * @param {string} [context='Path'] - Context label for error logging
   * @returns {string[]} Path from start to end
   * @private
   */
  _walkPredecessors(predecessorMap, from, to, context = 'Path') {
    const path = [to];
    let current = to;
    while (current !== from) {
      const prev = predecessorMap.get(current);
      if (prev === undefined) {
        this._logger.error(`${context} reconstruction failed: missing predecessor`, { from, to, path });
        break;
      }
      current = prev;
      path.unshift(current);
    }
    return path;
  }

  /**
   * Reconstructs path by walking a successor map forwards.
   *
   * @param {Map<string, string>} successorMap - Maps each node to its successor
   * @param {string} from - Start node
   * @param {string} to - End node
   * @param {string} [context='Path'] - Context label for error logging
   * @returns {string[]} Path from start to end
   * @private
   */
  _walkSuccessors(successorMap, from, to, context = 'Path') {
    const path = [from];
    let current = from;
    while (current !== to) {
      const next = successorMap.get(current);
      if (next === undefined) {
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
   * @param {Map<string, string>} fwdPrevious - Forward search predecessor map
   * @param {Map<string, string>} bwdNext - Backward search successor map
   * @param {string} from - Start node
   * @param {string} to - End node
   * @param {string} meeting - Meeting point
   * @returns {string[]} Complete path
   * @private
   */
  _reconstructBidirectionalAStarPath(fwdPrevious, bwdNext, from, to, meeting) {
    const forwardPath = this._walkPredecessors(fwdPrevious, from, meeting, 'Forward path');
    const backwardPath = this._walkSuccessors(bwdNext, meeting, to, 'Backward path');
    return forwardPath.concat(backwardPath.slice(1));
  }

  /**
   * Reconstructs path from weighted search previous pointers.
   *
   * @param {Map<string, string>} previous - Predecessor map
   * @param {string} from - Start node
   * @param {string} to - End node
   * @returns {string[]} Path from start to end
   * @private
   */
  _reconstructWeightedPath(previous, from, to) {
    return this._walkPredecessors(previous, from, to, 'Weighted path');
  }

  /**
   * Reconstructs path from BFS parent map.
   *
   * @param {Map<string, string>} parentMap - BFS predecessor map
   * @param {string} from - Start node
   * @param {string} to - End node
   * @returns {string[]} Path from start to end
   * @private
   */
  _reconstructPath(parentMap, from, to) {
    return this._walkPredecessors(parentMap, from, to, 'Path');
  }

  /**
   * Reconstructs path from bidirectional BFS search.
   *
   * @param {Map<string, string>} fwdParent - Forward predecessor map
   * @param {Map<string, string>} bwdParent - Backward predecessor map
   * @param {string} from - Start node
   * @param {string} to - End node
   * @param {string} meeting - Meeting point
   * @returns {string[]} Complete path
   * @private
   */
  _reconstructBidirectionalPath(fwdParent, bwdParent, from, to, meeting) {
    const forwardPath = [meeting];
    let current = meeting;
    while (fwdParent.has(current) && fwdParent.get(current) !== undefined) {
      current = /** @type {string} */ (fwdParent.get(current));
      forwardPath.unshift(current);
    }
    if (forwardPath[0] !== from) {
      forwardPath.unshift(from);
    }

    current = meeting;
    while (bwdParent.has(current) && bwdParent.get(current) !== undefined) {
      current = /** @type {string} */ (bwdParent.get(current));
      forwardPath.push(current);
    }
    if (forwardPath[forwardPath.length - 1] !== to) {
      forwardPath.push(to);
    }

    return forwardPath;
  }
}
