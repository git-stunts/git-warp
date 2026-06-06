import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import QueryError from '../../errors/QueryError.ts';
import type ReadIdentity from './ReadIdentity.ts';
import type { NeighborhoodOpticReadOptions } from './NeighborhoodOptic.ts';
import type NeighborhoodOpticReadResult from './NeighborhoodOpticReadResult.ts';
import type { NeighborhoodOpticEdge } from './NeighborhoodOpticReadResult.ts';
import type { TraversalOpticReadOptions } from './TraversalOptic.ts';
import TraversalOpticReadResult, {
  TraversalOpticCursor,
  type TraversalOpticCompleteness,
  type TraversalOpticEdge,
  type TraversalOpticFrontierEntry,
} from './TraversalOpticReadResult.ts';

type TraversalNeighborhoodRead = (
  nodeId: string,
  options: NeighborhoodOpticReadOptions,
) => Promise<NeighborhoodOpticReadResult>;

type NormalizedTraversalOptions = {
  readonly startNodeId: string;
  readonly strategy: 'breadth-first';
  readonly direction: Direction;
  readonly labels: readonly string[];
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxEdges: number;
  readonly goalNodeId: string | null;
  readonly cursor: TraversalOpticCursor | null;
};

type TraversalRunState = {
  readonly traversal: NormalizedTraversalOptions;
  readonly visited: Set<string>;
  readonly frontier: TraversalOpticFrontierEntry[];
  readonly resultEdges: TraversalOpticEdge[];
  readonly readIdentities: ReadIdentity[];
};

type TraversalResultOptions = {
  readonly traversal: NormalizedTraversalOptions;
  readonly edges: readonly TraversalOpticEdge[];
  readonly visited: Set<string>;
  readonly frontier: readonly TraversalOpticFrontierEntry[];
  readonly completeness: TraversalOpticCompleteness;
  readonly readIdentities: readonly ReadIdentity[];
};

export default class CheckpointTailTraversalReader {
  private readonly _readNeighborhood: TraversalNeighborhoodRead;

  constructor(options: { readonly readNeighborhood: TraversalNeighborhoodRead }) {
    this._readNeighborhood = options.readNeighborhood;
    Object.freeze(this);
  }

  async read(
    startNodeId: string,
    options: TraversalOpticReadOptions,
  ): Promise<TraversalOpticReadResult> {
    const state = createTraversalRunState(startNodeId, options);
    if (isGoalAlreadyVisited(state)) {
      return goalAlreadyVisitedResult(state);
    }
    return await this._drainFrontier(state);
  }

  private async _drainFrontier(state: TraversalRunState): Promise<TraversalOpticReadResult> {
    while (state.frontier.length > 0) {
      if (state.resultEdges.length >= state.traversal.maxEdges) {
        return openTraversalResult(state);
      }
      const current = state.frontier.shift();
      if (current === undefined) {
        continue;
      }
      const result = await this._expandFrontierEntry(state, current);
      if (result !== null) {
        return result;
      }
    }
    return traversalStateResult(state, drainedFrontierCompleteness(state));
  }

  private async _expandFrontierEntry(
    state: TraversalRunState,
    current: TraversalOpticFrontierEntry,
  ): Promise<TraversalOpticReadResult | null> {
    if (current.depth >= state.traversal.maxDepth) {
      return null;
    }
    const neighborhood = await this._readNeighborhoodForEntry(current, state.traversal, state.resultEdges);
    state.readIdentities.push(neighborhood.readIdentity);
    return processNeighborhoodRead(state, current, neighborhood);
  }

  private async _readNeighborhoodForEntry(
    current: TraversalOpticFrontierEntry,
    traversal: NormalizedTraversalOptions,
    resultEdges: readonly TraversalOpticEdge[],
  ): Promise<NeighborhoodOpticReadResult> {
    const remainingEdgeBudget = traversal.maxEdges - resultEdges.length;
    return await this._readNeighborhood(current.nodeId, {
      direction: traversal.direction,
      labels: traversal.labels,
      limit: remainingEdgeBudget,
      ...(current.edgeCursor === null ? {} : { cursor: current.edgeCursor }),
    });
  }
}

function processNeighborhoodRead(
  state: TraversalRunState,
  current: TraversalOpticFrontierEntry,
  neighborhood: NeighborhoodOpticReadResult,
): TraversalOpticReadResult | null {
  const depth = current.depth + 1;
  for (const edge of neighborhood.edges) {
    const boundaryResult = maybeOpenForNodeLimit(state, current, edge.neighborId);
    if (boundaryResult !== null) {
      return boundaryResult;
    }
    state.resultEdges.push(traversalEdge(current.nodeId, edge, depth));
    const neighborResult = addTraversalNeighbor(state, edge.neighborId, depth);
    if (neighborResult !== null) {
      return neighborResult;
    }
  }
  return maybeOpenForNeighborhoodCursor(state, current, neighborhood.cursor);
}

function maybeOpenForNodeLimit(
  state: TraversalRunState,
  current: TraversalOpticFrontierEntry,
  neighborId: string,
): TraversalOpticReadResult | null {
  if (state.visited.has(neighborId) || state.visited.size < state.traversal.maxNodes) {
    return null;
  }
  state.frontier.unshift(current);
  return openTraversalResult(state);
}

function addTraversalNeighbor(
  state: TraversalRunState,
  neighborId: string,
  depth: number,
): TraversalOpticReadResult | null {
  if (state.visited.has(neighborId)) {
    return null;
  }
  state.visited.add(neighborId);
  if (state.traversal.goalNodeId === neighborId) {
    return traversalResult({
      traversal: state.traversal,
      edges: state.resultEdges,
      visited: state.visited,
      frontier: state.frontier,
      completeness: 'goal-found',
      readIdentities: state.readIdentities,
    });
  }
  if (depth < state.traversal.maxDepth) {
    state.frontier.push(frontierEntry(neighborId, depth, null));
  }
  return null;
}

function maybeOpenForNeighborhoodCursor(
  state: TraversalRunState,
  current: TraversalOpticFrontierEntry,
  cursor: string | null,
): TraversalOpticReadResult | null {
  if (cursor === null) {
    return null;
  }
  state.frontier.unshift(frontierEntry(current.nodeId, current.depth, cursor));
  return openTraversalResult(state);
}

function createTraversalRunState(
  startNodeId: string,
  options: TraversalOpticReadOptions,
): TraversalRunState {
  const traversal = normalizeTraversalOptions(startNodeId, options);
  return {
    traversal,
    visited: new Set(traversal.cursor?.visitedNodeIds ?? [startNodeId]),
    frontier: [...(traversal.cursor?.frontier ?? [frontierEntry(startNodeId, 0, null)])],
    resultEdges: [],
    readIdentities: [],
  };
}

function isGoalAlreadyVisited(state: TraversalRunState): boolean {
  const { goalNodeId } = state.traversal;
  return goalNodeId !== null && state.visited.has(goalNodeId);
}

function goalAlreadyVisitedResult(state: TraversalRunState): TraversalOpticReadResult {
  return traversalResult({
    traversal: state.traversal,
    edges: state.resultEdges,
    visited: state.visited,
    frontier: [],
    completeness: 'goal-found',
    readIdentities: state.readIdentities,
  });
}

function normalizeTraversalOptions(
  startNodeId: string,
  options: TraversalOpticReadOptions,
): NormalizedTraversalOptions {
  const strategy = options.strategy ?? 'breadth-first';
  if (strategy !== 'breadth-first') {
    throw new QueryError('Traversal optic supports breadth-first strategy only.', {
      code: 'E_OPTIC_TRAVERSAL_OPTIONS',
      context: { field: 'strategy' },
    });
  }
  return {
    startNodeId,
    strategy,
    direction: normalizeDirection(options.direction),
    labels: normalizeLabels(options.labels ?? []),
    maxDepth: requireTraversalDepth(options.maxDepth),
    maxNodes: requirePositiveTraversalBound(options.maxNodes, 'maxNodes'),
    maxEdges: requirePositiveTraversalBound(options.maxEdges, 'maxEdges'),
    goalNodeId: options.goalNodeId ?? null,
    cursor: normalizeTraversalCursor(options.cursor),
  };
}

function normalizeDirection(direction: Direction | undefined): Direction {
  if (direction === undefined) {
    return 'out';
  }
  if (direction === 'in' || direction === 'out' || direction === 'both') {
    return direction;
  }
  throw new QueryError('Traversal optic requires a valid direction.', {
    code: 'E_OPTIC_TRAVERSAL_OPTIONS',
    context: { field: 'direction' },
  });
}

function normalizeLabels(labels: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(labels)].sort());
}

function requirePositiveTraversalBound(value: number | undefined, field: string): number {
  if (value === undefined) {
    throw new QueryError('Traversal optic requires explicit bounded traversal limits.', {
      code: 'E_OPTIC_TRAVERSAL_UNBOUNDED',
      context: { field, reason: 'requires-global-scan' },
    });
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new QueryError('Traversal optic limits must be positive integers.', {
      code: 'E_OPTIC_TRAVERSAL_OPTIONS',
      context: { field },
    });
  }
  return value;
}

function requireTraversalDepth(value: number | undefined): number {
  if (value === undefined) {
    throw new QueryError('Traversal optic requires explicit bounded traversal limits.', {
      code: 'E_OPTIC_TRAVERSAL_UNBOUNDED',
      context: { field: 'maxDepth', reason: 'requires-global-scan' },
    });
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new QueryError('Traversal optic depth must be a non-negative integer.', {
      code: 'E_OPTIC_TRAVERSAL_OPTIONS',
      context: { field: 'maxDepth' },
    });
  }
  return value;
}

function normalizeTraversalCursor(
  cursor: TraversalOpticCursor | undefined,
): TraversalOpticCursor | null {
  if (cursor === undefined) {
    return null;
  }
  if (cursor instanceof TraversalOpticCursor) {
    return cursor;
  }
  throw new QueryError('Traversal optic cursor must be a traversal cursor.', {
    code: 'E_OPTIC_TRAVERSAL_OPTIONS',
    context: { field: 'cursor' },
  });
}

function traversalResult(options: TraversalResultOptions): TraversalOpticReadResult {
  const visitedNodeIds = [...options.visited];
  return new TraversalOpticReadResult({
    startNodeId: options.traversal.startNodeId,
    strategy: options.traversal.strategy,
    direction: options.traversal.direction,
    maxDepth: options.traversal.maxDepth,
    maxNodes: options.traversal.maxNodes,
    maxEdges: options.traversal.maxEdges,
    goalNodeId: options.traversal.goalNodeId,
    edges: options.edges,
    visitedNodeIds,
    frontier: options.frontier,
    completeness: options.completeness,
    cursor: traversalCursor(options.completeness, options.frontier, visitedNodeIds),
    readIdentities: options.readIdentities,
  });
}

function traversalStateResult(
  state: TraversalRunState,
  completeness: TraversalOpticCompleteness,
): TraversalOpticReadResult {
  return traversalResult({
    traversal: state.traversal,
    edges: state.resultEdges,
    visited: state.visited,
    frontier: state.frontier,
    completeness,
    readIdentities: state.readIdentities,
  });
}

function openTraversalResult(state: TraversalRunState): TraversalOpticReadResult {
  return traversalStateResult(state, 'frontier-open');
}

function drainedFrontierCompleteness(state: TraversalRunState): TraversalOpticCompleteness {
  return state.traversal.goalNodeId === null ? 'complete' : 'goal-not-found-within-boundary';
}

function traversalCursor(
  completeness: TraversalOpticCompleteness,
  frontier: readonly TraversalOpticFrontierEntry[],
  visitedNodeIds: readonly string[],
): TraversalOpticCursor | null {
  if (completeness !== 'frontier-open') {
    return null;
  }
  return new TraversalOpticCursor({
    frontier,
    visitedNodeIds,
  });
}

function frontierEntry(
  nodeId: string,
  depth: number,
  edgeCursor: string | null,
): TraversalOpticFrontierEntry {
  return Object.freeze({ nodeId, depth, edgeCursor });
}

function traversalEdge(
  currentNodeId: string,
  edge: NeighborhoodOpticEdge,
  depth: number,
): TraversalOpticEdge {
  if (edge.direction === 'out') {
    return Object.freeze({
      fromNodeId: currentNodeId,
      toNodeId: edge.neighborId,
      label: edge.label,
      depth,
      expansionDirection: edge.direction,
    });
  }
  return Object.freeze({
    fromNodeId: edge.neighborId,
    toNodeId: currentNodeId,
    label: edge.label,
    depth,
    expansionDirection: edge.direction,
  });
}
