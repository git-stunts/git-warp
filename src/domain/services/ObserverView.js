/**
 * ObserverView - Read-only filtered view of a materialized WarpGraph.
 *
 * Provides an observer that sees only nodes matching a glob pattern,
 * with property visibility controlled by expose/redact lists.
 * Edges are only visible when both endpoints pass the match filter.
 *
 * @module domain/services/ObserverView
 * @see Paper IV, Section 3 -- Observers as resource-bounded functors
 */

import QueryBuilder from './QueryBuilder.js';
import LogicalTraversal from './LogicalTraversal.js';
import { orsetContains, orsetElements } from '../crdt/ORSet.js';
import { decodeEdgeKey } from './KeyCodec.js';
import { matchGlob } from '../utils/matchGlob.js';

/**
 * Filters a properties Record based on expose and redact lists.
 *
 * - If `redact` contains a key, it is excluded (highest priority).
 * - If `expose` is provided and non-empty, only keys in `expose` are included.
 * - If `expose` is absent/empty, all non-redacted keys are included.
 *
 * @param {Record<string, unknown>} propsRecord - The full properties object
 * @param {string[]|undefined} expose - Whitelist of property keys to include
 * @param {string[]|undefined} redact - Blacklist of property keys to exclude
 * @returns {Record<string, unknown>} Filtered properties object
 */
function filterProps(propsRecord, expose, redact) {
  const redactSet = redact && redact.length > 0 ? new Set(redact) : null;
  const exposeSet = expose && expose.length > 0 ? new Set(expose) : null;

  /** @type {Record<string, unknown>} */
  const filtered = {};
  for (const [key, value] of Object.entries(propsRecord)) {
    // Redact takes precedence
    if (redactSet && redactSet.has(key)) {
      continue;
    }
    // If expose is specified, only include listed keys
    if (exposeSet && !exposeSet.has(key)) {
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}

/** @typedef {{ neighborId: string, label: string }} NeighborEntry */

/**
 * Sorts a neighbor list by (neighborId, label) using strict codepoint comparison.
 *
 * @param {NeighborEntry[]} list
 */
function sortNeighbors(list) {
  list.sort((a, b) => {
    if (a.neighborId !== b.neighborId) {
      return a.neighborId < b.neighborId ? -1 : 1;
    }
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });
}

/**
 * Builds filtered adjacency maps by scanning all edges in the OR-Set.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string|string[]} pattern
 * @returns {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }}
 */
function buildAdjacencyFromEdges(state, pattern) {
  const outgoing = /** @type {Map<string, NeighborEntry[]>} */ (new Map());
  const incoming = /** @type {Map<string, NeighborEntry[]>} */ (new Map());

  for (const edgeKey of orsetElements(state.edgeAlive)) {
    const { from, to, label } = decodeEdgeKey(edgeKey);

    if (!orsetContains(state.nodeAlive, from) || !orsetContains(state.nodeAlive, to)) {
      continue;
    }
    if (!matchGlob(pattern, from) || !matchGlob(pattern, to)) {
      continue;
    }

    if (!outgoing.has(from)) { outgoing.set(from, []); }
    if (!incoming.has(to)) { incoming.set(to, []); }

    /** @type {NeighborEntry[]} */ (outgoing.get(from)).push({ neighborId: to, label });
    /** @type {NeighborEntry[]} */ (incoming.get(to)).push({ neighborId: from, label });
  }

  for (const list of outgoing.values()) { sortNeighbors(list); }
  for (const list of incoming.values()) { sortNeighbors(list); }
  return { outgoing, incoming };
}

/**
 * Processes a single node's edges into the outgoing/incoming adjacency maps.
 *
 * @param {string} id
 * @param {NeighborEntry[]} edges
 * @param {{ visibleSet: Set<string>, outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }} ctx
 */
function collectNodeEdges(id, edges, ctx) {
  const filtered = edges.filter((e) => ctx.visibleSet.has(e.neighborId));
  if (filtered.length > 0) {
    ctx.outgoing.set(id, filtered);
  }
  for (const { neighborId, label } of filtered) {
    if (!ctx.incoming.has(neighborId)) { ctx.incoming.set(neighborId, []); }
    /** @type {NeighborEntry[]} */ (ctx.incoming.get(neighborId)).push({ neighborId: id, label });
  }
}

/**
 * Builds filtered adjacency maps using a BitmapNeighborProvider.
 *
 * For each visible node, queries the provider for outgoing neighbors,
 * then post-filters by glob match. Incoming maps are derived from
 * the outgoing results to avoid duplicate provider calls.
 *
 * @param {import('./BitmapNeighborProvider.js').default} provider
 * @param {string[]} visibleNodes
 * @returns {Promise<{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }>}
 */
async function buildAdjacencyViaProvider(provider, visibleNodes) {
  const visibleSet = new Set(visibleNodes);
  const outgoing = /** @type {Map<string, NeighborEntry[]>} */ (new Map());
  const incoming = /** @type {Map<string, NeighborEntry[]>} */ (new Map());
  const ctx = { visibleSet, outgoing, incoming };

  const BATCH = 64;
  for (let i = 0; i < visibleNodes.length; i += BATCH) {
    const chunk = visibleNodes.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(id => provider.getNeighbors(id, 'out').then(edges => ({ id, edges })))
    );
    for (const { id, edges } of results) {
      collectNodeEdges(id, edges, ctx);
    }
  }

  // Provider returns pre-sorted outgoing; incoming needs sorting
  for (const list of incoming.values()) { sortNeighbors(list); }
  return { outgoing, incoming };
}

/**
 * Read-only observer view of a materialized WarpGraph state.
 *
 * Provides the same query/traverse API as WarpGraph, but filtered
 * by observer configuration (match pattern, expose, redact).
 */
export default class ObserverView {
  /**
   * Creates a new ObserverView.
   *
   * @param {{ name: string, config: { match: string|string[], expose?: string[], redact?: string[] }, graph: import('../WarpGraph.js').default }} options
   */
  constructor({ name, config, graph }) {
    /** @type {string} */
    this._name = name;

    /** @type {string|string[]} */
    this._matchPattern = config.match;

    /** @type {string[]|undefined} */
    this._expose = config.expose;

    /** @type {string[]|undefined} */
    this._redact = config.redact;

    /** @type {import('../WarpGraph.js').default} */
    this._graph = graph;

    /**
     * Cast safety: LogicalTraversal requires the following methods from the
     * graph-like object it wraps:
     *   - hasNode(nodeId): Promise<boolean>          (line ~96 in LogicalTraversal)
     *   - _materializeGraph(): Promise<{adjacency}>  (line ~94 in LogicalTraversal)
     * ObserverView implements both: hasNode() at line ~242, _materializeGraph() at line ~214.
     */
    /** @type {LogicalTraversal} */
    this.traverse = new LogicalTraversal(/** @type {import('../WarpGraph.js').default} */ (/** @type {unknown} */ (this)));
  }

  /**
   * Gets the observer name.
   * @returns {string}
   */
  get name() {
    return this._name;
  }

  // ===========================================================================
  // Internal: State access (used by QueryBuilder and LogicalTraversal)
  // ===========================================================================

  /**
   * Materializes and returns the graph details, used internally by
   * QueryBuilder and LogicalTraversal.
   *
   * Builds a filtered adjacency structure that only includes edges
   * where both endpoints pass the match filter. Uses the parent graph's
   * BitmapNeighborProvider when available for O(1) lookups with post-filter.
   *
   * @returns {Promise<{state: unknown, stateHash: string, adjacency: {outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]>}}>}
   * @private
   */
  async _materializeGraph() {
    const materialized = await /** @type {{ _materializeGraph: () => Promise<{state: import('./JoinReducer.js').WarpStateV5, stateHash: string, provider?: import('./BitmapNeighborProvider.js').default, adjacency: {outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]>}}> }} */ (this._graph)._materializeGraph();
    const { state, stateHash } = materialized;

    /** @type {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }} */
    let adjacency;

    if (materialized.provider) {
      const visibleNodes = orsetElements(state.nodeAlive)
        .filter((id) => matchGlob(this._matchPattern, id));
      adjacency = await buildAdjacencyViaProvider(materialized.provider, visibleNodes);
    } else {
      adjacency = buildAdjacencyFromEdges(state, this._matchPattern);
    }

    return { state, stateHash, adjacency };
  }

  // ===========================================================================
  // Node API
  // ===========================================================================

  /**
   * Checks if a node exists and is visible to this observer.
   *
   * @param {string} nodeId - The node ID to check
   * @returns {Promise<boolean>} True if the node exists and matches the observer pattern
   */
  async hasNode(nodeId) {
    if (!matchGlob(this._matchPattern, nodeId)) {
      return false;
    }
    return await this._graph.hasNode(nodeId);
  }

  /**
   * Gets all visible nodes that match the observer pattern.
   *
   * @returns {Promise<string[]>} Array of visible node IDs
   */
  async getNodes() {
    const allNodes = await this._graph.getNodes();
    return allNodes.filter((id) => matchGlob(this._matchPattern, id));
  }

  /**
   * Gets filtered properties for a node.
   *
   * Returns null if the node does not exist or does not match
   * the observer pattern.
   *
   * @param {string} nodeId - The node ID to get properties for
   * @returns {Promise<Record<string, unknown>|null>} Filtered properties object, or null
   */
  async getNodeProps(nodeId) {
    if (!matchGlob(this._matchPattern, nodeId)) {
      return null;
    }
    const propsRecord = await this._graph.getNodeProps(nodeId);
    if (!propsRecord) {
      return null;
    }
    return filterProps(propsRecord, this._expose, this._redact);
  }

  // ===========================================================================
  // Edge API
  // ===========================================================================

  /**
   * Gets all visible edges.
   *
   * An edge is visible only when both endpoints match the observer pattern.
   *
   * @returns {Promise<Array<{from: string, to: string, label: string, props: Record<string, unknown>}>>}
   */
  async getEdges() {
    const allEdges = await this._graph.getEdges();
    return allEdges
      .filter(
        (e) => matchGlob(this._matchPattern, e.from) && matchGlob(this._matchPattern, e.to)
      )
      .map((e) => {
        const filtered = filterProps(e.props, this._expose, this._redact);
        return { ...e, props: filtered };
      });
  }

  // ===========================================================================
  // Query API
  // ===========================================================================

  /**
   * Creates a fluent query builder operating on the filtered view.
   *
   * @returns {QueryBuilder} A query builder scoped to this observer
   */
  query() {
    /**
     * Cast safety: QueryBuilder requires the following methods from the
     * graph-like object it wraps:
     *   - getNodes(): Promise<string[]>                  (line ~680 in QueryBuilder)
     *   - getNodeProps(nodeId): Promise<Record|null>       (lines ~691, ~757, ~806 in QueryBuilder)
     *   - _materializeGraph(): Promise<{adjacency, stateHash}>  (line ~678 in QueryBuilder)
     * ObserverView implements all three: getNodes() at line ~254, getNodeProps() at line ~268,
     * _materializeGraph() at line ~214.
     */
    return new QueryBuilder(/** @type {import('../WarpGraph.js').default} */ (/** @type {unknown} */ (this)));
  }
}
