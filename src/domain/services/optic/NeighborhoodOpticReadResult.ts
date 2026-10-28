import type { Plurality } from '../../api/Plurality.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type { OpticReadIdentity } from './OpticReadIdentity.ts';

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
  readonly readIdentity: OpticReadIdentity;
  /** Concurrency the read observed (#1039): a register race or a delete raced by an edit; empty when none. */
  readonly plurality: readonly Plurality[];

  constructor(options: {
    readonly nodeId: string;
    readonly direction: Direction;
    readonly edges: readonly NeighborhoodOpticEdge[];
    readonly completeness: NeighborhoodOpticCompleteness;
    readonly cursor: string | null;
    readonly readIdentity: OpticReadIdentity;
    readonly plurality?: readonly Plurality[];
  }) {
    this.nodeId = options.nodeId;
    this.direction = options.direction;
    this.edges = freezeEdges(options.edges);
    this.completeness = options.completeness;
    this.cursor = options.cursor;
    this.readIdentity = options.readIdentity;
    this.plurality = Object.freeze([...(options.plurality ?? [])]);
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
