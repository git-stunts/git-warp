/**
 * Port interface for neighbor lookups on any graph.
 *
 * Concrete providers back this with in-memory adjacency maps, bitmap indexes,
 * or remote APIs. All providers MUST return edges sorted by (neighborId, label)
 * using strict codepoint comparison (never localeCompare).
 *
 * @abstract
 */

import WarpError from '../domain/errors/WarpError.ts';

/** @typedef {'out' | 'in' | 'both'} Direction */
/** @typedef {{ labels?: Set<string> }} NeighborOptions */
/** @typedef {{ neighborId: string, label: string }} NeighborEdge */

export default class NeighborProviderPort {
  /**
   * Returns neighbor edges for a node, sorted by (neighborId, label).
   *
   * For direction 'both', returns the union of out and in edges
   * deduped by (neighborId, label). A consumer cannot tell if an
   * edge was outgoing or incoming — this is intentionally lossy.
   *
   * @param {string} _nodeId - The node to look up
   * @param {Direction} _direction - Edge direction: 'out', 'in', or 'both'
   * @param {NeighborOptions} [_options] - Optional label filter
   * @returns {Promise<NeighborEdge[]>} Sorted by (neighborId, label) via codepoint comparison
   * @throws {Error} If not implemented by a concrete provider
   */
  async getNeighbors(_nodeId, _direction, _options) {
    throw new WarpError('NeighborProviderPort.getNeighbors() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Checks whether a node is alive in this view.
   *
   * Semantics: "alive in this view" (visible projection), NOT "ever existed."
   *
   * @param {string} _nodeId - The node to check
   * @returns {Promise<boolean>} True if the node is alive
   * @throws {Error} If not implemented by a concrete provider
   */
  async hasNode(_nodeId) {
    throw new WarpError('NeighborProviderPort.hasNode() not implemented', 'E_NOT_IMPLEMENTED');
  }

  /**
   * Returns the latency class of this provider.
   *
   * Used by GraphTraversal to decide whether to enable neighbor memoization.
   * - 'sync': in-memory, no benefit from caching (e.g., AdjacencyNeighborProvider)
   * - 'async-local': disk-backed, caching avoids repeated reads (e.g., BitmapNeighborProvider)
   * - 'async-remote': network-backed, caching critical
   *
   * @returns {'sync' | 'async-local' | 'async-remote'}
   */
  get latencyClass() {
    return 'async-local';
  }
}
