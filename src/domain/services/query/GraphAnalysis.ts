/**
 * GraphAnalysis — graph analysis algorithms.
 *
 * Contains: levels, rootAncestors, transitiveReduction, transitiveClosure,
 * transitiveClosureStream. Receives BfsFn and TopoSortFn callbacks from
 * the facade to avoid circular imports.
 *
 * @module domain/services/query/GraphAnalysis
 */

import type { Direction, NeighborEdge, NeighborOptions } from '../../../ports/NeighborProviderPort.ts';
import TraversalError from '../../errors/TraversalError.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import TraversalContext, {
  type BfsFn,
  type TopoSortFn,
  type RunStats,
  type TraversalStats,
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_DEPTH,
} from './TraversalContext.ts';

export default class GraphAnalysis {
  private readonly _ctx: TraversalContext;
  private readonly _bfs: BfsFn;
  private readonly _topologicalSort: TopoSortFn;

  constructor(ctx: TraversalContext, bfs: BfsFn, topologicalSort: TopoSortFn) {
    this._ctx = ctx;
    this._bfs = bfs;
    this._topologicalSort = topologicalSort;
  }

  async levels(params: {
    start: string | string[];
    direction?: Direction;
    options?: NeighborOptions;
    maxNodes?: number;
    signal?: AbortSignal;
  }): Promise<{ levels: Map<string, number>; maxLevel: number; stats: TraversalStats }> {
    const { start, direction = 'out', options, signal } = params;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;

    const { sorted } = await this._topologicalSort({
      start, direction, maxNodes, throwOnCycle: true,
      ...(options !== undefined && { options }),
      ...(signal !== undefined && { signal }),
    });

    const rs = this._ctx.newRunStats();
    const levelMap = new Map<string, number>();
    for (const nodeId of sorted) {
      if (!levelMap.has(nodeId)) { levelMap.set(nodeId, 0); }
    }

    let maxLevel = 0;
    for (const nodeId of sorted) {
      checkAborted(signal, 'levels');
      const currentLevel = levelMap.get(nodeId)!;
      const neighbors = await this._ctx.getNeighbors(nodeId, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId } of neighbors) {
        const neighborLevel = levelMap.get(neighborId) ?? 0;
        const candidate = currentLevel + 1;
        if (candidate > neighborLevel) {
          levelMap.set(neighborId, candidate);
          if (candidate > maxLevel) { maxLevel = candidate; }
        }
      }
    }

    return { levels: levelMap, maxLevel, stats: this._ctx.stats(sorted.length, rs) };
  }

  async rootAncestors(params: {
    start: string;
    options?: NeighborOptions;
    maxNodes?: number;
    maxDepth?: number;
    signal?: AbortSignal;
  }): Promise<{ roots: string[]; stats: TraversalStats }> {
    const { start, options, signal } = params;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;

    const { nodes: visited, stats: bfsStats } = await this._bfs({
      start, direction: 'in' as const, maxNodes, maxDepth,
      ...(options !== undefined && { options }),
      ...(signal !== undefined && { signal }),
    });

    const rs = this._ctx.newRunStats();
    const roots: string[] = [];
    for (const nodeId of visited) {
      checkAborted(signal, 'rootAncestors');
      const inNeighbors = await this._ctx.getNeighbors(nodeId, 'in', rs, options);
      rs.edgesTraversed += inNeighbors.length;
      if (inNeighbors.length === 0) { roots.push(nodeId); }
    }

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

  async transitiveReduction(params: {
    start: string | string[];
    direction?: Direction;
    options?: NeighborOptions;
    maxNodes?: number;
    signal?: AbortSignal;
  }): Promise<{ edges: Array<{ from: string; to: string; label: string }>; removed: number; stats: TraversalStats }> {
    const { start, direction = 'out', options, signal } = params;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;

    const { sorted } = await this._topologicalSort({
      start, direction, maxNodes, throwOnCycle: true,
      ...(options !== undefined && { options }),
      ...(signal !== undefined && { signal }),
    });

    const rs = this._ctx.newRunStats();
    const fetchedSuccessors = new Map<string, NeighborEdge[]>();

    const getSuccessorEdges = async (nodeId: string): Promise<NeighborEdge[]> => {
      const cached = fetchedSuccessors.get(nodeId);
      if (cached !== undefined) { return cached; }
      const neighbors = await this._ctx.getNeighbors(nodeId, direction, rs, options);
      rs.edgesTraversed += neighbors.length;
      fetchedSuccessors.set(nodeId, neighbors);
      return neighbors;
    };

    const redundant = new Set<string>();

    for (const u of sorted) {
      checkAborted(signal, 'transitiveReduction');
      const directEdges = await getSuccessorEdges(u);
      if (directEdges.length <= 1) { continue; }

      const directSet = new Set<string>();
      const visited = new Set<string>();
      let frontier: string[] = [];

      for (const { neighborId: successorId } of directEdges) {
        directSet.add(successorId);
        const successorEdges = await getSuccessorEdges(successorId);
        for (const { neighborId: gc } of successorEdges) {
          if (!visited.has(gc)) {
            visited.add(gc);
            frontier.push(gc);
          }
        }
      }

      while (frontier.length > 0) {
        const nextFrontier: string[] = [];
        for (const nodeId of frontier) {
          if (directSet.has(nodeId)) { redundant.add(`${u}\0${nodeId}`); }
          const successors = await getSuccessorEdges(nodeId);
          for (const { neighborId: successorId } of successors) {
            if (!visited.has(successorId)) {
              visited.add(successorId);
              nextFrontier.push(successorId);
            }
          }
        }
        frontier = nextFrontier;
      }
    }

    const edges: Array<{ from: string; to: string; label: string }> = [];
    let removed = 0;

    for (const nodeId of sorted) {
      const neighbors = await getSuccessorEdges(nodeId);
      for (const { neighborId, label } of neighbors) {
        if (redundant.has(`${nodeId}\0${neighborId}`)) {
          removed++;
        } else {
          edges.push({ from: nodeId, to: neighborId, label });
        }
      }
    }

    edges.sort((a, b) => {
      if (a.from < b.from) { return -1; }
      if (a.from > b.from) { return 1; }
      if (a.to < b.to) { return -1; }
      if (a.to > b.to) { return 1; }
      if (a.label < b.label) { return -1; }
      if (a.label > b.label) { return 1; }
      return 0;
    });

    return { edges, removed, stats: this._ctx.stats(sorted.length, rs) };
  }

  async *transitiveClosureStream(params: {
    start: string | string[];
    direction?: Direction;
    options?: NeighborOptions;
    maxNodes?: number;
    maxEdges?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<{ from: string; to: string }> {
    const { start, direction = 'out', options, signal } = params;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const maxEdges = params.maxEdges ?? 1000000;

    const rs = this._ctx.newRunStats();
    const prepared = await this._prepareTransitiveClosure({
      start, direction, maxNodes, rs, opName: 'transitiveClosureStream',
      ...(options !== undefined && { options }),
      ...(signal !== undefined && { signal }),
    });

    yield* this._streamTransitiveClosureEdges({
      nodeList: prepared.nodeList, direction, maxEdges, rs, opName: 'transitiveClosureStream',
      ...(options !== undefined && { options }),
      ...(signal !== undefined && { signal }),
    });
  }

  async transitiveClosure(params: {
    start: string | string[];
    direction?: Direction;
    options?: NeighborOptions;
    maxNodes?: number;
    maxEdges?: number;
    signal?: AbortSignal;
  }): Promise<{ edges: Array<{ from: string; to: string }>; stats: TraversalStats }> {
    const { start, direction = 'out', options, signal } = params;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const maxEdges = params.maxEdges ?? 1000000;

    const rs = this._ctx.newRunStats();
    const { nodeList, nodesVisited } = await this._prepareTransitiveClosure({
      start, direction, maxNodes, rs, opName: 'transitiveClosure',
      ...(options !== undefined && { options }),
      ...(signal !== undefined && { signal }),
    });

    const edges: Array<{ from: string; to: string }> = [];
    for await (const edge of this._streamTransitiveClosureEdges({
      nodeList, direction, maxEdges, rs, opName: 'transitiveClosure',
      ...(options !== undefined && { options }),
      ...(signal !== undefined && { signal }),
    })) {
      edges.push(edge);
    }

    return { edges, stats: this._ctx.stats(nodesVisited, rs) };
  }

  // ── Private helpers ────────────────────────────────────────────────

  async _prepareTransitiveClosure(params: {
    start: string | string[];
    direction: Direction;
    options?: NeighborOptions;
    maxNodes: number;
    signal?: AbortSignal;
    rs: RunStats;
    opName: string;
  }): Promise<{ nodeList: string[]; nodesVisited: number }> {
    const starts = [...new Set(Array.isArray(params.start) ? params.start : [params.start])];
    for (const s of starts) {
      await this._ctx.validateStart(s);
    }

    const allVisited = new Set<string>();
    const queue: string[] = [...starts];
    let qHead = 0;
    for (const s of starts) { allVisited.add(s); }

    while (qHead < queue.length) {
      if (allVisited.size % 1000 === 0) { checkAborted(params.signal, params.opName); }
      if (allVisited.size >= params.maxNodes) { break; }
      const nodeId = queue[qHead++]!;
      const neighbors = await this._ctx.getNeighbors(nodeId, params.direction, params.rs, params.options);
      params.rs.edgesTraversed += neighbors.length;
      for (const { neighborId } of neighbors) {
        if (!allVisited.has(neighborId)) {
          allVisited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    return { nodeList: [...allVisited].sort(), nodesVisited: allVisited.size };
  }

  private async *_streamTransitiveClosureEdges(params: {
    nodeList: string[];
    direction: Direction;
    options?: NeighborOptions;
    maxEdges: number;
    signal?: AbortSignal;
    rs: RunStats;
    opName: string;
  }): AsyncGenerator<{ from: string; to: string }> {
    let edgeCount = 0;

    for (const fromNode of params.nodeList) {
      checkAborted(params.signal, params.opName);

      const visited = new Set([fromNode]);
      let frontier: string[] = [fromNode];
      const reachable: string[] = [];

      while (frontier.length > 0) {
        const nextFrontier: string[] = [];
        for (const nodeId of frontier) {
          const neighbors = await this._ctx.getNeighbors(nodeId, params.direction, params.rs, params.options);
          params.rs.edgesTraversed += neighbors.length;
          for (const { neighborId } of neighbors) {
            if (!visited.has(neighborId)) {
              visited.add(neighborId);
              nextFrontier.push(neighborId);
              reachable.push(neighborId);
              edgeCount++;
              if (edgeCount > params.maxEdges) {
                throw new TraversalError(
                  `Transitive closure exceeds maxEdges limit (${params.maxEdges})`,
                  { code: 'E_MAX_EDGES_EXCEEDED', context: { maxEdges: params.maxEdges, edgesSoFar: edgeCount } },
                );
              }
            }
          }
        }
        frontier = nextFrontier;
      }

      reachable.sort();
      for (const toNode of reachable) {
        yield { from: fromNode, to: toNode };
      }
    }
  }
}
