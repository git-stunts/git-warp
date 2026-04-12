/**
 * DAG path-finding algorithms: BFS, bidirectional BFS, Dijkstra,
 * A*, and bidirectional A*.
 *
 * All algorithms operate on the commit DAG via an injected index
 * reader that provides O(1) parent/child lookups.
 *
 * @module domain/services/dag/DagPathFinding
 */

import nullLogger from '../../utils/nullLogger.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import TraversalError from '../../errors/TraversalError.ts';
import MinHeap from '../../utils/MinHeap.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import type { DagIndexReader } from './DagTraversal.ts';
import {
  walkPredecessors,
  reconstructBidirectionalBfs,
  reconstructBidirectionalAStar,
} from './pathReconstruction.ts';

// -- Constants ----------------------------------------------------------------

const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;
const EPSILON = 1e-10;

// -- Types --------------------------------------------------------------------

type PathResult = { found: true; path: string[]; length: number }
  | { found: false; path: string[]; length: -1 };

type WeightedResult = { path: string[]; totalCost: number };

type AStarResult = { path: string[]; totalCost: number; nodesExplored: number };

type WeightProvider = (from: string, to: string) => number | Promise<number>;
type HeuristicProvider = (sha: string, target: string) => number;

// -- Service ------------------------------------------------------------------

export default class DagPathFinding {
  private readonly _index: DagIndexReader;
  private readonly _log: LoggerPort;

  constructor(deps: { indexReader: DagIndexReader; logger?: LoggerPort }) {
    if (!deps.indexReader) {
      throw new TraversalError('DagPathFinding requires an indexReader', { code: 'E_DAG_PATHFINDING_NO_INDEX' });
    }
    this._index = deps.indexReader;
    this._log = deps.logger ?? nullLogger;
  }

  // -- BFS path finding -------------------------------------------------------

  async findPath(opts: {
    from: string; to: string;
    maxNodes?: number | undefined; maxDepth?: number | undefined; signal?: AbortSignal | undefined;
  }): Promise<PathResult> {
    if (opts.from === opts.to) {
      return { found: true, path: [opts.from], length: 0 };
    }
    const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;

    const visited = new Set<string>();
    const parentMap = new Map<string, string>();
    const queue: { sha: string; depth: number }[] = [{ sha: opts.from, depth: 0 }];

    while (queue.length > 0 && visited.size < maxNodes) {
      if (visited.size % 1000 === 0) { checkAborted(opts.signal, 'findPath'); }
      const cur = queue.shift()!;
      if (cur.depth > maxDepth || visited.has(cur.sha)) { continue; }
      visited.add(cur.sha);

      if (cur.sha === opts.to) {
        const path = walkPredecessors(parentMap, opts.from, opts.to, this._log, 'Path');
        return { found: true, path, length: path.length - 1 };
      }

      for (const child of await this._index.getChildren(cur.sha)) {
        if (!visited.has(child)) {
          parentMap.set(child, cur.sha);
          queue.push({ sha: child, depth: cur.depth + 1 });
        }
      }
    }
    return { found: false, path: [], length: -1 };
  }

  // -- Bidirectional BFS shortest path ----------------------------------------

  async shortestPath(opts: {
    from: string; to: string;
    maxDepth?: number; signal?: AbortSignal;
  }): Promise<PathResult> {
    if (opts.from === opts.to) {
      return { found: true, path: [opts.from], length: 0 };
    }
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;

    const fwdVisited = new Set([opts.from]);
    const fwdParent = new Map<string, string>();
    let fwdFrontier = [opts.from];

    const bwdVisited = new Set([opts.to]);
    const bwdParent = new Map<string, string>();
    let bwdFrontier = [opts.to];

    for (let depth = 0; depth < maxDepth; depth++) {
      checkAborted(opts.signal, 'shortestPath');
      if (fwdFrontier.length === 0 && bwdFrontier.length === 0) { break; }

      if (fwdFrontier.length > 0) {
        const next: string[] = [];
        for (const sha of fwdFrontier) {
          for (const child of await this._index.getChildren(sha)) {
            if (bwdVisited.has(child)) {
              fwdParent.set(child, sha);
              const path = reconstructBidirectionalBfs(fwdParent, bwdParent, opts.from, opts.to, child);
              return { found: true, path, length: path.length - 1 };
            }
            if (!fwdVisited.has(child)) {
              fwdVisited.add(child);
              fwdParent.set(child, sha);
              next.push(child);
            }
          }
        }
        fwdFrontier = next;
      }

      if (bwdFrontier.length > 0) {
        const next: string[] = [];
        for (const sha of bwdFrontier) {
          for (const parent of await this._index.getParents(sha)) {
            if (fwdVisited.has(parent)) {
              bwdParent.set(parent, sha);
              const path = reconstructBidirectionalBfs(fwdParent, bwdParent, opts.from, opts.to, parent);
              return { found: true, path, length: path.length - 1 };
            }
            if (!bwdVisited.has(parent)) {
              bwdVisited.add(parent);
              bwdParent.set(parent, sha);
              next.push(parent);
            }
          }
        }
        bwdFrontier = next;
      }
    }
    return { found: false, path: [], length: -1 };
  }

  // -- Dijkstra ---------------------------------------------------------------

  async weightedShortestPath(opts: {
    from: string; to: string;
    weightProvider?: WeightProvider; direction?: string; signal?: AbortSignal;
  }): Promise<WeightedResult> {
    const weight = opts.weightProvider ?? (() => 1);
    const dir = opts.direction ?? 'children';
    this._log.debug('weightedShortestPath started', { from: opts.from, to: opts.to, direction: dir });

    const dist = new Map<string, number>([[opts.from, 0]]);
    const prev = new Map<string, string>();
    const pq = new MinHeap<string>();
    pq.insert(opts.from, 0);
    const visited = new Set<string>();

    while (!pq.isEmpty()) {
      if (visited.size % 1000 === 0) { checkAborted(opts.signal, 'weightedShortestPath'); }
      const cur = pq.extractMin();
      if (!cur || visited.has(cur)) { continue; }
      visited.add(cur);

      if (cur === opts.to) {
        const path = walkPredecessors(prev, opts.from, opts.to, this._log, 'Weighted path');
        const totalCost = dist.get(opts.to) ?? 0;
        this._log.debug('weightedShortestPath found', { pathLength: path.length, totalCost });
        return { path, totalCost };
      }

      const neighbors = dir === 'children'
        ? await this._index.getChildren(cur)
        : await this._index.getParents(cur);

      for (const n of neighbors) {
        if (visited.has(n)) { continue; }
        const w = await weight(cur, n);
        const newDist = (dist.get(cur) ?? 0) + w;
        if (newDist < (dist.get(n) ?? Infinity)) {
          dist.set(n, newDist);
          prev.set(n, cur);
          pq.insert(n, newDist);
        }
      }
    }

    this._log.debug('weightedShortestPath not found', { from: opts.from, to: opts.to });
    throw new TraversalError(`No path exists from ${opts.from} to ${opts.to}`, {
      code: 'NO_PATH', context: { from: opts.from, to: opts.to, direction: dir },
    });
  }

  // -- A* ---------------------------------------------------------------------

  async aStarSearch(opts: {
    from: string; to: string;
    weightProvider?: WeightProvider;
    heuristicProvider?: HeuristicProvider;
    direction?: string; signal?: AbortSignal;
  }): Promise<AStarResult> {
    const weight = opts.weightProvider ?? (() => 1);
    const h = opts.heuristicProvider ?? (() => 0);
    const dir = opts.direction ?? 'children';
    const gScore = new Map<string, number>([[opts.from, 0]]);
    const prev = new Map<string, string>();
    const pq = new MinHeap<string>();
    pq.insert(opts.from, h(opts.from, opts.to));
    const visited = new Set<string>();
    let explored = 0;

    while (!pq.isEmpty()) {
      if (explored % 1000 === 0) { checkAborted(opts.signal, 'aStarSearch'); }
      const cur = pq.extractMin();
      if (!cur || visited.has(cur)) { continue; }
      visited.add(cur);
      explored++;

      if (cur === opts.to) {
        const path = walkPredecessors(prev, opts.from, opts.to, this._log, 'A* path');
        return { path, totalCost: gScore.get(opts.to) ?? 0, nodesExplored: explored };
      }

      const neighbors = dir === 'children'
        ? await this._index.getChildren(cur)
        : await this._index.getParents(cur);

      for (const n of neighbors) {
        if (visited.has(n)) { continue; }
        const w = await weight(cur, n);
        const tentG = (gScore.get(cur) ?? 0) + w;
        if (tentG < (gScore.get(n) ?? Infinity)) {
          prev.set(n, cur);
          gScore.set(n, tentG);
          const f = tentG + h(n, opts.to);
          pq.insert(n, f - EPSILON * tentG);
        }
      }
    }

    throw new TraversalError(`No path exists from ${opts.from} to ${opts.to}`, {
      code: 'NO_PATH', context: { from: opts.from, to: opts.to, direction: dir, nodesExplored: explored },
    });
  }

  // -- Bidirectional A* -------------------------------------------------------

  async bidirectionalAStar(opts: {
    from: string; to: string;
    weightProvider?: WeightProvider;
    forwardHeuristic?: HeuristicProvider;
    backwardHeuristic?: HeuristicProvider;
    signal?: AbortSignal;
  }): Promise<AStarResult> {
    if (opts.from === opts.to) {
      return { path: [opts.from], totalCost: 0, nodesExplored: 1 };
    }
    const weight = opts.weightProvider ?? (() => 1);
    const fwdH = opts.forwardHeuristic ?? (() => 0);
    const bwdH = opts.backwardHeuristic ?? (() => 0);

    const fwd = this._initSearchState(opts.from, fwdH(opts.from, opts.to));
    const bwd = this._initSearchState(opts.to, bwdH(opts.to, opts.from));

    let mu = Infinity;
    let meet: string | null = null;
    let explored = 0;

    while (!fwd.heap.isEmpty() || !bwd.heap.isEmpty()) {
      if (explored % 1000 === 0) { checkAborted(opts.signal, 'bidirectionalAStar'); }
      const fMin = fwd.heap.isEmpty() ? Infinity : fwd.heap.peekPriority();
      const bMin = bwd.heap.isEmpty() ? Infinity : bwd.heap.peekPriority();
      if (Math.min(fMin, bMin) >= mu) { break; }

      if (fMin <= bMin) {
        const r = await this._expandSide(fwd, bwd, 'forward', weight, fwdH, opts.to);
        explored += r.explored;
        if (r.cost < mu) { mu = r.cost; meet = r.meeting; }
      } else {
        const r = await this._expandSide(bwd, fwd, 'backward', weight, bwdH, opts.from);
        explored += r.explored;
        if (r.cost < mu) { mu = r.cost; meet = r.meeting; }
      }
    }

    if (!meet) {
      throw new TraversalError(`No path exists from ${opts.from} to ${opts.to}`, {
        code: 'NO_PATH', context: { from: opts.from, to: opts.to, nodesExplored: explored },
      });
    }

    const path = reconstructBidirectionalAStar(fwd.prev, bwd.prev, opts.from, opts.to, meet, this._log);
    return { path, totalCost: mu, nodesExplored: explored };
  }

  // -- Bidirectional A* helpers -----------------------------------------------

  private _initSearchState(start: string, initialF: number) {
    const g = new Map<string, number>([[start, 0]]);
    const prev = new Map<string, string>();
    const visited = new Set<string>();
    const heap = new MinHeap<string>();
    heap.insert(start, initialF);
    return { g, prev, visited, heap };
  }

  private async _expandSide(
    active: { g: Map<string, number>; prev: Map<string, string>; visited: Set<string>; heap: MinHeap<string> },
    other: { g: Map<string, number>; visited: Set<string> },
    direction: 'forward' | 'backward',
    weight: WeightProvider,
    heuristic: HeuristicProvider,
    target: string,
  ): Promise<{ explored: number; cost: number; meeting: string | null }> {
    const cur = active.heap.extractMin();
    if (!cur || active.visited.has(cur)) {
      return { explored: 0, cost: Infinity, meeting: null };
    }
    active.visited.add(cur);

    let bestCost = Infinity;
    let bestMeet: string | null = null;

    if (other.visited.has(cur)) {
      const total = (active.g.get(cur) ?? 0) + (other.g.get(cur) ?? 0);
      if (total < bestCost) { bestCost = total; bestMeet = cur; }
    }

    const neighbors = direction === 'forward'
      ? await this._index.getChildren(cur)
      : await this._index.getParents(cur);

    for (const n of neighbors) {
      if (active.visited.has(n)) { continue; }
      const w = direction === 'forward'
        ? await weight(cur, n)
        : await weight(n, cur);
      const tentG = (active.g.get(cur) ?? 0) + w;
      if (tentG < (active.g.get(n) ?? Infinity)) {
        active.prev.set(n, cur);
        active.g.set(n, tentG);
        active.heap.insert(n, tentG + heuristic(n, target));
        if (other.g.has(n)) {
          const total = tentG + (other.g.get(n) ?? 0);
          if (total < bestCost) { bestCost = total; bestMeet = n; }
        }
      }
    }

    return { explored: 1, cost: bestCost, meeting: bestMeet };
  }
}

export type { PathResult, WeightedResult, AStarResult, WeightProvider, HeuristicProvider };
