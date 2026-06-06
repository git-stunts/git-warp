import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type ReadIdentity from './ReadIdentity.ts';

export type NeighborhoodOpticReadDirection = Exclude<Direction, 'both'>;
export type NeighborhoodOpticCompleteness = 'complete' | 'truncated';

export type NeighborhoodOpticEdge = {
  readonly direction: NeighborhoodOpticReadDirection;
  readonly neighborId: string;
  readonly label: string;
};

export default class NeighborhoodOpticReadResult {
  readonly nodeId: string;
  readonly direction: Direction;
  readonly edges: readonly NeighborhoodOpticEdge[];
  readonly completeness: NeighborhoodOpticCompleteness;
  readonly cursor: string | null;
  readonly readIdentity: ReadIdentity;

  constructor(options: {
    readonly nodeId: string;
    readonly direction: Direction;
    readonly edges: readonly NeighborhoodOpticEdge[];
    readonly completeness: NeighborhoodOpticCompleteness;
    readonly cursor: string | null;
    readonly readIdentity: ReadIdentity;
  }) {
    this.nodeId = options.nodeId;
    this.direction = options.direction;
    this.edges = freezeEdges(options.edges);
    this.completeness = options.completeness;
    this.cursor = options.cursor;
    this.readIdentity = options.readIdentity;
    Object.freeze(this);
  }
}

function freezeEdges(edges: readonly NeighborhoodOpticEdge[]): readonly NeighborhoodOpticEdge[] {
  return Object.freeze(
    edges.map((edge) => Object.freeze({
      direction: edge.direction,
      neighborId: edge.neighborId,
      label: edge.label,
    })),
  );
}
