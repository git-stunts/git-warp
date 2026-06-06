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
    const traversal = normalizeTraversalOptions(startNodeId, options);
    const visited = new Set(traversal.cursor?.visitedNodeIds ?? [startNodeId]);
    const frontier = [...(traversal.cursor?.frontier ?? [frontierEntry(startNodeId, 0, null)])];
    const resultEdges: TraversalOpticEdge[] = [];
    const readIdentities: ReadIdentity[] = [];
    if (traversal.goalNodeId !== null && visited.has(traversal.goalNodeId)) {
      return traversalResult(traversal, {
        edges: resultEdges,
        visited,
        frontier: [],
        completeness: 'goal-found',
        readIdentities,
      });
    }

    while (frontier.length > 0) {
      if (resultEdges.length >= traversal.maxEdges) {
        return openTraversalResult(traversal, resultEdges, visited, frontier, readIdentities);
      }
      const current = frontier.shift();
      if (current !== undefined) {
        const result = await this._expandFrontierEntry({
          current,
          frontier,
          readIdentities,
          resultEdges,
          traversal,
          visited,
        });
        if (result !== null) {
          return result;
        }
      }
    }

    return traversalResult(traversal, {
      edges: resultEdges,
      visited,
      frontier,
      completeness: traversal.goalNodeId === null ? 'complete' : 'goal-not-found-within-boundary',
      readIdentities,
    });
  }

  private async _expandFrontierEntry(options: {
    readonly current: TraversalOpticFrontierEntry;
    readonly frontier: TraversalOpticFrontierEntry[];
    readonly readIdentities: ReadIdentity[];
    readonly resultEdges: TraversalOpticEdge[];
    readonly traversal: NormalizedTraversalOptions;
    readonly visited: Set<string>;
  }): Promise<TraversalOpticReadResult | null> {
    if (options.current.depth >= options.traversal.maxDepth) {
      return null;
    }
    const neighborhood = await this._readNeighborhoodForEntry(options.current, options.traversal, options.resultEdges);
    options.readIdentities.push(neighborhood.readIdentity);
    const depth = options.current.depth + 1;
    for (const edge of neighborhood.edges) {
      if (!options.visited.has(edge.neighborId) && options.visited.size >= options.traversal.maxNodes) {
        options.frontier.unshift(options.current);
        return openTraversalResult(
          options.traversal,
          options.resultEdges,
          options.visited,
          options.frontier,
          options.readIdentities,
        );
      }
      options.resultEdges.push(traversalEdge(options.current.nodeId, edge, depth));
      if (!options.visited.has(edge.neighborId)) {
        const result = addTraversalNeighbor(options, edge.neighborId, depth);
        if (result !== null) {
          return result;
        }
      }
    }
    if (neighborhood.cursor !== null) {
      options.frontier.unshift(frontierEntry(options.current.nodeId, options.current.depth, neighborhood.cursor));
      return openTraversalResult(
        options.traversal,
        options.resultEdges,
        options.visited,
        options.frontier,
        options.readIdentities,
      );
    }
    return null;
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

function addTraversalNeighbor(
  options: {
    readonly frontier: TraversalOpticFrontierEntry[];
    readonly readIdentities: readonly ReadIdentity[];
    readonly resultEdges: readonly TraversalOpticEdge[];
    readonly traversal: NormalizedTraversalOptions;
    readonly visited: Set<string>;
  },
  neighborId: string,
  depth: number,
): TraversalOpticReadResult | null {
  options.visited.add(neighborId);
  if (options.traversal.goalNodeId === neighborId) {
    return traversalResult(options.traversal, {
      edges: options.resultEdges,
      visited: options.visited,
      frontier: options.frontier,
      completeness: 'goal-found',
      readIdentities: options.readIdentities,
    });
  }
  if (depth < options.traversal.maxDepth) {
    options.frontier.push(frontierEntry(neighborId, depth, null));
  }
  return null;
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

function traversalResult(
  traversal: NormalizedTraversalOptions,
  options: {
    readonly edges: readonly TraversalOpticEdge[];
    readonly visited: Set<string>;
    readonly frontier: readonly TraversalOpticFrontierEntry[];
    readonly completeness: TraversalOpticCompleteness;
    readonly readIdentities: readonly ReadIdentity[];
  },
): TraversalOpticReadResult {
  return new TraversalOpticReadResult({
    startNodeId: traversal.startNodeId,
    strategy: traversal.strategy,
    direction: traversal.direction,
    maxDepth: traversal.maxDepth,
    maxNodes: traversal.maxNodes,
    maxEdges: traversal.maxEdges,
    goalNodeId: traversal.goalNodeId,
    edges: options.edges,
    visitedNodeIds: [...options.visited],
    frontier: options.frontier,
    completeness: options.completeness,
    cursor: options.completeness === 'frontier-open'
      ? new TraversalOpticCursor({
        frontier: options.frontier,
        visitedNodeIds: [...options.visited],
      })
      : null,
    readIdentities: options.readIdentities,
  });
}

function openTraversalResult(
  traversal: NormalizedTraversalOptions,
  edges: readonly TraversalOpticEdge[],
  visited: Set<string>,
  frontier: readonly TraversalOpticFrontierEntry[],
  readIdentities: readonly ReadIdentity[],
): TraversalOpticReadResult {
  return traversalResult(traversal, {
    edges,
    visited,
    frontier,
    completeness: 'frontier-open',
    readIdentities,
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
