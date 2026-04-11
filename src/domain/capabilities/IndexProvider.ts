import type { Direction, NeighborEdge, NeighborOptions } from '../../ports/NeighborProviderPort.ts';

/**
 * Synchronous neighbor lookup from the materialized index.
 *
 * Used by QueryReads as a lightweight, sync-capable alternative
 * to NeighborProviderPort (which is async). Backed by the
 * in-memory adjacency map or bitmap index at query time.
 */
export default abstract class IndexProvider {
  abstract neighborsOf(
    _nodeId: string,
    _direction: Direction,
    _options?: NeighborOptions,
  ): NeighborEdge[];
}
