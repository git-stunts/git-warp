import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type ReadIdentity from './ReadIdentity.ts';

export type TraversalOpticStrategy = 'breadth-first';
export type TraversalOpticCompleteness =
  | 'complete'
  | 'frontier-open'
  | 'goal-found'
  | 'goal-not-found-within-boundary';

export type TraversalOpticFrontierEntry = {
  readonly nodeId: string;
  readonly depth: number;
  readonly edgeCursor: string | null;
};

export type TraversalOpticEdge = {
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly label: string;
  readonly depth: number;
  readonly expansionDirection: Exclude<Direction, 'both'>;
};

export class TraversalOpticCursor {
  readonly frontier: readonly TraversalOpticFrontierEntry[];
  readonly visitedNodeIds: readonly string[];

  constructor(options: {
    readonly frontier: readonly TraversalOpticFrontierEntry[];
    readonly visitedNodeIds: readonly string[];
  }) {
    this.frontier = freezeFrontier(options.frontier);
    this.visitedNodeIds = Object.freeze([...options.visitedNodeIds].sort());
    Object.freeze(this);
  }
}

export default class TraversalOpticReadResult {
  readonly startNodeId: string;
  readonly strategy: TraversalOpticStrategy;
  readonly direction: Direction;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxEdges: number;
  readonly goalNodeId: string | null;
  readonly edges: readonly TraversalOpticEdge[];
  readonly visitedNodeIds: readonly string[];
  readonly frontier: readonly TraversalOpticFrontierEntry[];
  readonly completeness: TraversalOpticCompleteness;
  readonly cursor: TraversalOpticCursor | null;
  readonly readIdentities: readonly ReadIdentity[];

  constructor(options: {
    readonly startNodeId: string;
    readonly strategy: TraversalOpticStrategy;
    readonly direction: Direction;
    readonly maxDepth: number;
    readonly maxNodes: number;
    readonly maxEdges: number;
    readonly goalNodeId: string | null;
    readonly edges: readonly TraversalOpticEdge[];
    readonly visitedNodeIds: readonly string[];
    readonly frontier: readonly TraversalOpticFrontierEntry[];
    readonly completeness: TraversalOpticCompleteness;
    readonly cursor: TraversalOpticCursor | null;
    readonly readIdentities: readonly ReadIdentity[];
  }) {
    this.startNodeId = options.startNodeId;
    this.strategy = options.strategy;
    this.direction = options.direction;
    this.maxDepth = options.maxDepth;
    this.maxNodes = options.maxNodes;
    this.maxEdges = options.maxEdges;
    this.goalNodeId = options.goalNodeId;
    this.edges = freezeEdges(options.edges);
    this.visitedNodeIds = Object.freeze([...options.visitedNodeIds].sort());
    this.frontier = freezeFrontier(options.frontier);
    this.completeness = options.completeness;
    this.cursor = options.cursor;
    this.readIdentities = Object.freeze([...options.readIdentities]);
    Object.freeze(this);
  }
}

function freezeFrontier(
  frontier: readonly TraversalOpticFrontierEntry[],
): readonly TraversalOpticFrontierEntry[] {
  return Object.freeze(
    frontier.map((entry) => Object.freeze({
      nodeId: entry.nodeId,
      depth: entry.depth,
      edgeCursor: entry.edgeCursor,
    })),
  );
}

function freezeEdges(edges: readonly TraversalOpticEdge[]): readonly TraversalOpticEdge[] {
  return Object.freeze(
    edges.map((edge) => Object.freeze({
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      label: edge.label,
      depth: edge.depth,
      expansionDirection: edge.expansionDirection,
    })),
  );
}
