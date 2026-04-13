/**
 * Facade for commit DAG traversal operations.
 *
 * Composes DagTraversal, DagPathFinding, and DagTopology services
 * into a single backward-compatible API surface. All public methods
 * delegate to the appropriate sub-service.
 *
 * @module domain/services/dag/CommitDagTraversalService
 */

import nullLogger from '../../utils/nullLogger.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import DagTraversal, { type TraversalNode, type TraversalOptions, type DagIndexReader } from './DagTraversal.ts';
import DagPathFinding from './DagPathFinding.ts';
import DagTopology from './DagTopology.ts';
import TraversalError from '../../errors/TraversalError.ts';

export default class CommitDagTraversalService {
  private readonly _traversal: DagTraversal;
  private readonly _pathFinding: DagPathFinding;
  private readonly _topology: DagTopology;

  constructor(deps: { indexReader: DagIndexReader; logger?: LoggerPort }) {
    if (!deps.indexReader) {
      throw new TraversalError(
        'CommitDagTraversalService requires an indexReader',
        { code: 'E_DAG_TRAVERSAL_NO_INDEX' },
      );
    }
    const logger = deps.logger ?? nullLogger;
    this._traversal = new DagTraversal({ indexReader: deps.indexReader, logger });
    this._pathFinding = new DagPathFinding({ indexReader: deps.indexReader, logger });
    this._topology = new DagTopology({ indexReader: deps.indexReader, logger, traversal: this._traversal });

    this._traversal._setPathFinder(this._pathFinding);
  }

  // -- Traversal (delegated to DagTraversal) ----------------------------------

  bfs(opts: TraversalOptions): AsyncGenerator<TraversalNode> {
    return this._traversal.bfs(opts);
  }

  dfs(opts: TraversalOptions): AsyncGenerator<TraversalNode> {
    return this._traversal.dfs(opts);
  }

  ancestors(opts: Parameters<DagTraversal['ancestors']>[0]): AsyncGenerator<TraversalNode> {
    return this._traversal.ancestors(opts);
  }

  descendants(opts: Parameters<DagTraversal['descendants']>[0]): AsyncGenerator<TraversalNode> {
    return this._traversal.descendants(opts);
  }

  isReachable(opts: Parameters<DagTraversal['isReachable']>[0]): Promise<boolean> {
    return this._traversal.isReachable(opts);
  }

  // -- Path finding (delegated to DagPathFinding) -----------------------------

  findPath(opts: Parameters<DagPathFinding['findPath']>[0]) {
    return this._pathFinding.findPath(opts);
  }

  shortestPath(opts: Parameters<DagPathFinding['shortestPath']>[0]) {
    return this._pathFinding.shortestPath(opts);
  }

  weightedShortestPath(opts: Parameters<DagPathFinding['weightedShortestPath']>[0]) {
    return this._pathFinding.weightedShortestPath(opts);
  }

  aStarSearch(opts: Parameters<DagPathFinding['aStarSearch']>[0]) {
    return this._pathFinding.aStarSearch(opts);
  }

  bidirectionalAStar(opts: Parameters<DagPathFinding['bidirectionalAStar']>[0]) {
    return this._pathFinding.bidirectionalAStar(opts);
  }

  // -- Topology (delegated to DagTopology) ------------------------------------

  commonAncestors(opts: Parameters<DagTopology['commonAncestors']>[0]) {
    return this._topology.commonAncestors(opts);
  }

  topologicalSort(opts: Parameters<DagTopology['topologicalSort']>[0]) {
    return this._topology.topologicalSort(opts);
  }
}
