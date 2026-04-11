/**
 * TraversalContext — shared infrastructure for graph traversal algorithms.
 *
 * Holds the neighbor provider, LRU cache, logger, and exposes the common
 * operations (neighbor lookup, start validation, stats, weight resolution,
 * path reconstruction) that all algorithm modules need.
 *
 * One instance per GraphTraversal; algorithm modules receive it as a
 * constructor parameter.
 *
 * @module domain/services/query/TraversalContext
 */

import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import type { Direction, NeighborEdge, NeighborOptions } from '../../../ports/NeighborProviderPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import nullLogger from '../../utils/nullLogger.ts';
import TraversalError from '../../errors/TraversalError.ts';
import LRUCache from '../../utils/LRUCache.ts';

// ── Types ────────────────────────────────────────────────────────────

export type RunStats = {
  cacheHits: number;
  cacheMisses: number;
  edgesTraversed: number;
};

export type TraversalStats = {
  nodesVisited: number;
  edgesTraversed: number;
  cacheHits: number;
  cacheMisses: number;
};

export type TraversalHooks = {
  onVisit?: (nodeId: string, depth: number) => void;
  onExpand?: (nodeId: string, neighbors: NeighborEdge[]) => void;
};

export type WeightFn = (from: string, to: string, label: string) => number | Promise<number>;

export type BfsFn = (params: {
  start: string;
  direction?: Direction;
  options?: NeighborOptions;
  maxNodes?: number;
  maxDepth?: number;
  signal?: AbortSignal;
  hooks?: TraversalHooks;
}) => Promise<{ nodes: string[]; stats: TraversalStats }>;

export type TopoSortFn = (params: {
  start: string | string[];
  direction?: Direction;
  options?: NeighborOptions;
  maxNodes?: number;
  throwOnCycle?: boolean;
  signal?: AbortSignal;
  _returnAdjList?: boolean;
  _lightweight?: boolean;
}) => Promise<{
  sorted: string[];
  hasCycle: boolean;
  stats: TraversalStats;
  _neighborEdgeMap?: Map<string, NeighborEdge[]>;
}>;

// ── Constants ────────────────────────────────────────────────────────

export const DEFAULT_MAX_NODES = 100000;
export const DEFAULT_MAX_DEPTH = 1000;
export const DEFAULT_WEIGHT_FN: WeightFn = () => 1;

/**
 * Lexicographic nodeId comparator for MinHeap tie-breaking.
 */
export const lexTieBreaker = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

// ── Free functions ───────────────────────────────────────────────────

/**
 * Strips keys whose value is `undefined` from an object so that
 * `exactOptionalPropertyTypes` doesn't complain about explicit `undefined`.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      out[key] = obj[key];
    }
  }
  return out as T;
}

/**
 * Distinguishes true topological cycles from maxNodes truncation.
 */
export function computeTopoHasCycle(params: {
  sortedLength: number;
  discoveredSize: number;
  maxNodes: number;
  readyRemaining: boolean;
}): boolean {
  const stoppedByLimit = params.sortedLength >= params.maxNodes && params.readyRemaining;
  return !stoppedByLimit && params.sortedLength < params.discoveredSize;
}

// ── Class ────────────────────────────────────────────────────────────

export default class TraversalContext {
  readonly provider: NeighborProviderPort;
  readonly logger: LoggerPort;
  private readonly _neighborCache: LRUCache<string, NeighborEdge[]> | null;

  constructor(params: {
    provider: NeighborProviderPort;
    logger?: LoggerPort;
    neighborCacheSize?: number;
  }) {
    this.provider = params.provider;
    this.logger = params.logger ?? nullLogger;
    this._neighborCache = params.provider.latencyClass === 'sync'
      ? null
      : new LRUCache(params.neighborCacheSize ?? 256);
  }

  newRunStats(): RunStats {
    return { cacheHits: 0, cacheMisses: 0, edgesTraversed: 0 };
  }

  stats(nodesVisited: number, rs: RunStats): TraversalStats {
    return {
      nodesVisited,
      edgesTraversed: rs.edgesTraversed,
      cacheHits: rs.cacheHits,
      cacheMisses: rs.cacheMisses,
    };
  }

  async getNeighbors(
    nodeId: string,
    direction: Direction,
    rs: RunStats,
    options?: NeighborOptions,
  ): Promise<NeighborEdge[]> {
    const cache = this._neighborCache;
    if (!cache) {
      return await this.provider.getNeighbors(nodeId, direction, options);
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
    const result = await this.provider.getNeighbors(nodeId, direction, options);
    cache.set(key, result);
    return result;
  }

  async validateStart(nodeId: string): Promise<void> {
    const exists = await this.provider.hasNode(nodeId);
    if (!exists) {
      throw new TraversalError(`Start node '${nodeId}' does not exist in the graph`, {
        code: 'INVALID_START',
        context: { nodeId },
      });
    }
  }

  resolveWeightFn(
    weightFn: WeightFn | undefined,
    nodeWeightFn: ((nodeId: string) => number | Promise<number>) | undefined,
  ): WeightFn {
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

  reconstructPath(predMap: Map<string, string>, start: string, goal: string): string[] {
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

  reconstructBiPath(
    fwdPrev: Map<string, string>,
    bwdNext: Map<string, string>,
    start: string,
    goal: string,
    meeting: string,
  ): string[] {
    const fwdHalf = [meeting];
    let cur = meeting;
    while (cur !== start && fwdPrev.has(cur)) {
      cur = fwdPrev.get(cur)!;
      fwdHalf.push(cur);
    }
    fwdHalf.reverse();

    cur = meeting;
    while (cur !== goal && bwdNext.has(cur)) {
      cur = bwdNext.get(cur)!;
      fwdHalf.push(cur);
    }

    return fwdHalf;
  }

  shouldUpdatePredecessor(
    predMap: Map<string, string>,
    nodeId: string,
    candidatePred: string,
  ): boolean {
    const current = predMap.get(nodeId);
    if (current === undefined) { return true; }
    return candidatePred < current;
  }

  private _buildNodeWeightResolver(
    nodeWeightFn: (nodeId: string) => number | Promise<number>,
  ): WeightFn {
    const cache = new Map<string, number>();
    return (_from: string, to: string, _label: string): number | Promise<number> => {
      const cached = cache.get(to);
      if (cached !== undefined) {
        return cached;
      }
      const result = nodeWeightFn(to);
      if (typeof result === 'number') {
        cache.set(to, result);
        return result;
      }
      return result.then((v) => {
        cache.set(to, v);
        return v;
      });
    };
  }
}
