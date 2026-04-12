/**
 * LogicalTraversal - Deprecated facade over GraphTraversal + AdjacencyNeighborProvider.
 *
 * New code should use GraphTraversal directly.
 *
 * @deprecated
 */
import TraversalError from '../../errors/TraversalError.ts';
import GraphTraversal from './GraphTraversal.ts';
import AdjacencyNeighborProvider from './AdjacencyNeighborProvider.ts';
import {
  requireAdjacencyMaps,
  requireTraversalState,
  stripUndefined,
  assertDirection,
  normalizeLabelFilter,
} from './traversalHelpers.ts';
import type { Direction, NeighborOptions } from '../../../ports/NeighborProviderPort.ts';

const DEFAULT_MAX_DEPTH = 1000;

interface TraversalGraph {
  hasNode: (nodeId: string) => Promise<boolean>;
  _materializeGraph: () => Promise<{ state: unknown; adjacency: unknown }>;
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

/** @deprecated Use GraphTraversal + AdjacencyNeighborProvider directly. */
export default class LogicalTraversal {
  private readonly _graph: TraversalGraph;

  constructor(graph: TraversalGraph) {
    this._graph = graph;
  }

  /** Prepares engine from current adjacency. Does NOT validate start nodes. */
  private async _prepareEngine(opts: TraversalOptions): Promise<PreparedEngine> {
    const materialized = await this._graph._materializeGraph();
    const adjacency = requireAdjacencyMaps(materialized.adjacency);
    const state = requireTraversalState(materialized.state);
    const direction = assertDirection(opts.dir);
    const labelSet = normalizeLabelFilter(opts.labelFilter);
    const depthLimit = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    const provider = new AdjacencyNeighborProvider({
      outgoing: adjacency.outgoing,
      incoming: adjacency.incoming,
      aliveNodes: new Set(state.nodeAlive.elements()),
    });
    const engine = new GraphTraversal({ provider });
    const options: NeighborOptions | undefined = labelSet ? { labels: labelSet } : undefined;
    return { engine, direction, options, depthLimit };
  }

  /** Prepares engine and validates a single start node. */
  private async _prepare(start: string, opts: TraversalOptions): Promise<PreparedEngine> {
    const prepared = await this._prepareEngine(opts);
    if (!(await this._graph.hasNode(start))) {
      throw new TraversalError(`Start node not found: ${start}`, { code: 'NODE_NOT_FOUND', context: { start } });
    }
    return prepared;
  }

  /** Validates one or more start nodes exist. */
  private async _validateStarts(starts: string | string[]): Promise<void> {
    const arr = Array.isArray(starts) ? starts : [starts];
    for (const s of arr) {
      if (!(await this._graph.hasNode(s))) {
        throw new TraversalError(`Start node not found: ${s}`, { code: 'NODE_NOT_FOUND', context: { start: s } });
      }
    }
  }

  /** Breadth-first traversal. */
  async bfs(start: string, options: TraversalOptions = {}): Promise<string[]> {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(start, options);
    const { nodes } = await engine.bfs(stripUndefined({
      start, direction, options: opts, maxDepth: depthLimit, maxNodes: Infinity,
    }));
    return nodes;
  }

  /** Depth-first traversal (pre-order). */
  async dfs(start: string, options: TraversalOptions = {}): Promise<string[]> {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(start, options);
    const { nodes } = await engine.dfs(stripUndefined({
      start, direction, options: opts, maxDepth: depthLimit, maxNodes: Infinity,
    }));
    return nodes;
  }

  /** Shortest path (unweighted BFS). */
  async shortestPath(
    from: string, to: string, options: TraversalOptions = {},
  ): Promise<{ found: boolean; path: string[]; length: number }> {
    const { engine, direction, options: opts, depthLimit } = await this._prepare(from, options);
    const { found, path, length } = await engine.shortestPath(stripUndefined({
      start: from, goal: to, direction, options: opts, maxDepth: depthLimit, maxNodes: Infinity,
    }));
    return { found, path, length };
  }

  /** Connected component (undirected BFS). */
  async connectedComponent(
    start: string, options: Omit<TraversalOptions, 'dir'> = {},
  ): Promise<string[]> {
    return await this.bfs(start, { ...options, dir: 'both' });
  }

  /** Reachability check — BFS with early termination. Non-existent nodes are unreachable. */
  async isReachable(
    from: string, to: string, options: TraversalOptions = {},
  ): Promise<{ reachable: boolean }> {
    const { engine, direction, options: opts, depthLimit } = await this._prepareEngine(options);
    const { reachable } = await engine.isReachable(stripUndefined({
      start: from, goal: to, direction, options: opts, maxDepth: depthLimit, maxNodes: Infinity, signal: options.signal,
    }));
    return { reachable };
  }

  /** Weighted shortest path (Dijkstra). */
  async weightedShortestPath(
    from: string, to: string,
    options: TraversalOptions & {
      weightFn?: (from: string, to: string, label: string) => number | Promise<number>;
      nodeWeightFn?: (nodeId: string) => number | Promise<number>;
    } = {},
  ): Promise<{ path: string[]; totalCost: number }> {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost } = await engine.weightedShortestPath(stripUndefined({
      start: from, goal: to, direction, options: opts,
      weightFn: options.weightFn, nodeWeightFn: options.nodeWeightFn,
      maxNodes: Infinity, signal: options.signal,
    }));
    return { path, totalCost };
  }

  /** A* search with heuristic guidance. */
  async aStarSearch(
    from: string, to: string,
    options: TraversalOptions & {
      weightFn?: (from: string, to: string, label: string) => number | Promise<number>;
      nodeWeightFn?: (nodeId: string) => number | Promise<number>;
      heuristicFn?: (nodeId: string, goalId: string) => number;
    } = {},
  ): Promise<{ path: string[]; totalCost: number; nodesExplored: number }> {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost, nodesExplored } = await engine.aStarSearch(stripUndefined({
      start: from, goal: to, direction, options: opts,
      weightFn: options.weightFn, nodeWeightFn: options.nodeWeightFn, heuristicFn: options.heuristicFn,
      maxNodes: Infinity, signal: options.signal,
    }));
    return { path, totalCost, nodesExplored };
  }

  /** Bidirectional A* search. Direction fixed: forward=out, backward=in. */
  async bidirectionalAStar(
    from: string, to: string,
    options: Omit<TraversalOptions, 'dir'> & {
      weightFn?: (from: string, to: string, label: string) => number | Promise<number>;
      nodeWeightFn?: (nodeId: string) => number | Promise<number>;
      forwardHeuristic?: (nodeId: string, goalId: string) => number;
      backwardHeuristic?: (nodeId: string, goalId: string) => number;
    } = {},
  ): Promise<{ path: string[]; totalCost: number; nodesExplored: number }> {
    const { engine, options: opts } = await this._prepareEngine(options);
    await this._validateStarts(from);
    const { path, totalCost, nodesExplored } = await engine.bidirectionalAStar(stripUndefined({
      start: from, goal: to, options: opts,
      weightFn: options.weightFn, nodeWeightFn: options.nodeWeightFn,
      forwardHeuristic: options.forwardHeuristic, backwardHeuristic: options.backwardHeuristic,
      maxNodes: Infinity, signal: options.signal,
    }));
    return { path, totalCost, nodesExplored };
  }

  /** Topological sort (Kahn's algorithm). */
  async topologicalSort(
    start: string | string[], options: TraversalOptions & { throwOnCycle?: boolean } = {},
  ): Promise<{ sorted: string[]; hasCycle: boolean }> {
    const { engine, direction, options: opts } = await this._prepareEngine(options);
    await this._validateStarts(start);
    const { sorted, hasCycle } = await engine.topologicalSort(stripUndefined({
      start, direction, options: opts, maxNodes: Infinity, throwOnCycle: options.throwOnCycle, signal: options.signal,
    }));
    return { sorted, hasCycle };
  }

  /** Common ancestors — multi-source ancestor intersection. Direction fixed to 'in'. */
  async commonAncestors(
    nodes: string[], options: TraversalOptions & { maxResults?: number } = {},
  ): Promise<{ ancestors: string[] }> {
    const { engine, options: opts, depthLimit } = await this._prepareEngine(options);
    for (const n of nodes) {
      if (!(await this._graph.hasNode(n))) {
        throw new TraversalError(`Node not found: ${n}`, { code: 'NODE_NOT_FOUND', context: { node: n } });
      }
    }
    const { ancestors } = await engine.commonAncestors(stripUndefined({
      nodes, options: opts, maxDepth: depthLimit, maxResults: options.maxResults, signal: options.signal,
    }));
    return { ancestors };
  }

  /** Weighted longest path via topological sort + DP (DAGs only). */
  async weightedLongestPath(
    from: string, to: string,
    options: TraversalOptions & {
      weightFn?: (from: string, to: string, label: string) => number | Promise<number>;
      nodeWeightFn?: (nodeId: string) => number | Promise<number>;
    } = {},
  ): Promise<{ path: string[]; totalCost: number }> {
    const { engine, direction, options: opts } = await this._prepare(from, options);
    const { path, totalCost } = await engine.weightedLongestPath(stripUndefined({
      start: from, goal: to, direction, options: opts,
      weightFn: options.weightFn, nodeWeightFn: options.nodeWeightFn,
      maxNodes: Infinity, signal: options.signal,
    }));
    return { path, totalCost };
  }

  /** Longest-path level assignment (DAGs only). */
  async levels(
    start: string | string[], options: TraversalOptions = {},
  ): Promise<{ levels: Map<string, number>; maxLevel: number }> {
    const { engine, direction, options: opts } = await this._prepareEngine(options);
    await this._validateStarts(start);
    const { levels, maxLevel } = await engine.levels(stripUndefined({
      start, direction, options: opts, maxNodes: Infinity, signal: options.signal,
    }));
    return { levels, maxLevel };
  }

  /** Transitive reduction — minimal edge set preserving reachability (DAGs only). */
  async transitiveReduction(
    start: string | string[], options: TraversalOptions = {},
  ): Promise<{ edges: Array<{ from: string; to: string; label: string }>; removed: number }> {
    const { engine, direction, options: opts } = await this._prepareEngine(options);
    await this._validateStarts(start);
    const { edges, removed } = await engine.transitiveReduction(stripUndefined({
      start, direction, options: opts, maxNodes: Infinity, signal: options.signal,
    }));
    return { edges, removed };
  }

  /** Transitive closure — all implied reachability edges. */
  async transitiveClosure(
    start: string | string[], options: TraversalOptions & { maxEdges?: number } = {},
  ): Promise<{ edges: Array<{ from: string; to: string }> }> {
    const { engine, direction, options: opts } = await this._prepareEngine(options);
    await this._validateStarts(start);
    const { edges } = await engine.transitiveClosure(stripUndefined({
      start, direction, options: opts, maxNodes: Infinity, maxEdges: options.maxEdges, signal: options.signal,
    }));
    return { edges };
  }

  /** Transitive closure stream — yields implied reachability edges lazily. */
  async *transitiveClosureStream(
    start: string | string[], options: TraversalOptions & { maxEdges?: number } = {},
  ): AsyncGenerator<{ from: string; to: string }> {
    const { engine, direction, options: opts } = await this._prepareEngine(options);
    await this._validateStarts(start);
    yield* engine.transitiveClosureStream(stripUndefined({
      start, direction, options: opts, maxNodes: Infinity, maxEdges: options.maxEdges, signal: options.signal,
    }));
  }

  /** Find all root ancestors (in-degree-0 nodes) reachable backward from start. */
  async rootAncestors(
    start: string, options: Omit<TraversalOptions, 'dir'> = {},
  ): Promise<{ roots: string[] }> {
    const { engine, options: opts, depthLimit } = await this._prepare(start, options);
    const { roots } = await engine.rootAncestors(stripUndefined({
      start, options: opts, maxNodes: Infinity, maxDepth: options.maxDepth ?? depthLimit, signal: options.signal,
    }));
    return { roots };
  }
}
