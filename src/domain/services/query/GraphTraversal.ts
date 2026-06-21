/**
 * GraphTraversal — unified traversal engine facade.
 *
 * Preserves the exact public API of the original god object while
 * delegating to focused algorithm modules:
 *
 *   - TraversalContext   — shared infra (cache, stats, validation)
 *   - GraphPathFinding   — shortest path, Dijkstra, A*, bidirectional A*
 *   - GraphTopology      — topo sort, connected component, common ancestors
 *   - GraphAnalysis      — levels, roots, reduction, closure
 *
 * BFS and DFS live here because they are small and injected as callbacks
 * into topology and analysis modules.
 *
 * ## Determinism Invariants
 *
 * 1. **BFS**: Nodes at equal depth visited in lexicographic nodeId order.
 * 2. **DFS**: Nodes visited in lexicographic nodeId order (leftmost first).
 * 3. **PQ/Dijkstra/A***: Equal-priority tie-break by lexicographic nodeId.
 * 4. **Kahn (topoSort)**: Zero-indegree nodes dequeued in lex order.
 * 5. **Neighbor lists**: Sorted by (neighborId, label), strict codepoint.
 * 6. **Direction 'both'**: union(out, in) deduped by (neighborId, label).
 * 7. **weightFn/heuristicFn purity**: Must be deterministic.
 * 8. **Never** rely on JS Map/Set iteration order.
 *
 * @module domain/services/query/GraphTraversal
 */

import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import type { Direction, NeighborOptions } from '../../../ports/NeighborProviderPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import TraversalContext, {
  type RunStats,
  type TraversalStats,
  type TraversalHooks,
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_DEPTH,
} from './TraversalContext.ts';
import GraphPathFinding from './GraphPathFinding.ts';
import GraphTopology from './GraphTopology.ts';
import GraphAnalysis from './GraphAnalysis.ts';

export type GraphTraversalStreamParams = {
  readonly start: string;
  readonly direction?: Direction | undefined;
  readonly options?: NeighborOptions | undefined;
  readonly maxNodes?: number | undefined;
  readonly maxDepth?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly hooks?: TraversalHooks | undefined;
};

type PrimitiveTraversalRun = {
  readonly start: string;
  readonly direction: Direction;
  readonly options: NeighborOptions | undefined;
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly signal: AbortSignal | undefined;
  readonly hooks: TraversalHooks | undefined;
  readonly rs: RunStats;
  readonly visited: Set<string>;
};

function createPrimitiveRun(
  params: GraphTraversalStreamParams,
  rs: RunStats,
  visited: Set<string>,
): PrimitiveTraversalRun {
  return {
    start: params.start,
    direction: params.direction ?? 'out',
    options: params.options,
    maxNodes: params.maxNodes ?? DEFAULT_MAX_NODES,
    maxDepth: params.maxDepth ?? DEFAULT_MAX_DEPTH,
    signal: params.signal,
    hooks: params.hooks,
    rs,
    visited,
  };
}

async function collectTraversal(stream: AsyncIterable<string>): Promise<string[]> {
  const nodes: string[] = [];
  for await (const node of stream) {
    nodes.push(node);
  }
  return nodes;
}

export default class GraphTraversal {
  private readonly _ctx: TraversalContext;
  private readonly _pathFinding: GraphPathFinding;
  private readonly _topology: GraphTopology;
  private readonly _analysis: GraphAnalysis;

  constructor(params: {
    provider: NeighborProviderPort;
    logger?: LoggerPort;
    neighborCacheSize?: number;
  }) {
    this._ctx = new TraversalContext(params);
    this._pathFinding = new GraphPathFinding(this._ctx);
    const bfs = this.bfs.bind(this);
    this._topology = new GraphTopology(this._ctx, bfs);
    const topoSort = this._topology.topologicalSort.bind(this._topology);
    this._analysis = new GraphAnalysis(this._ctx, bfs, topoSort);
  }

  // ── Primitive traversals (kept in facade) ──────────────────────────

  async bfs(params: GraphTraversalStreamParams): Promise<{ nodes: string[]; stats: TraversalStats }> {
    const rs = this._ctx.newRunStats();
    const visited = new Set<string>();
    const run = createPrimitiveRun(params, rs, visited);
    const nodes = await collectTraversal(this._bfsStream(run));
    return { nodes, stats: this._ctx.stats(visited.size, rs) };
  }

  async *bfsStream(params: GraphTraversalStreamParams): AsyncGenerator<string> {
    const rs = this._ctx.newRunStats();
    const visited = new Set<string>();
    yield* this._bfsStream(createPrimitiveRun(params, rs, visited));
  }

  private async *_bfsStream(run: PrimitiveTraversalRun): AsyncGenerator<string> {
    await this._ctx.validateStart(run.start);
    let currentLevel: Array<{ nodeId: string; depth: number }> = [{ nodeId: run.start, depth: 0 }];

    while (currentLevel.length > 0 && run.visited.size < run.maxNodes) {
      currentLevel.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      const nextLevel: Array<{ nodeId: string; depth: number }> = [];
      const queued = new Set<string>();

      for (const { nodeId, depth } of currentLevel) {
        if (run.visited.size >= run.maxNodes) { break; }
        if (run.visited.has(nodeId)) { continue; }
        if (depth > run.maxDepth) { continue; }
        if (run.visited.size % 1000 === 0) { checkAborted(run.signal, 'bfs'); }

        run.visited.add(nodeId);
        if (run.hooks?.onVisit) { run.hooks.onVisit(nodeId, depth); }
        yield nodeId;

        if (depth < run.maxDepth) {
          const neighbors = await this._ctx.getNeighbors(nodeId, run.direction, run.rs, run.options);
          run.rs.edgesTraversed += neighbors.length;
          if (run.hooks?.onExpand) { run.hooks.onExpand(nodeId, neighbors); }
          for (const { neighborId } of neighbors) {
            if (!run.visited.has(neighborId) && !queued.has(neighborId)) {
              queued.add(neighborId);
              nextLevel.push({ nodeId: neighborId, depth: depth + 1 });
            }
          }
        }
      }
      currentLevel = nextLevel;
    }
  }

  async dfs(params: GraphTraversalStreamParams): Promise<{ nodes: string[]; stats: TraversalStats }> {
    const rs = this._ctx.newRunStats();
    const visited = new Set<string>();
    const run = createPrimitiveRun(params, rs, visited);
    const nodes = await collectTraversal(this._dfsStream(run));
    return { nodes, stats: this._ctx.stats(visited.size, rs) };
  }

  async *dfsStream(params: GraphTraversalStreamParams): AsyncGenerator<string> {
    const rs = this._ctx.newRunStats();
    const visited = new Set<string>();
    yield* this._dfsStream(createPrimitiveRun(params, rs, visited));
  }

  private async *_dfsStream(run: PrimitiveTraversalRun): AsyncGenerator<string> {
    await this._ctx.validateStart(run.start);
    const stack: Array<{ nodeId: string; depth: number }> = [{ nodeId: run.start, depth: 0 }];

    while (stack.length > 0 && run.visited.size < run.maxNodes) {
      const entry = stack.pop();
      if (entry === undefined) { continue; }
      if (run.visited.has(entry.nodeId)) { continue; }
      if (entry.depth > run.maxDepth) { continue; }
      if (run.visited.size % 1000 === 0) { checkAborted(run.signal, 'dfs'); }

      run.visited.add(entry.nodeId);
      if (run.hooks?.onVisit) { run.hooks.onVisit(entry.nodeId, entry.depth); }
      yield entry.nodeId;

      if (entry.depth < run.maxDepth) {
        const neighbors = await this._ctx.getNeighbors(entry.nodeId, run.direction, run.rs, run.options);
        run.rs.edgesTraversed += neighbors.length;
        if (run.hooks?.onExpand) { run.hooks.onExpand(entry.nodeId, neighbors); }
        for (let i = neighbors.length - 1; i >= 0; i -= 1) {
          const nb = neighbors[i];
          if (nb !== undefined && !run.visited.has(nb.neighborId)) {
            stack.push({ nodeId: nb.neighborId, depth: entry.depth + 1 });
          }
        }
      }
    }
  }

  // ── Delegates to GraphPathFinding ──────────────────────────────────

  async shortestPath(params: Parameters<GraphPathFinding['shortestPath']>[0]) {
    return await this._pathFinding.shortestPath(params);
  }

  async isReachable(params: Parameters<GraphPathFinding['isReachable']>[0]) {
    return await this._pathFinding.isReachable(params);
  }

  async weightedShortestPath(params: Parameters<GraphPathFinding['weightedShortestPath']>[0]) {
    return await this._pathFinding.weightedShortestPath(params);
  }

  async aStarSearch(params: Parameters<GraphPathFinding['aStarSearch']>[0]) {
    return await this._pathFinding.aStarSearch(params);
  }

  async bidirectionalAStar(params: Parameters<GraphPathFinding['bidirectionalAStar']>[0]) {
    return await this._pathFinding.bidirectionalAStar(params);
  }

  // ── Delegates to GraphTopology ─────────────────────────────────────

  async connectedComponent(params: Parameters<GraphTopology['connectedComponent']>[0]) {
    return await this._topology.connectedComponent(params);
  }

  async topologicalSort(params: Parameters<GraphTopology['topologicalSort']>[0]) {
    return await this._topology.topologicalSort(params);
  }

  async commonAncestors(params: Parameters<GraphTopology['commonAncestors']>[0]) {
    return await this._topology.commonAncestors(params);
  }

  async weightedLongestPath(params: Parameters<GraphTopology['weightedLongestPath']>[0]) {
    return await this._topology.weightedLongestPath(params);
  }

  // ── Delegates to GraphAnalysis ─────────────────────────────────────

  async levels(params: Parameters<GraphAnalysis['levels']>[0]) {
    return await this._analysis.levels(params);
  }

  async rootAncestors(params: Parameters<GraphAnalysis['rootAncestors']>[0]) {
    return await this._analysis.rootAncestors(params);
  }

  async transitiveReduction(params: Parameters<GraphAnalysis['transitiveReduction']>[0]) {
    return await this._analysis.transitiveReduction(params);
  }

  async transitiveClosure(params: Parameters<GraphAnalysis['transitiveClosure']>[0]) {
    return await this._analysis.transitiveClosure(params);
  }

  async *transitiveClosureStream(params: Parameters<GraphAnalysis['transitiveClosureStream']>[0]) {
    yield* this._analysis.transitiveClosureStream(params);
  }

  // ── Test-visible internals (delegates to context/modules) ──────────
  // These were "private by convention" on the old god object.
  // Tests access them directly; we delegate to the real owners.

  _newRunStats() {
    return this._ctx.newRunStats();
  }

  _reconstructPath(predMap: Map<string, string>, start: string, goal: string) {
    return this._ctx.reconstructPath(predMap, start, goal);
  }

  _shouldUpdatePredecessor(predMap: Map<string, string>, nodeId: string, candidatePred: string) {
    return this._ctx.shouldUpdatePredecessor(predMap, nodeId, candidatePred);
  }

  async _findTopoCycleWitness(params: {
    discovered: Set<string>;
    sorted: string[];
    getNeighborIds: (nodeId: string) => Promise<string[]>;
  }) {
    return await this._topology._findTopoCycleWitness(params);
  }

  async _biAStarExpand(params: Parameters<GraphPathFinding['_biAStarExpand']>[0]) {
    return await this._pathFinding._biAStarExpand(params);
  }

  async _prepareTransitiveClosure(params: Parameters<GraphAnalysis['_prepareTransitiveClosure']>[0]) {
    return await this._analysis._prepareTransitiveClosure(params);
  }
}
