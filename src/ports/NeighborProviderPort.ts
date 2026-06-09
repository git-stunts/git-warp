/**
 * Port interface for neighbor lookups on any graph.
 *
 * Concrete providers back this with in-memory adjacency maps, bitmap indexes,
 * or remote APIs. All providers MUST return edges sorted by (neighborId, label)
 * using strict codepoint comparison (never localeCompare).
 */

import NeighborProviderError from '../domain/errors/NeighborProviderError.ts';

export type Direction = 'out' | 'in' | 'both';

const VALID_DIRECTIONS = new Set<string>(['out', 'in', 'both']);

export function isDirection(value: string): value is Direction {
  return VALID_DIRECTIONS.has(value);
}

export interface NeighborOptions {
  labels?: Set<string>;
}

export class NeighborEdge {
  readonly neighborId: string;
  readonly label: string;

  constructor(neighborId: string, label: string) {
    if (typeof neighborId !== 'string' || neighborId.length === 0) {
      throw new NeighborProviderError('neighborId must be a non-empty string', {
        code: NeighborProviderError.E_INVALID_NEIGHBOR_ID,
        context: { neighborId },
      });
    }
    if (typeof label !== 'string') {
      throw new NeighborProviderError('label must be a string', {
        code: NeighborProviderError.E_INVALID_NEIGHBOR_LABEL,
        context: { label },
      });
    }
    this.neighborId = neighborId;
    this.label = label;
    Object.freeze(this);
  }

  static from(edge: NeighborEdge | { readonly neighborId: string; readonly label: string }): NeighborEdge {
    return edge instanceof NeighborEdge ? edge : new NeighborEdge(edge.neighborId, edge.label);
  }
}

export type LatencyClass = 'sync' | 'async-local' | 'async-remote';

/** Port for neighbor lookups on any graph. */
export default abstract class NeighborProviderPort {
  /**
   * Returns neighbor edges for a node, sorted by (neighborId, label).
   *
   * For direction 'both', returns the union of out and in edges
   * deduped by (neighborId, label). A consumer cannot tell if an
   * edge was outgoing or incoming -- this is intentionally lossy.
   */
  abstract getNeighbors(
    _nodeId: string,
    _direction: Direction,
    _options?: NeighborOptions,
  ): Promise<NeighborEdge[]>;

  /**
   * Checks whether a node is alive in this view.
   *
   * Semantics: "alive in this view" (visible projection), NOT "ever existed."
   */
  abstract hasNode(_nodeId: string): Promise<boolean>;

  /**
   * Returns the latency class of this provider.
   *
   * Used by GraphTraversal to decide whether to enable neighbor memoization.
   * - 'sync': in-memory, no benefit from caching (e.g., AdjacencyNeighborProvider)
   * - 'async-local': disk-backed, caching avoids repeated reads (e.g., BitmapNeighborProvider)
   * - 'async-remote': network-backed, caching critical
   */
  get latencyClass(): LatencyClass {
    return 'async-local';
  }
}
