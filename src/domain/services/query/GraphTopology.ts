/**
 * GraphTopology — topology and component algorithms.
 *
 * Contains: connectedComponent, topologicalSort, commonAncestors,
 * weightedLongestPath. Receives a BfsFn callback from the facade
 * to avoid circular imports.
 *
 * @module domain/services/query/GraphTopology
 */

import type { Direction, NeighborEdge, NeighborOptions } from '../../../ports/NeighborProviderPort.ts';
import TraversalError from '../../errors/TraversalError.ts';
import MinHeap from '../../utils/MinHeap.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import {
  type BfsFn,
  type RunStats,
  type TraversalStats,
  type WeightFn,
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_DEPTH,
  lexTieBreaker,
  stripUndefined,
  computeTopoHasCycle,
  type default as TraversalContext,
} from './TraversalContext.ts';

export default class GraphTopology {
  private readonly _ctx: TraversalContext;
  private readonly _bfs: BfsFn;

  constructor(ctx: TraversalContext, bfs: BfsFn) {
    this._ctx = ctx;
    this._bfs = bfs;
  }

  async connectedComponent(params: {
    start: string;
    options?: NeighborOptions;
    maxNodes?: number;
    maxDepth?: number;
    signal?: AbortSignal;
  }): Promise<{ nodes: string[]; stats: TraversalStats }> {
    return await this._bfs(stripUndefined({
      start: params.start,
      direction: 'both' as const,
      options: params.options,
      maxNodes: params.maxNodes,
      maxDepth: params.maxDepth,
      signal: params.signal,
    }));
  }

  async topologicalSort(params: {
    start: string | string[];
    direction?: Direction | undefined;
    options?: NeighborOptions | undefined;
    maxNodes?: number | undefined;
    throwOnCycle?: boolean | undefined;
    signal?: AbortSignal | undefined;
    _returnAdjList?: boolean | undefined;
    _lightweight?: boolean | undefined;
  }): Promise<{
    sorted: string[];
    hasCycle: boolean;
    stats: TraversalStats;
    _neighborEdgeMap?: Map<string, NeighborEdge[]>;
  }> {
    const direction = params.direction ?? 'out';
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const throwOnCycle = params.throwOnCycle ?? false;
    const { signal, options } = params;
    const _returnAdjList = params._returnAdjList ?? false;
    const _lightweight = params._lightweight ?? !_returnAdjList;
    const lightweight = _lightweight && !_returnAdjList;

    const rs = this._ctx.newRunStats();
    const starts = [...new Set(Array.isArray(params.start) ? params.start : [params.start])];
    for (const s of starts) {
      await this._ctx.validateStart(s);
    }

    // Phase 1: Discover all reachable nodes + compute in-degrees
    const adjList: Map<string, string[]> | null = lightweight ? null : new Map();
    const neighborEdgeMap = new Map<string, NeighborEdge[]>();
    const inDegree = new Map<string, number>();
    const discovered = new Set<string>();
    const queue: string[] = [...starts];
    let qHead = 0;
    for (const s of starts) { discovered.add(s); }

    while (qHead < queue.length) {
      if (discovered.size % 1000 === 0) { checkAborted(signal, 'topologicalSort'); }
      const nodeId = queue[qHead++]!;
      const neighbors = await this._ctx.getNeighbors(nodeId, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId } of neighbors) {
        inDegree.set(neighborId, (inDegree.get(neighborId) ?? 0) + 1);
        if (!discovered.has(neighborId)) {
          discovered.add(neighborId);
          queue.push(neighborId);
        }
      }
      if (adjList) {
        adjList.set(nodeId, neighbors.map(({ neighborId }) => neighborId));
      }
      if (_returnAdjList) {
        neighborEdgeMap.set(nodeId, neighbors);
      }
    }

    for (const s of starts) {
      if (!inDegree.has(s)) { inDegree.set(s, 0); }
    }

    const getNeighborIds = this._createTopoNeighborIdReader(adjList, direction, rs, options);

    // Phase 2: Kahn's — MinHeap for O(N log N) zero-indegree processing
    const ready = new MinHeap<string>({ tieBreaker: lexTieBreaker });
    for (const nodeId of discovered) {
      if ((inDegree.get(nodeId) ?? 0) === 0) {
        ready.insert(nodeId, 0);
      }
    }

    const sorted: string[] = [];
    while (!ready.isEmpty() && sorted.length < maxNodes) {
      if (sorted.length % 1000 === 0) { checkAborted(signal, 'topologicalSort'); }
      const nodeId = ready.extractMin()!;
      sorted.push(nodeId);

      const neighbors = await getNeighborIds(nodeId);
      for (const neighborId of neighbors) {
        const deg = inDegree.get(neighborId)! - 1;
        inDegree.set(neighborId, deg);
        if (deg === 0) { ready.insert(neighborId, 0); }
      }
    }

    const hasCycle = computeTopoHasCycle({
      sortedLength: sorted.length,
      discoveredSize: discovered.size,
      maxNodes,
      readyRemaining: !ready.isEmpty(),
    });
    if (hasCycle && throwOnCycle) {
      const cycleWitness = await this._findTopoCycleWitness({ discovered, sorted, getNeighborIds });
      throw new TraversalError('Graph contains a cycle', {
        code: 'ERR_GRAPH_HAS_CYCLES',
        context: {
          nodesInCycle: discovered.size - sorted.length,
          cycleWitness: typeof cycleWitness.from === 'string' && cycleWitness.from.length > 0 ? cycleWitness : undefined,
        },
      });
    }

    return {
      sorted,
      hasCycle,
      stats: this._ctx.stats(sorted.length, rs),
      ...(_returnAdjList ? { _neighborEdgeMap: neighborEdgeMap } : {}),
    };
  }

  async commonAncestors(params: {
    nodes: string[];
    options?: NeighborOptions;
    maxDepth?: number;
    maxResults?: number;
    signal?: AbortSignal;
  }): Promise<{ ancestors: string[]; stats: TraversalStats }> {
    const { nodes, options, signal } = params;
    const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;
    const maxResults = params.maxResults ?? 100;

    if (nodes.length === 0) {
      return { ancestors: [], stats: this._ctx.stats(0, this._ctx.newRunStats()) };
    }

    const ancestorCounts = new Map<string, number>();
    const requiredCount = nodes.length;
    const totalStats: TraversalStats = {
      nodesVisited: 0, edgesTraversed: 0, cacheHits: 0, cacheMisses: 0,
    };

    for (const nodeId of nodes) {
      checkAborted(signal, 'commonAncestors');
      const { nodes: ancestors, stats } = await this._bfs(stripUndefined({
        start: nodeId,
        direction: 'in' as const,
        options,
        maxDepth,
        signal,
      }));
      totalStats.nodesVisited += stats.nodesVisited;
      totalStats.edgesTraversed += stats.edgesTraversed;
      totalStats.cacheHits += stats.cacheHits;
      totalStats.cacheMisses += stats.cacheMisses;
      for (const a of ancestors) {
        ancestorCounts.set(a, (ancestorCounts.get(a) ?? 0) + 1);
      }
    }

    const common: string[] = [];
    const entries = [...ancestorCounts.entries()]
      .filter(([, count]) => count === requiredCount)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    for (const [ancestor] of entries) {
      common.push(ancestor);
      if (common.length >= maxResults) { break; }
    }

    return { ancestors: common, stats: totalStats };
  }

  async weightedLongestPath(params: {
    start: string;
    goal: string;
    direction?: Direction;
    options?: NeighborOptions;
    weightFn?: WeightFn;
    nodeWeightFn?: (nodeId: string) => number | Promise<number>;
    maxNodes?: number;
    signal?: AbortSignal;
  }): Promise<{ path: string[]; totalCost: number; stats: TraversalStats }> {
    const { start, goal, direction = 'out', options, signal } = params;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const effectiveWeightFn = this._ctx.resolveWeightFn(params.weightFn, params.nodeWeightFn);
    await this._ctx.validateStart(start);

    const { sorted, _neighborEdgeMap } = await this.topologicalSort(stripUndefined({
      start, direction, options, maxNodes,
      throwOnCycle: true, signal,
      _returnAdjList: true,
    }));

    const rs = this._ctx.newRunStats();
    const dist = new Map<string, number>([[start, 0]]);
    const prev = new Map<string, string>();

    for (const nodeId of sorted) {
      if (!dist.has(nodeId)) { continue; }
      const neighbors = _neighborEdgeMap
        ? (_neighborEdgeMap.get(nodeId) ?? [])
        : await this._ctx.getNeighbors(nodeId, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        const w = await effectiveWeightFn(nodeId, neighborId, label);
        const alt = dist.get(nodeId)! + w;
        const best = dist.get(neighborId) ?? -Infinity;

        if (alt > best || (alt === best && this._ctx.shouldUpdatePredecessor(prev, neighborId, nodeId))) {
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

    const path = this._ctx.reconstructPath(prev, start, goal);
    return { path, totalCost: dist.get(goal)!, stats: this._ctx.stats(sorted.length, rs) };
  }

  // ── Topo-specific private helpers ──────────────────────────────────

  private async _loadTopoNeighborIds(
    nodeId: string,
    direction: Direction,
    rs: RunStats,
    options?: NeighborOptions,
  ): Promise<string[]> {
    const neighbors = await this._ctx.getNeighbors(nodeId, direction, rs, options);
    rs.edgesTraversed += neighbors.length;
    return neighbors.map(({ neighborId }) => neighborId);
  }

  private _createTopoNeighborIdReader(
    adjList: Map<string, string[]> | null,
    direction: Direction,
    rs: RunStats,
    options?: NeighborOptions,
  ): (nodeId: string) => Promise<string[]> {
    if (adjList) {
      return (nodeId: string) => Promise.resolve(adjList.get(nodeId) ?? []);
    }
    return (nodeId: string) => this._loadTopoNeighborIds(nodeId, direction, rs, options);
  }

  async _findTopoCycleWitness(params: {
    discovered: Set<string>;
    sorted: string[];
    getNeighborIds: (nodeId: string) => Promise<string[]>;
  }): Promise<{ from?: string; to?: string }> {
    const inSorted = new Set(params.sorted);
    for (const nodeId of params.discovered) {
      if (inSorted.has(nodeId)) { continue; }
      const neighbors = await params.getNeighborIds(nodeId);
      for (const neighborId of neighbors) {
        if (!inSorted.has(neighborId)) {
          return { from: nodeId, to: neighborId };
        }
      }
    }
    return {};
  }
}
