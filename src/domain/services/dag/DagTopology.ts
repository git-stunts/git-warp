/**
 * Service for DAG topology operations: topological sort and
 * common ancestor finding.
 *
 * @module domain/services/dag/DagTopology
 */

import nullLogger from '../../utils/nullLogger.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import TraversalError from '../../errors/TraversalError.ts';
import { checkAborted } from '../../utils/cancellation.ts';
import type DagTraversal from './DagTraversal.ts';
import type { TraversalDirection, DagIndexReader } from './DagTraversal.ts';

// -- Constants ----------------------------------------------------------------

const DEFAULT_MAX_NODES = 100000;
const DEFAULT_MAX_DEPTH = 1000;

// -- Service ------------------------------------------------------------------

export default class DagTopology {
  private readonly _indexReader: DagIndexReader;
  private readonly _logger: LoggerPort;
  private readonly _traversal: DagTraversal | null;

  constructor(deps: {
    indexReader: DagIndexReader;
    logger?: LoggerPort;
    traversal?: DagTraversal;
  }) {
    if (deps.indexReader === null || deps.indexReader === undefined) {
      throw new TraversalError('DagTopology requires an indexReader', { code: 'E_MISSING_INDEX_READER' });
    }
    this._indexReader = deps.indexReader;
    this._logger = deps.logger ?? nullLogger;
    this._traversal = deps.traversal ?? null;
  }

  private async _getNeighbors(sha: string, direction: TraversalDirection): Promise<string[]> {
    if (direction === 'forward') {
      return await this._indexReader.getChildren(sha);
    }
    return await this._indexReader.getParents(sha);
  }

  /**
   * Finds common ancestors of multiple nodes.
   *
   * An ancestor is "common" if it can be reached by following parent
   * edges from ALL of the input nodes.
   */
  async commonAncestors(opts: {
    shas: string[];
    maxResults?: number;
    maxDepth?: number;
    signal?: AbortSignal;
  }): Promise<string[]> {
    if (opts.shas.length === 0) {
      return [];
    }
    if (!this._traversal) {
      throw new TraversalError('commonAncestors requires a traversal service', { code: 'E_MISSING_TRAVERSAL' });
    }
    const maxResults = opts.maxResults ?? 100;
    const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;

    if (opts.shas.length === 1) {
      const ancestors: string[] = [];
      for await (const node of this._traversal.ancestors({
        sha: opts.shas[0]!,
        maxNodes: maxResults,
        maxDepth,
        signal: opts.signal,
      })) {
        ancestors.push(node.sha);
      }
      return ancestors;
    }

    this._logger.debug('commonAncestors started', { shaCount: opts.shas.length, maxDepth });

    const ancestorCounts = new Map<string, number>();

    for (const sha of opts.shas) {
      checkAborted(opts.signal, 'commonAncestors');
      const visited = new Set<string>();
      for await (const node of this._traversal.ancestors({
        sha,
        maxDepth,
        signal: opts.signal,
      })) {
        if (!visited.has(node.sha)) {
          visited.add(node.sha);
          ancestorCounts.set(node.sha, (ancestorCounts.get(node.sha) ?? 0) + 1);
        }
      }
    }

    const common: string[] = [];
    for (const [ancestor, count] of ancestorCounts) {
      if (count === opts.shas.length) {
        common.push(ancestor);
        if (common.length >= maxResults) {
          break;
        }
      }
    }

    this._logger.debug('commonAncestors completed', { found: common.length });
    return common;
  }

  /**
   * Yields nodes in topological order using Kahn's algorithm.
   *
   * Topological order ensures that for every directed edge A -> B,
   * node A is yielded before node B.
   */
  async *topologicalSort(opts: {
    start: string;
    maxNodes?: number;
    direction?: TraversalDirection;
    throwOnCycle?: boolean;
    signal?: AbortSignal;
  }): AsyncGenerator<{ sha: string; depth: number; parent: null }> {
    const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
    const direction = opts.direction ?? 'forward';
    const throwOnCycle = opts.throwOnCycle ?? false;

    this._logger.debug('topologicalSort started', { start: opts.start, direction, maxNodes });

    // Phase 1: Discover all reachable nodes and compute in-degrees
    const inDegree = new Map<string, number>();
    const allNodes = new Set<string>();
    const edges = new Map<string, string[]>();
    const queue = [opts.start];
    allNodes.add(opts.start);

    while (queue.length > 0) {
      if (allNodes.size % 1000 === 0) {
        checkAborted(opts.signal, 'topologicalSort');
      }
      const sha = queue.shift()!;
      const neighbors = await this._getNeighbors(sha, direction);
      edges.set(sha, neighbors);

      for (const neighbor of neighbors) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
        if (!allNodes.has(neighbor)) {
          allNodes.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (!inDegree.has(opts.start)) {
      inDegree.set(opts.start, 0);
    }

    // Phase 2: Yield nodes with in-degree 0
    const ready: string[] = [];
    for (const sha of allNodes) {
      if ((inDegree.get(sha) ?? 0) === 0) {
        ready.push(sha);
      }
    }

    let nodesYielded = 0;
    const depthMap = new Map<string, number>([[opts.start, 0]]);

    while (ready.length > 0 && nodesYielded < maxNodes) {
      if (nodesYielded % 1000 === 0) {
        checkAborted(opts.signal, 'topologicalSort');
      }
      const sha = ready.shift()!;
      const depth = depthMap.get(sha) ?? 0;

      nodesYielded++;
      yield { sha, depth, parent: null };

      for (const neighbor of (edges.get(sha) ?? [])) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (!depthMap.has(neighbor)) {
          depthMap.set(neighbor, depth + 1);
        }
        if (newDegree === 0) {
          ready.push(neighbor);
        }
      }
    }

    // Phase 3: Detect cycles
    if (nodesYielded < allNodes.size) {
      const cycleNodeCount = allNodes.size - nodesYielded;
      this._logger.warn('Cycle detected in topological sort', {
        start: opts.start, direction, nodesYielded,
        totalNodes: allNodes.size, nodesInCycle: cycleNodeCount,
      });
      if (throwOnCycle) {
        throw new TraversalError('Cycle detected in graph during topological sort', {
          code: 'CYCLE_DETECTED',
          context: {
            start: opts.start, direction, nodesYielded,
            totalNodes: allNodes.size, nodesInCycle: cycleNodeCount,
          },
        });
      }
    }

    this._logger.debug('topologicalSort completed', {
      nodesYielded, totalNodes: allNodes.size,
      cycleDetected: nodesYielded < allNodes.size,
    });
  }
}
