/**
 * Port interface for neighbor lookups on any graph.
 *
 * Concrete providers back this with in-memory adjacency maps, bitmap indexes,
 * or remote APIs. All providers MUST return edges sorted by (neighborId, label)
 * using strict codepoint comparison (never localeCompare).
 */

export type Direction = 'out' | 'in' | 'both';

export interface NeighborOptions {
  labels?: Set<string>;
}

export interface NeighborEdge {
  neighborId: string;
  label: string;
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
