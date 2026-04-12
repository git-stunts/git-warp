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

import TraversalError from '../../errors/TraversalError.ts';
import GraphTraversal from './GraphTraversal.ts';
import AdjacencyNeighborProvider from './AdjacencyNeighborProvider.js';
import {
  requireAdjacencyMaps,
  requireTraversalState,
  stripUndefined,
  assertDirection,
  normalizeLabelFilter,
} from './traversalHelpers.ts';
import type { Direction, NeighborOptions } from '../../../ports/NeighborProviderPort.ts';

const DEFAULT_MAX_DEPTH = 1000;

// ── Internal types ─────────────────────────────────────────────────────────

interface TraversalGraph {
  hasNode: (nodeId: string) => Promise<boolean>;
  _materializeGraph: () => Promise<{
    state: unknown;
    adjacency: unknown;
  }>;
}

interface TraversalOptions {
  dir?: string;
  labelFilter?: string | string[];
  maxDepth?: number;
  signal?: AbortSignal;
}

interface PreparedEngine {
  engine: GraphTraversal;
  direction: Direction;
  options: NeighborOptions | undefined;
  depthLimit: number;
}

// ── Class ──────────────────────────────────────────────────────────────────

/**
 * Deterministic graph traversal engine for the materialized WARP graph.
 *
 * @deprecated Use GraphTraversal + AdjacencyNeighborProvider directly.
 */
export default class LogicalTraversal {
  private readonly _graph: TraversalGraph;

  /**
   * Creates a new LogicalTraversal.
   *
   * @param graph - Graph-like read handle with node checks and adjacency materialization
   */
  constructor(graph: TraversalGraph) {
    this._graph = graph;
  }

  /**
   * Prepares a GraphTraversal engine backed by the current adjacency.
   * Does NOT validate any start node — use this for methods that accept
   * multiple starts or no start at all (topologicalSort, commonAncestors).
   *
   * @throws {TraversalError} code 'INVALID_DIRECTION' if direction is invalid
   * @throws {TraversalError} code 'INVALID_LABEL_FILTER' if labelFilter is invalid
   */
  private async _prepareEngine({
    dir,
    labelFilter,
    maxDepth,
  }: TraversalOptions): Promise<PreparedEngine> {
    const materialized = await this._graph._materializeGraph();
    const adjacency = requireAdjacencyMaps(materialized.adjacency);
    const state = requireTraversalState(materialized.state);

    const direction = assertDirection(dir);
    const labelSet = normalizeLabelFilter(labelFilter);
    const depthLimit = maxDepth ?? DEFAULT_MAX_DEPTH;

    const provider = new AdjacencyNeighborProvider({
      outgoing: adjacency.outgoing,
      incoming: adjacency.incoming,
      aliveNodes: new Set(state.nodeAlive.elements()),
    });
    const engine = new GraphTraversal({ provider });

    const options: NeighborOptions | undefined = labelSet ? { labels: labelSet } : undefined;

    return { engine, direction, options, depthLimit };
  }

  /**
   * Prepares a GraphTraversal engine and validates a single start node.
   *
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if start node is not found
   * @throws {TraversalError} code 'INVALID_DIRECTION' if direction is invalid
   * @throws {TraversalError} code 'INVALID_LABEL_FILTER' if labelFilter is invalid
   */
  private async _prepare(start: string, opts: TraversalOptions): Promise<PreparedEngine> {
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
   * @param start - Starting node ID
   * @param options - Traversal options
   * @returns Node IDs in visit order
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async bfs(
    start: string,
    options: TraversalOptions = {},
  ): Promise<string[]> {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(start, options);
    const { nodes } = await engine.bfs(stripUndefined({
      start,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    }));
    return nodes;
  }

  /**
   * Depth-first traversal (pre-order).
   *
   * @param start - Starting node ID
   * @param options - Traversal options
   * @returns Node IDs in visit order
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async dfs(
    start: string,
    options: TraversalOptions = {},
  ): Promise<string[]> {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(start, options);
    const { nodes } = await engine.dfs(stripUndefined({
      start,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    }));
    return nodes;
  }

  /**
   * Shortest path (unweighted) using BFS.
   *
   * @param from - Source node ID
   * @param to - Target node ID
   * @param options - Traversal options
   * @returns When `found` is true, `path` contains node IDs from `from` to `to`
   *   and `length` is the hop count. When `found` is false, `path` is empty and `length` is -1.
   * @throws {TraversalError} If the start node is not found or direction is invalid
   */
  async shortestPath(
    from: string,
    to: string,
    options: TraversalOptions = {},
  ): Promise<{ found: boolean; path: string[]; length: number }> {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(from, options);
    const { found, path, length } = await engine.shortestPath(stripUndefined({
      start: from,
      goal: to,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
    }));
    return { found, path, length };
  }

  /**
   * Connected component (undirected by default).
   *
   * @param start - Starting node ID
   * @param options - Traversal options
   * @returns Node IDs in visit order
   * @throws {TraversalError} If the start node is not found
   */
  async connectedComponent(
    start: string,
    options: Omit<TraversalOptions, 'dir'> = {},
  ): Promise<string[]> {
    return await this.bfs(start, { ...options, dir: 'both' });
  }

  /**
   * Reachability check — BFS with early termination.
   *
   * Non-existent nodes are simply unreachable (no NODE_NOT_FOUND throw).
   *
   * @param from - Source node ID
   * @param to - Target node ID
   * @param options - Traversal options
   */
  async isReachable(
    from: string,
    to: string,
    options: TraversalOptions = {},
  ): Promise<{ reachable: boolean }> {
    const { engine, direction, options: opts, depthLimit } = await this._prepareEngine(options);
    const { reachable } = await engine.isReachable(stripUndefined({
      start: from,
      goal: to,
      direction,
      options: opts,
      maxDepth: depthLimit,
      maxNodes: Infinity,
      signal: options.signal,
    }));
    return { reachable };
  }

  /**
   * Weighted shortest path (Dijkstra's algorithm).
   *
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async weightedShortestPath(
    from: string,
    to: string,
    options: TraversalOptions & {
      weightFn?: (from: string, to: string, label: string) => number | Promise<number>;
      nodeWeightFn?: (nodeId: string) => number | Promise<number>;
    } = {},
  ): Promise<{ path: string[]; totalCost: number }> {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost } = await engine.weightedShortestPath(stripUndefined({
      start: from,
      goal: to,
      direction,
      options: opts,
      weightFn: options.weightFn,
      nodeWeightFn: options.nodeWeightFn,
      maxNodes: Infinity,
      signal: options.signal,
    }));
    return { path, totalCost };
  }

  /**
   * A* search with heuristic guidance.
   *
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async aStarSearch(
    from: string,
    to: string,
    options: TraversalOptions & {
      weightFn?: (from: string, to: string, label: string) => number | Promise<number>;
      nodeWeightFn?: (nodeId: string) => number | Promise<number>;
      heuristicFn?: (nodeId: string, goalId: string) => number;
    } = {},
  ): Promise<{ path: string[]; totalCost: number; nodesExplored: number }> {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost, nodesExplored } = await engine.aStarSearch(stripUndefined({
      start: from,
      goal: to,
      direction,
      options: opts,
      weightFn: options.weightFn,
      nodeWeightFn: options.nodeWeightFn,
      heuristicFn: options.heuristicFn,
      maxNodes: Infinity,
      signal: options.signal,
    }));
    return { path, totalCost, nodesExplored };
  }

  /**
   * Bidirectional A* search.
   *
   * Direction is fixed: forward uses 'out', backward uses 'in'.
   *
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async bidirectionalAStar(
    from: string,
    to: string,
    options: Omit<TraversalOptions, 'dir'> & {
      weightFn?: (from: string, to: string, label: string) => number | Promise<number>;
      nodeWeightFn?: (nodeId: string) => number | Promise<number>;
      forwardHeuristic?: (nodeId: string, goalId: string) => number;
      backwardHeuristic?: (nodeId: string, goalId: string) => number;
    } = {},
  ): Promise<{ path: string[]; totalCost: number; nodesExplored: number }> {
    const { engine, options: opts } = await this._prepareEngine(options);

    if (!(await this._graph.hasNode(from))) {
      throw new TraversalError(`Start node not found: ${from}`, {
        code: 'NODE_NOT_FOUND',
        context: { start: from },
      });
    }

    const { path, totalCost, nodesExplored } = await engine.bidirectionalAStar(stripUndefined({
      start: from,
      goal: to,
      options: opts,
      weightFn: options.weightFn,
      nodeWeightFn: options.nodeWeightFn,
      forwardHeuristic: options.forwardHeuristic,
      backwardHeuristic: options.backwardHeuristic,
      maxNodes: Infinity,
      signal: options.signal,
    }));
    return { path, totalCost, nodesExplored };
  }

  /**
   * Topological sort (Kahn's algorithm).
   *
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if throwOnCycle and cycle found
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async topologicalSort(
    start: string | string[],
    options: TraversalOptions & { throwOnCycle?: boolean } = {},
  ): Promise<{ sorted: string[]; hasCycle: boolean }> {
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

    const { sorted, hasCycle } = await engine.topologicalSort(stripUndefined({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      throwOnCycle: options.throwOnCycle,
      signal: options.signal,
    }));
    return { sorted, hasCycle };
  }

  /**
   * Common ancestors — multi-source ancestor intersection.
   *
   * Direction is fixed to 'in' (backward BFS).
   *
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a node does not exist
   */
  async commonAncestors(
    nodes: string[],
    options: TraversalOptions & { maxResults?: number } = {},
  ): Promise<{ ancestors: string[] }> {
    const { engine, options: opts, depthLimit } = await this._prepareEngine(options);

    for (const n of nodes) {
      if (!(await this._graph.hasNode(n))) {
        throw new TraversalError(`Node not found: ${n}`, {
          code: 'NODE_NOT_FOUND',
          context: { node: n },
        });
      }
    }

    const { ancestors } = await engine.commonAncestors(stripUndefined({
      nodes,
      options: opts,
      maxDepth: depthLimit,
      maxResults: options.maxResults,
      signal: options.signal,
    }));
    return { ancestors };
  }

  /**
   * Weighted longest path via topological sort + DP.
   *
   * Only valid on DAGs.
   *
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'NO_PATH' if unreachable
   * @throws {TraversalError} code 'E_WEIGHT_FN_CONFLICT' if both weightFn and nodeWeightFn provided
   */
  async weightedLongestPath(
    from: string,
    to: string,
    options: TraversalOptions & {
      weightFn?: (from: string, to: string, label: string) => number | Promise<number>;
      nodeWeightFn?: (nodeId: string) => number | Promise<number>;
    } = {},
  ): Promise<{ path: string[]; totalCost: number }> {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost } = await engine.weightedLongestPath(stripUndefined({
      start: from,
      goal: to,
      direction,
      options: opts,
      weightFn: options.weightFn,
      nodeWeightFn: options.nodeWeightFn,
      maxNodes: Infinity,
      signal: options.signal,
    }));
    return { path, totalCost };
  }

  /**
   * Longest-path level assignment (DAGs only).
   *
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async levels(
    start: string | string[],
    options: TraversalOptions = {},
  ): Promise<{ levels: Map<string, number>; maxLevel: number }> {
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

    const { levels, maxLevel } = await engine.levels(stripUndefined({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      signal: options.signal,
    }));
    return { levels, maxLevel };
  }

  /**
   * Transitive reduction — minimal edge set preserving reachability (DAGs only).
   *
   * @throws {TraversalError} code 'ERR_GRAPH_HAS_CYCLES' if graph has cycles
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async transitiveReduction(
    start: string | string[],
    options: TraversalOptions = {},
  ): Promise<{ edges: Array<{ from: string; to: string; label: string }>; removed: number }> {
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

    const { edges, removed } = await engine.transitiveReduction(stripUndefined({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      signal: options.signal,
    }));
    return { edges, removed };
  }

  /**
   * Transitive closure — all implied reachability edges.
   *
   * @throws {TraversalError} code 'E_MAX_EDGES_EXCEEDED' if closure exceeds maxEdges
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async transitiveClosure(
    start: string | string[],
    options: TraversalOptions & { maxEdges?: number } = {},
  ): Promise<{ edges: Array<{ from: string; to: string }> }> {
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

    const { edges } = await engine.transitiveClosure(stripUndefined({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      maxEdges: options.maxEdges,
      signal: options.signal,
    }));
    return { edges };
  }

  /**
   * Transitive closure stream — yields implied reachability edges lazily.
   *
   * @throws {TraversalError} code 'E_MAX_EDGES_EXCEEDED' if closure exceeds maxEdges
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if a start node does not exist
   */
  async *transitiveClosureStream(
    start: string | string[],
    options: TraversalOptions & { maxEdges?: number } = {},
  ): AsyncGenerator<{ from: string; to: string }> {
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

    yield* engine.transitiveClosureStream(stripUndefined({
      start,
      direction,
      options: opts,
      maxNodes: Infinity,
      maxEdges: options.maxEdges,
      signal: options.signal,
    }));
  }

  /**
   * Find all root ancestors (in-degree-0 nodes) reachable backward from start.
   *
   * @throws {TraversalError} code 'NODE_NOT_FOUND' if start node does not exist
   */
  async rootAncestors(
    start: string,
    options: Omit<TraversalOptions, 'dir'> = {},
  ): Promise<{ roots: string[] }> {
    const { engine, options: opts, depthLimit } = await this._prepare(start, options);

    const { roots } = await engine.rootAncestors(stripUndefined({
      start,
      options: opts,
      maxNodes: Infinity,
      maxDepth: options.maxDepth ?? depthLimit,
      signal: options.signal,
    }));
    return { roots };
  }
}
