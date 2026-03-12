/**
 * LogicalTraversal - Traversal utilities for the logical WARP graph.
 *
 * **Deprecated**: delegates to GraphTraversal + AdjacencyNeighborProvider
 * internally. The public API is unchanged for backward compatibility.
 * New code should use GraphTraversal directly.
 *
 * Provides deterministic BFS/DFS/shortestPath/connectedComponent over
 * the materialized logical graph (node/edge OR-Sets), not the Git DAG.
 */

import TraversalError from '../errors/TraversalError.js';
import GraphTraversal from './GraphTraversal.js';
import AdjacencyNeighborProvider from './AdjacencyNeighborProvider.js';
import { orsetElements } from '../crdt/ORSet.js';

const DEFAULT_MAX_DEPTH = 1000;

/**
 * Validates and normalizes an edge direction parameter.
 *
 * @param {string|undefined} direction - The direction to validate ('out', 'in', or 'both')
 * @returns {'out'|'in'|'both'} The validated direction, defaulting to 'out' if undefined
 * @throws {TraversalError} If the direction is not one of the valid values
 */
function assertDirection(direction) {
  if (direction === undefined) {
    return 'out';
  }
  if (direction === 'out' || direction === 'in' || direction === 'both') {
    return direction;
  }
  throw new TraversalError(`Invalid direction: ${direction}`, {
    code: 'INVALID_DIRECTION',
    context: { direction },
  });
}

/**
 * Normalizes a label filter into a Set for efficient lookup.
 *
 * Accepts a single label string, an array of labels, or undefined. Returns
 * a Set containing the label(s) or undefined if no filter is specified.
 *
 * @param {string|string[]|undefined} labelFilter - The label filter to normalize
 * @returns {Set<string>|undefined} A Set of labels for filtering, or undefined if no filter
 * @throws {TraversalError} If labelFilter is neither a string, array, nor undefined
 */
function normalizeLabelFilter(labelFilter) {
  if (labelFilter === undefined) {
    return undefined;
  }
  if (Array.isArray(labelFilter)) {
    return new Set(labelFilter);
  }
  if (typeof labelFilter === 'string') {
    return new Set([labelFilter]);
  }
  throw new TraversalError('labelFilter must be a string or array', {
    code: 'INVALID_LABEL_FILTER',
    context: { receivedType: typeof labelFilter },
  });
}

/**
 * Deterministic graph traversal engine for the materialized WARP graph.
 *
 * @deprecated Use GraphTraversal + AdjacencyNeighborProvider directly.
 */
export default class LogicalTraversal {
  /**
   * Creates a new LogicalTraversal.
   *
   * @param {import('../WarpGraph.js').default} graph - The WarpGraph instance to traverse
   */
  constructor(graph) {
    this._graph = graph;
  }

  /**
   * Prepares a GraphTraversal engine backed by the current adjacency.
   * Does NOT validate any start node — use this for methods that accept
   * multiple starts or no start at all (topologicalSort, commonAncestors).
   *
   * @private
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], maxDepth?: number }} opts - The traversal options
   * @returns {Promise<{engine: GraphTraversal, direction: 'out'|'in'|'both', options: {labels?: Set<string>}|undefined, depthLimit: number}>}
   * @throws {TraversalError} If the direction is invalid (INVALID_DIRECTION)
   * @throws {TraversalError} If the labelFilter is invalid (INVALID_LABEL_FILTER)
   */
  async _prepareEngine({ dir, labelFilter, maxDepth }) {
    // Private access: _materializeGraph is a WarpGraph internal.
    // This coupling will be removed when the LogicalTraversal facade is sunset
    // and callers migrate to GraphTraversal + NeighborProvider directly.
    const materialized = await /** @type {{ _materializeGraph: () => Promise<{state: {nodeAlive: import('../crdt/ORSet.js').ORSet}, adjacency: {outgoing: Map<string, Array<{neighborId: string, label: string}>>, incoming: Map<string, Array<{neighborId: string, label: string}>>}}> }} */ (this._graph)._materializeGraph();

    const direction = assertDirection(dir);
    const labelSet = normalizeLabelFilter(labelFilter);
    const { adjacency, state } = materialized;
    const depthLimit = maxDepth ?? DEFAULT_MAX_DEPTH;

    const provider = new AdjacencyNeighborProvider({
      outgoing: adjacency.outgoing,
      incoming: adjacency.incoming,
      aliveNodes: new Set(orsetElements(state.nodeAlive)),
    });
    const engine = new GraphTraversal({ provider });

    /** @type {{labels?: Set<string>}|undefined} */
    const options = labelSet ? { labels: labelSet } : undefined;

    return { engine, direction, options, depthLimit };
  }

  /**
   * Prepares a GraphTraversal engine and validates a single start node.
   *
   * @private
   * @param {string} start - The starting node ID for traversal
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], maxDepth?: number }} opts - The traversal options
   * @returns {Promise<{engine: GraphTraversal, direction: 'out'|'in'|'both', options: {labels?: Set<string>}|undefined, depthLimit: number}>}
   * @throws {TraversalError} If the start node is not found (NODE_NOT_FOUND)
   * @throws {TraversalError} If the direction is invalid (INVALID_DIRECTION)
   * @throws {TraversalError} If the labelFilter is invalid (INVALID_LABEL_FILTER)
   */
  async _prepare(start, opts) {
    const prepared = await this._prepareEngine(opts);
    // Note: engine also validates via provider.hasNode — redundant but harmless.
    if (!(await this._graph.hasNode(start))) {
      throw new TraversalError(`Start node not found: ${start}`, {
        code: 'NODE_NOT_FOUND',
        context: { start },
      });
    }

    return prepared;
  }

  /**
   * Breadth-first traversal.
   *
   * @param {string} start - Starting node ID
   * @param {{ maxDepth?: number, dir?: 'out'|'in'|'both', labelFilter?: string|string[] }} [options] - Traversal options
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async bfs(start, options = {}) {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(start, options);
    const { nodes } = await engine.bfs({
      start,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    });
    return await Promise.resolve(nodes);
  }

  /**
   * Depth-first traversal (pre-order).
   *
   * @param {string} start - Starting node ID
   * @param {{ maxDepth?: number, dir?: 'out'|'in'|'both', labelFilter?: string|string[] }} [options] - Traversal options
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async dfs(start, options = {}) {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(start, options);
    const { nodes } = await engine.dfs({
      start,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    });
    return await Promise.resolve(nodes);
  }

  /**
   * Shortest path (unweighted) using BFS.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {{ maxDepth?: number, dir?: 'out'|'in'|'both', labelFilter?: string|string[] }} [options] - Traversal options
   * @returns {Promise<{found: boolean, path: string[], length: number}>}
   *   When `found` is true, `path` contains the node IDs from `from` to `to` and
   *   `length` is the hop count. When `found` is false, `path` is empty and `length` is -1.
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async shortestPath(from, to, options = {}) {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(from, options);
    const { found, path, length } = await engine.shortestPath({
      start: from,
      goal: to,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    });
    return await Promise.resolve({ found, path, length });
  }

  /**
   * Connected component (undirected by default).
   *
   * @param {string} start - Starting node ID
   * @param {{ maxDepth?: number, labelFilter?: string|string[] }} [options] - Traversal options
   * @returns {Promise<string[]>} Node IDs in visit order
   * @throws {TraversalError} If the start node is not found
   */
  async connectedComponent(start, options = {}) {
    return await this.bfs(start, { ...options, dir: 'both' });
  }

  /**
   * Reachability check — BFS with early termination.
   *
   * Non-existent nodes are simply unreachable (no NODE_NOT_FOUND throw).
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {{ maxDepth?: number, dir?: 'out'|'in'|'both', labelFilter?: string|string[], signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{reachable: boolean}>}
   */
  async isReachable(from, to, options = {}) {
    const { engine, direction, options: opts, depthLimit } = await this._prepareEngine(options);
    const { reachable } = await engine.isReachable({
      start: from,
      goal: to,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
      signal: options.signal,
    });
    return { reachable };
  }

  /**
   * Weighted shortest path (Dijkstra's algorithm).
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], weightFn?: (from: string, to: string, label: string) => number | Promise<number>, nodeWeightFn?: (nodeId: string) => number | Promise<number>, signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{path: string[], totalCost: number}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async weightedShortestPath(from, to, options = {}) {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost } = await engine.weightedShortestPath({
      start: from,
      goal: to,
      direction,
      options: opts,
      weightFn: options.weightFn,
      nodeWeightFn: options.nodeWeightFn,
      maxNodes: Infinity,
      signal: options.signal,
    });
    return { path, totalCost };
  }

  /**
   * A* search with heuristic guidance.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], weightFn?: (from: string, to: string, label: string) => number | Promise<number>, nodeWeightFn?: (nodeId: string) => number | Promise<number>, heuristicFn?: (nodeId: string, goalId: string) => number, signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async aStarSearch(from, to, options = {}) {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost, nodesExplored } = await engine.aStarSearch({
      start: from,
      goal: to,
      direction,
      options: opts,
      weightFn: options.weightFn,
      nodeWeightFn: options.nodeWeightFn,
      heuristicFn: options.heuristicFn,
      maxNodes: Infinity,
      signal: options.signal,
    });
    return { path, totalCost, nodesExplored };
  }

  /**
   * Bidirectional A* search.
   *
   * Direction is fixed: forward uses 'out', backward uses 'in'.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {{ labelFilter?: string|string[], weightFn?: (from: string, to: string, label: string) => number | Promise<number>, nodeWeightFn?: (nodeId: string) => number | Promise<number>, forwardHeuristic?: (nodeId: string, goalId: string) => number, backwardHeuristic?: (nodeId: string, goalId: string) => number, signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{path: string[], totalCost: number, nodesExplored: number}>}
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async bidirectionalAStar(from, to, options = {}) {
    const { engine, options: opts } = await this._prepareEngine(options);

    if (!(await this._graph.hasNode(from))) {
      throw new TraversalError(`Start node not found: ${from}`, {
        code: 'NODE_NOT_FOUND',
        context: { start: from },
      });
    }

    const { path, totalCost, nodesExplored } = await engine.bidirectionalAStar({
      start: from,
      goal: to,
      options: opts,
      weightFn: options.weightFn,
      nodeWeightFn: options.nodeWeightFn,
      forwardHeuristic: options.forwardHeuristic,
      backwardHeuristic: options.backwardHeuristic,
      maxNodes: Infinity,
      signal: options.signal,
    });
    return { path, totalCost, nodesExplored };
  }

  /**
   * Topological sort (Kahn's algorithm).
   *
   * @param {string|string[]} start - One or more start nodes
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], throwOnCycle?: boolean, signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{sorted: string[], hasCycle: boolean}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if throwOnCycle and cycle found
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async topologicalSort(start, options = {}) {
    const { engine, direction, options: opts } = await this._prepareEngine(options);

    // Validate each start node
    const starts = Array.isArray(start) ? start : [start];
    for (const s of starts) {
      if (!(await this._graph.hasNode(s))) {
        throw new TraversalError(`Start node not found: ${s}`, {
          code: 'NODE_NOT_FOUND',
          context: { start: s },
        });
      }
    }

    const { sorted, hasCycle } = await engine.topologicalSort({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      throwOnCycle: options.throwOnCycle,
      signal: options.signal,
    });
    return { sorted, hasCycle };
  }

  /**
   * Common ancestors — multi-source ancestor intersection.
   *
   * Direction is fixed to 'in' (backward BFS).
   *
   * @param {string[]} nodes - Nodes to find common ancestors of
   * @param {{ maxDepth?: number, labelFilter?: string|string[], maxResults?: number, signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{ancestors: string[]}>}
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a node does not exist
   */
  async commonAncestors(nodes, options = {}) {
    const { engine, options: opts, depthLimit } = await this._prepareEngine(options);

    // Validate each node
    for (const n of nodes) {
      if (!(await this._graph.hasNode(n))) {
        throw new TraversalError(`Node not found: ${n}`, {
          code: 'NODE_NOT_FOUND',
          context: { node: n },
        });
      }
    }

    const { ancestors } = await engine.commonAncestors({
      nodes,
      options: opts,
      maxDepth: depthLimit,
      maxResults: options.maxResults,
      signal: options.signal,
    });
    return { ancestors };
  }

  /**
   * Weighted longest path via topological sort + DP.
   *
   * Only valid on DAGs.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], weightFn?: (from: string, to: string, label: string) => number | Promise<number>, nodeWeightFn?: (nodeId: string) => number | Promise<number>, signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{path: string[], totalCost: number}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async weightedLongestPath(from, to, options = {}) {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost } = await engine.weightedLongestPath({
      start: from,
      goal: to,
      direction,
      options: opts,
      weightFn: options.weightFn,
      nodeWeightFn: options.nodeWeightFn,
      maxNodes: Infinity,
      signal: options.signal,
    });
    return { path, totalCost };
  }

  /**
   * Longest-path level assignment (DAGs only).
   *
   * @param {string|string[]} start - One or more start nodes
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{levels: Map<string, number>, maxLevel: number}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async levels(start, options = {}) {
    const { engine, direction, options: opts } = await this._prepareEngine(options);

    const starts = Array.isArray(start) ? start : [start];
    for (const s of starts) {
      if (!(await this._graph.hasNode(s))) {
        throw new TraversalError(`Start node not found: ${s}`, {
          code: 'NODE_NOT_FOUND',
          context: { start: s },
        });
      }
    }

    const { levels, maxLevel } = await engine.levels({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      signal: options.signal,
    });
    return { levels, maxLevel };
  }

  /**
   * Transitive reduction — minimal edge set preserving reachability (DAGs only).
   *
   * @param {string|string[]} start - One or more start nodes
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{edges: Array<{from: string, to: string, label: string}>, removed: number}>}
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async transitiveReduction(start, options = {}) {
    const { engine, direction, options: opts } = await this._prepareEngine(options);

    const starts = Array.isArray(start) ? start : [start];
    for (const s of starts) {
      if (!(await this._graph.hasNode(s))) {
        throw new TraversalError(`Start node not found: ${s}`, {
          code: 'NODE_NOT_FOUND',
          context: { start: s },
        });
      }
    }

    const { edges, removed } = await engine.transitiveReduction({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      signal: options.signal,
    });
    return { edges, removed };
  }

  /**
   * Transitive closure — all implied reachability edges.
   *
   * @param {string|string[]} start - One or more start nodes
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], maxEdges?: number, signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{edges: Array<{from: string, to: string}>}>}
   * @throws {TraversalError} code 'E_MAX_EDGES_EXCEEDED' if closure exceeds maxEdges
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async transitiveClosure(start, options = {}) {
    const { engine, direction, options: opts } = await this._prepareEngine(options);

    const starts = Array.isArray(start) ? start : [start];
    for (const s of starts) {
      if (!(await this._graph.hasNode(s))) {
        throw new TraversalError(`Start node not found: ${s}`, {
          code: 'NODE_NOT_FOUND',
          context: { start: s },
        });
      }
    }

    const { edges } = await engine.transitiveClosure({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      maxEdges: options.maxEdges,
      signal: options.signal,
    });
    return { edges };
  }

  /**
   * Transitive closure stream — yields implied reachability edges lazily.
   *
   * @param {string|string[]} start - One or more start nodes
   * @param {{ dir?: 'out'|'in'|'both', labelFilter?: string|string[], maxEdges?: number, signal?: AbortSignal }} [options] - Traversal options
   * @yields {{from: string, to: string}}
   * @throws {TraversalError} code 'E_MAX_EDGES_EXCEEDED' if closure exceeds maxEdges
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async *transitiveClosureStream(start, options = {}) {
    const { engine, direction, options: opts } = await this._prepareEngine(options);

    const starts = Array.isArray(start) ? start : [start];
    for (const s of starts) {
      if (!(await this._graph.hasNode(s))) {
        throw new TraversalError(`Start node not found: ${s}`, {
          code: 'NODE_NOT_FOUND',
          context: { start: s },
        });
      }
    }

    yield* engine.transitiveClosureStream({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      maxEdges: options.maxEdges,
      signal: options.signal,
    });
  }

  /**
   * Find all root ancestors (in-degree-0 nodes) reachable backward from start.
   *
   * @param {string} start - Starting node ID
   * @param {{ labelFilter?: string|string[], maxDepth?: number, signal?: AbortSignal }} [options] - Traversal options
   * @returns {Promise<{roots: string[]}>}
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if start node does not exist
   */
  async rootAncestors(start, options = {}) {
    const { engine, options: opts, depthLimit } = await this._prepare(start, options);

    const { roots } = await engine.rootAncestors({
      start,
      options: opts,
      maxNodes: Infinity,
      maxDepth: options.maxDepth ?? depthLimit,
      signal: options.signal,
    });
    return { roots };
  }
}
