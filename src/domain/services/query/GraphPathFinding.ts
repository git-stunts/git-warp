/**
 * GraphPathFinding — shortest/weighted/heuristic path algorithms.
 *
 * Contains: shortestPath, isReachable, weightedShortestPath, aStarSearch,
 * bidirectionalAStar. Fully self-contained — no other algorithm module
 * calls into this one.
 *
 * @module domain/services/query/GraphPathFinding
 */

import type { Direction, NeighborOptions } from '../../../ports/NeighborProviderPort.ts';
import TraversalError from '../../errors/TraversalError.ts';
import MinHeap from '../../utils/MinHeap.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import type TraversalContext from './TraversalContext.ts';
import {
  type RunStats,
  type TraversalStats,
  type WeightFn,
  DEFAULT_MAX_NODES,
  DEFAULT_MAX_DEPTH,
  lexTieBreaker,
  stripUndefined,
} from './TraversalContext.ts';

export default class GraphPathFinding {
  private readonly _ctx: TraversalContext;

  constructor(ctx: TraversalContext) {
    this._ctx = ctx;
  }

  async shortestPath(params: {
    start: string;
    goal: string;
    direction?: Direction;
    options?: NeighborOptions;
    maxNodes?: number;
    maxDepth?: number;
    signal?: AbortSignal;
  }): Promise<{ found: boolean; path: string[]; length: number; stats: TraversalStats }> {
    const { start, goal, direction = 'out', options } = params;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;
    const { signal } = params;
    const rs = this._ctx.newRunStats();
    await this._ctx.validateStart(start);
    if (start === goal) {
      return { found: true, path: [start], length: 0, stats: this._ctx.stats(1, rs) };
    }

    const visited = new Set([start]);
    const parent = new Map<string, string>();
    let frontier: Array<{ nodeId: string; depth: number }> = [{ nodeId: start, depth: 0 }];

    while (frontier.length > 0 && visited.size < maxNodes) {
      frontier.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
      const nextFrontier: Array<{ nodeId: string; depth: number }> = [];

      for (const { nodeId, depth } of frontier) {
        if (depth >= maxDepth) { continue; }
        if (visited.size % 1000 === 0) { checkAborted(signal, 'shortestPath'); }

        const neighbors = await this._ctx.getNeighbors(nodeId, direction, rs, options);
        rs.edgesTraversed += neighbors.length;

        for (const { neighborId } of neighbors) {
          if (visited.has(neighborId)) { continue; }
          visited.add(neighborId);
          parent.set(neighborId, nodeId);

          if (neighborId === goal) {
            const path = this._ctx.reconstructPath(parent, start, goal);
            return { found: true, path, length: path.length - 1, stats: this._ctx.stats(visited.size, rs) };
          }
          nextFrontier.push({ nodeId: neighborId, depth: depth + 1 });
        }
      }
      frontier = nextFrontier;
    }

    return { found: false, path: [], length: -1, stats: this._ctx.stats(visited.size, rs) };
  }

  async isReachable(params: {
    start: string;
    goal: string;
    direction?: Direction;
    options?: NeighborOptions;
    maxNodes?: number;
    maxDepth?: number;
    signal?: AbortSignal;
  }): Promise<{ reachable: boolean; stats: TraversalStats }> {
    const { start, goal, direction = 'out', options } = params;
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;
    const { signal } = params;
    const rs = this._ctx.newRunStats();
    if (start === goal) {
      return { reachable: true, stats: this._ctx.stats(1, rs) };
    }

    const visited = new Set([start]);
    let frontier: string[] = [start];
    let depth = 0;

    while (frontier.length > 0 && depth < maxDepth && visited.size < maxNodes) {
      if (visited.size % 1000 === 0) { checkAborted(signal, 'isReachable'); }
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        const neighbors = await this._ctx.getNeighbors(nodeId, direction, rs, options);
        rs.edgesTraversed += neighbors.length;
        for (const { neighborId } of neighbors) {
          if (neighborId === goal) {
            return { reachable: true, stats: this._ctx.stats(visited.size, rs) };
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

    return { reachable: false, stats: this._ctx.stats(visited.size, rs) };
  }

  async weightedShortestPath(params: {
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
    const rs = this._ctx.newRunStats();
    await this._ctx.validateStart(start);

    const dist = new Map<string, number>([[start, 0]]);
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    const pq = new MinHeap<string>({ tieBreaker: lexTieBreaker });
    pq.insert(start, 0);

    while (!pq.isEmpty() && visited.size < maxNodes) {
      checkAborted(signal, 'weightedShortestPath');

      const current = pq.extractMin()!;
      if (visited.has(current)) { continue; }
      visited.add(current);

      if (current === goal) {
        const path = this._ctx.reconstructPath(prev, start, goal);
        return { path, totalCost: dist.get(goal)!, stats: this._ctx.stats(visited.size, rs) };
      }

      const neighbors = await this._ctx.getNeighbors(current, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        if (visited.has(neighborId)) { continue; }
        const w = await effectiveWeightFn(current, neighborId, label);
        const alt = dist.get(current)! + w;
        const best = dist.get(neighborId) ?? Infinity;

        if (alt < best || (alt === best && this._ctx.shouldUpdatePredecessor(prev, neighborId, current))) {
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

  async aStarSearch(params: {
    start: string;
    goal: string;
    direction?: Direction;
    options?: NeighborOptions;
    weightFn?: WeightFn;
    nodeWeightFn?: (nodeId: string) => number | Promise<number>;
    heuristicFn?: (nodeId: string, goalId: string) => number;
    maxNodes?: number;
    signal?: AbortSignal;
  }): Promise<{ path: string[]; totalCost: number; nodesExplored: number; stats: TraversalStats }> {
    const { start, goal, direction = 'out', options, signal } = params;
    const heuristicFn = params.heuristicFn ?? (() => 0);
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const effectiveWeightFn = this._ctx.resolveWeightFn(params.weightFn, params.nodeWeightFn);
    const rs = this._ctx.newRunStats();
    await this._ctx.validateStart(start);

    const gScore = new Map<string, number>([[start, 0]]);
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    const pq = new MinHeap<string>({ tieBreaker: lexTieBreaker });
    pq.insert(start, heuristicFn(start, goal));

    while (!pq.isEmpty() && visited.size < maxNodes) {
      checkAborted(signal, 'aStarSearch');

      const current = pq.extractMin()!;
      if (visited.has(current)) { continue; }
      visited.add(current);

      if (current === goal) {
        const path = this._ctx.reconstructPath(prev, start, goal);
        return {
          path,
          totalCost: gScore.get(goal)!,
          nodesExplored: visited.size,
          stats: this._ctx.stats(visited.size, rs),
        };
      }

      const neighbors = await this._ctx.getNeighbors(current, direction, rs, options);
      rs.edgesTraversed += neighbors.length;

      for (const { neighborId, label } of neighbors) {
        if (visited.has(neighborId)) { continue; }
        const w = await effectiveWeightFn(current, neighborId, label);
        const tentG = gScore.get(current)! + w;
        const bestG = gScore.get(neighborId) ?? Infinity;

        if (tentG < bestG || (tentG === bestG && this._ctx.shouldUpdatePredecessor(prev, neighborId, current))) {
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

  async bidirectionalAStar(params: {
    start: string;
    goal: string;
    options?: NeighborOptions;
    weightFn?: WeightFn;
    nodeWeightFn?: (nodeId: string) => number | Promise<number>;
    forwardHeuristic?: (nodeId: string, goalId: string) => number;
    backwardHeuristic?: (nodeId: string, goalId: string) => number;
    maxNodes?: number;
    signal?: AbortSignal;
  }): Promise<{ path: string[]; totalCost: number; nodesExplored: number; stats: TraversalStats }> {
    const { start, goal, options, signal } = params;
    const forwardHeuristic = params.forwardHeuristic ?? (() => 0);
    const backwardHeuristic = params.backwardHeuristic ?? (() => 0);
    const maxNodes = params.maxNodes ?? DEFAULT_MAX_NODES;
    const effectiveWeightFn = this._ctx.resolveWeightFn(params.weightFn, params.nodeWeightFn);
    const rs = this._ctx.newRunStats();
    await this._ctx.validateStart(start);
    if (start === goal) {
      return { path: [start], totalCost: 0, nodesExplored: 1, stats: this._ctx.stats(1, rs) };
    }

    const fwdG = new Map<string, number>([[start, 0]]);
    const fwdPrev = new Map<string, string>();
    const fwdVisited = new Set<string>();
    const fwdHeap = new MinHeap<string>({ tieBreaker: lexTieBreaker });
    fwdHeap.insert(start, forwardHeuristic(start, goal));

    const bwdG = new Map<string, number>([[goal, 0]]);
    const bwdNext = new Map<string, string>();
    const bwdVisited = new Set<string>();
    const bwdHeap = new MinHeap<string>({ tieBreaker: lexTieBreaker });
    bwdHeap.insert(goal, backwardHeuristic(goal, start));

    let mu = Infinity;
    let meeting: string | null = null;
    let explored = 0;

    while ((!fwdHeap.isEmpty() || !bwdHeap.isEmpty()) && explored < maxNodes) {
      checkAborted(signal, 'bidirectionalAStar');
      const fwdF = fwdHeap.peekPriority();
      const bwdF = bwdHeap.peekPriority();
      if (Math.min(fwdF, bwdF) >= mu) { break; }

      if (fwdF <= bwdF) {
        const r = await this._biAStarExpand(stripUndefined({
          heap: fwdHeap, visited: fwdVisited, gScore: fwdG, predMap: fwdPrev,
          otherVisited: bwdVisited, otherG: bwdG,
          weightFn: effectiveWeightFn, heuristicFn: forwardHeuristic,
          target: goal, directionForNeighbors: 'out' as const, options,
          mu, meeting, rs,
        }));
        explored += r.explored;
        mu = r.mu;
        meeting = r.meeting;
      } else {
        const r = await this._biAStarExpand(stripUndefined({
          heap: bwdHeap, visited: bwdVisited, gScore: bwdG, predMap: bwdNext,
          otherVisited: fwdVisited, otherG: fwdG,
          weightFn: effectiveWeightFn, heuristicFn: backwardHeuristic,
          target: start, directionForNeighbors: 'in' as const, options,
          mu, meeting, rs,
        }));
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

    const path = this._ctx.reconstructBiPath(fwdPrev, bwdNext, start, goal, meeting);
    return { path, totalCost: mu, nodesExplored: explored, stats: this._ctx.stats(explored, rs) };
  }

  async _biAStarExpand(p: {
    heap: MinHeap<string>;
    visited: Set<string>;
    gScore: Map<string, number>;
    predMap: Map<string, string>;
    otherVisited: Set<string>;
    otherG: Map<string, number>;
    weightFn: WeightFn;
    heuristicFn: (nodeId: string, goalId: string) => number;
    target: string;
    directionForNeighbors: Direction;
    options?: NeighborOptions;
    mu: number;
    meeting: string | null;
    rs: RunStats;
  }): Promise<{ explored: number; mu: number; meeting: string | null }> {
    const current = p.heap.extractMin()!;
    if (p.visited.has(current)) {
      return { explored: 0, mu: p.mu, meeting: p.meeting };
    }
    p.visited.add(current);

    let resultMu = p.mu;
    let resultMeeting = p.meeting;

    if (p.otherVisited.has(current)) {
      const cost = p.gScore.get(current)! + p.otherG.get(current)!;
      if (cost < resultMu || (cost === resultMu && (resultMeeting === null || current < resultMeeting))) {
        resultMu = cost;
        resultMeeting = current;
      }
    }

    const neighbors = await this._ctx.getNeighbors(current, p.directionForNeighbors, p.rs, p.options);
    p.rs.edgesTraversed += neighbors.length;

    for (const { neighborId, label } of neighbors) {
      if (p.visited.has(neighborId)) { continue; }
      const w = p.directionForNeighbors === 'in'
        ? await p.weightFn(neighborId, current, label)
        : await p.weightFn(current, neighborId, label);
      const tentG = p.gScore.get(current)! + w;
      const bestG = p.gScore.get(neighborId) ?? Infinity;

      if (tentG < bestG || (tentG === bestG && this._ctx.shouldUpdatePredecessor(p.predMap, neighborId, current))) {
        p.gScore.set(neighborId, tentG);
        p.predMap.set(neighborId, current);
        p.heap.insert(neighborId, tentG + p.heuristicFn(neighborId, p.target));

        if (p.otherG.has(neighborId)) {
          const total = tentG + p.otherG.get(neighborId)!;
          if (total < resultMu || (total === resultMu && (resultMeeting === null || neighborId < resultMeeting))) {
            resultMu = total;
            resultMeeting = neighborId;
          }
        }
      }
    }

    return { explored: 1, mu: resultMu, meeting: resultMeeting };
  }
}
