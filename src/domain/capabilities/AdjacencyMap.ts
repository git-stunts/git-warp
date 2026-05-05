import type { NeighborEdge } from '../../ports/NeighborProviderPort.ts';

/**
 * Immutable adjacency snapshot from a materialized graph state.
 *
 * Captures the outgoing and incoming edge lists for every alive node
 * at a specific materialization point. Used by QueryBuilder,
 * LogicalTraversal, AdjacencyNeighborProvider, and Observer.
 */
export default class AdjacencyMap {
  readonly outgoing: ReadonlyMap<string, readonly NeighborEdge[]>;
  readonly incoming: ReadonlyMap<string, readonly NeighborEdge[]>;

  constructor(params: {
    outgoing: Map<string, NeighborEdge[]>;
    incoming: Map<string, NeighborEdge[]>;
  }) {
    this.outgoing = params.outgoing;
    this.incoming = params.incoming;
    Object.freeze(this);
  }
}
