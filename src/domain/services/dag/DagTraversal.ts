/**
 * Service for DAG traversal operations: BFS, DFS, ancestor/descendant
 * enumeration, and reachability checks.
 *
 * All traversal methods use async generators for memory-efficient
 * processing of arbitrarily large graphs.
 *
 * @module domain/services/dag/DagTraversal
 */

import nullLogger from '../../utils/nullLogger.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import WarpError from '../../errors/WarpError.ts';

// -- Types --------------------------------------------------------------------

type TraversalDirection = 'forward' | 'reverse';

type TraversalNode = {
  readonly sha: string;
  readonly depth: number;
  readonly parent: string | null;
};

type TraversalOptions = {
  readonly start: string;
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly direction?: TraversalDirection;
  readonly signal?: AbortSignal;
};

/** Minimal contract for the index reader. */
type DagIndexReader = {
  readonly getChildren: (sha: string) => Promise<string[]>;
  readonly getParents: (sha: string) => Promise<string[]>;
};

/** Minimal contract for the path finder (set via _setPathFinder). */
type PathFinder = {
  readonly findPath: (opts: {
    from: string;
    to: string;
    maxDepth?: number;
    signal?: AbortSignal;
  }) => Promise<{ found: boolean }>;
};

// -- Constants ----------------------------------------------------------------

const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;

// -- Service ------------------------------------------------------------------

export default class DagTraversal {
  private readonly _indexReader: DagIndexReader;
  private readonly _logger: LoggerPort;
  private _pathFinder: PathFinder | null = null;

  constructor(deps: { indexReader: DagIndexReader; logger?: LoggerPort }) {
    if (!deps.indexReader) {
      throw new WarpError('DagTraversal requires an indexReader', 'E_DAG_TRAVERSAL_NO_INDEX');
    }
    this._indexReader = deps.indexReader;
    this._logger = deps.logger ?? nullLogger;
  }

  private async _getNeighbors(sha: string, direction: TraversalDirection): Promise<string[]> {
    if (direction === 'forward') {
      return this._indexReader.getChildren(sha);
    }
    return this._indexReader.getParents(sha);
  }

  async *bfs(opts: TraversalOptions): AsyncGenerator<TraversalNode> {
    const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    const direction = opts.direction ?? 'forward';
    const visited = new Set<string>();
    const queue: TraversalNode[] = [{ sha: opts.start, depth: 0, parent: null }];
    let count = 0;

    this._logger.debug('BFS started', { start: opts.start, direction, maxNodes, maxDepth });

    while (queue.length > 0 && count < maxNodes) {
      if (count % 1000 === 0) {
        checkAborted(opts.signal, 'bfs');
      }

      const current = queue.shift()!;
      if (visited.has(current.sha) || current.depth > maxDepth) {
        continue;
      }

      visited.add(current.sha);
      count++;
      yield current;

      if (current.depth < maxDepth) {
        const neighbors = await this._getNeighbors(current.sha, direction);
        for (const n of neighbors) {
          if (!visited.has(n)) {
            queue.push({ sha: n, depth: current.depth + 1, parent: current.sha });
          }
        }
      }
    }

    this._logger.debug('BFS completed', { nodesVisited: count, start: opts.start, direction });
  }

  async *dfs(opts: TraversalOptions): AsyncGenerator<TraversalNode> {
    const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    const direction = opts.direction ?? 'forward';
    const visited = new Set<string>();
    const stack: TraversalNode[] = [{ sha: opts.start, depth: 0, parent: null }];
    let count = 0;

    this._logger.debug('DFS started', { start: opts.start, direction, maxNodes, maxDepth });

    while (stack.length > 0 && count < maxNodes) {
      if (count % 1000 === 0) {
        checkAborted(opts.signal, 'dfs');
      }

      const current = stack.pop()!;
      if (visited.has(current.sha) || current.depth > maxDepth) {
        continue;
      }

      visited.add(current.sha);
      count++;
      yield current;

      if (current.depth < maxDepth) {
        const neighbors = await this._getNeighbors(current.sha, direction);
        for (let i = neighbors.length - 1; i >= 0; i--) {
          const n = neighbors[i]!;
          if (!visited.has(n)) {
            stack.push({ sha: n, depth: current.depth + 1, parent: current.sha });
          }
        }
      }
    }

    this._logger.debug('DFS completed', { nodesVisited: count, start: opts.start, direction });
  }

  async *ancestors(opts: {
    sha: string;
    maxNodes?: number;
    maxDepth?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<TraversalNode> {
    yield* this.bfs({
      start: opts.sha,
      maxNodes: opts.maxNodes,
      maxDepth: opts.maxDepth,
      direction: 'reverse',
      signal: opts.signal,
    });
  }

  async *descendants(opts: {
    sha: string;
    maxNodes?: number;
    maxDepth?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<TraversalNode> {
    yield* this.bfs({
      start: opts.sha,
      maxNodes: opts.maxNodes,
      maxDepth: opts.maxDepth,
      direction: 'forward',
      signal: opts.signal,
    });
  }

  async isReachable(opts: {
    from: string;
    to: string;
    maxDepth?: number;
    signal?: AbortSignal;
  }): Promise<boolean> {
    if (this._pathFinder) {
      const result = await this._pathFinder.findPath(opts);
      return result.found;
    }
    if (opts.from === opts.to) {
      return true;
    }
    for await (const node of this.bfs({
      start: opts.from,
      maxDepth: opts.maxDepth,
      direction: 'forward',
      signal: opts.signal,
    })) {
      if (node.sha === opts.to) {
        return true;
      }
    }
    return false;
  }

  /** @internal */
  _setPathFinder(pathFinder: PathFinder): void {
    this._pathFinder = pathFinder;
  }
}

export type { TraversalDirection, TraversalNode, TraversalOptions, DagIndexReader, PathFinder };
