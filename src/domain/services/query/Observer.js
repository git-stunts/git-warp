/**
 * Observer - Read-only filtered view of a materialized WarpRuntime.
 *
 * Provides an observer that sees only nodes matching a glob pattern,
 * with property visibility controlled by expose/redact lists.
 * Edges are only visible when both endpoints pass the match filter.
 *
 * @module domain/services/query/Observer
 * @see Paper IV, Section 3 -- Observers as resource-bounded functors
 */

import QueryBuilder from './QueryBuilder.js';
import LogicalTraversal from './LogicalTraversal.ts';
import { createStateReaderV5 } from '../state/StateReaderV5.js';
import { decodeEdgeKey } from '../KeyCodec.js';
import { matchGlob } from '../../utils/matchGlob.ts';
import QueryError from '../../errors/QueryError.ts';


import WorldlineSelector from '../../types/WorldlineSelector.ts';
import LiveSelector from '../../types/LiveSelector.ts';

/**
 * Converts a raw source to a WorldlineSelector, or returns null.
 *
 * @param {WorldlineSelector|{ kind: string, [key: string]: unknown }|null|undefined} source
 * @returns {WorldlineSelector|null}
 */
function toSelector(source) {
  if (source === null || source === undefined) {
    return null;
  }
  return WorldlineSelector.from(source).clone();
}

/**
 * Creates a Set from a non-empty string array, or null if empty/undefined.
 * @param {string[]|undefined} list
 * @returns {Set<string>|null}
 */
function toFilterSet(list) {
  return Array.isArray(list) && list.length > 0 ? new Set(list) : null;
}

/**
 * Checks whether a property key passes the expose/redact filter.
 * @param {string} key
 * @param {Set<string>|null} redactSet
 * @param {Set<string>|null} exposeSet
 * @returns {boolean}
 */
function isKeyVisible(key, redactSet, exposeSet) {
  if (redactSet !== null && redactSet.has(key)) {
    return false;
  }
  if (exposeSet !== null && !exposeSet.has(key)) {
    return false;
  }
  return true;
}

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
  const redactSet = toFilterSet(redact);
  const exposeSet = toFilterSet(expose);

  /** @type {Record<string, unknown>} */
  const filtered = {};
  for (const [key, value] of Object.entries(propsRecord)) {
    if (isKeyVisible(key, redactSet, exposeSet)) {
      filtered[key] = value;
    }
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
 * Checks whether both edge endpoints are alive and match the glob pattern.
 * @param {{ state: import('../JoinReducer.ts').WarpState, pattern: string|string[] }} ctx
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function isVisibleEdge(ctx, from, to) {
  return ctx.state.nodeAlive.contains(from) &&
    ctx.state.nodeAlive.contains(to) &&
    matchGlob(ctx.pattern, from) &&
    matchGlob(ctx.pattern, to);
}

/**
 * Pushes a neighbor entry into an adjacency map, creating the list if needed.
 * @param {Map<string, NeighborEntry[]>} map
 * @param {string} key
 * @param {NeighborEntry} entry
 */
function pushAdjacencyEntry(map, key, entry) {
  if (!map.has(key)) { map.set(key, []); }
  /** @type {NeighborEntry[]} */ (map.get(key)).push(entry);
}

/**
 * Builds filtered adjacency maps by scanning all edges in the OR-Set.
 *
 * @param {import('../JoinReducer.ts').WarpState} state
 * @param {string|string[]} pattern
 * @returns {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }}
 */
function buildAdjacencyFromEdges(state, pattern) {
  const outgoing = /** @type {Map<string, NeighborEntry[]>} */ (new Map());
  const incoming = /** @type {Map<string, NeighborEntry[]>} */ (new Map());
  const ctx = { state, pattern };

  for (const edgeKey of state.edgeAlive.elements()) {
    const { from, to, label } = decodeEdgeKey(edgeKey);

    if (!isVisibleEdge(ctx, from, to)) {
      continue;
    }

    pushAdjacencyEntry(outgoing, from, { neighborId: to, label });
    pushAdjacencyEntry(incoming, to, { neighborId: from, label });
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
 * @param {import('../index/BitmapNeighborProvider.js').default} provider
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
 * Read-only observer view of a materialized WarpRuntime state.
 *
 * Provides the same query/traverse API as WarpRuntime, but filtered
 * by observer configuration (match pattern, expose, redact).
 */
export default class Observer {
  /**
   * Creates a new Observer.
   *
   * @param {{ name: string, config: { match: string|string[], expose?: string[], redact?: string[] }, graph?: import('../../WarpRuntime.js').default, snapshot?: { state: import('../JoinReducer.ts').WarpState, stateHash: string }, source?: { kind: 'live', ceiling?: number|null } | { kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null } | { kind: 'strand', strandId: string, ceiling?: number|null } }} options
   */
  constructor({ name, config, graph, snapshot, source }) {
    this._initIdentity(name, config);
    this._initBacking(graph, snapshot, source);
    // Referenced via duck-typing cast (LogicalTraversal, QueryBuilder) — suppress TS6133
    void this._materializeGraph;

    /**
     * Cast safety: LogicalTraversal requires hasNode() and _materializeGraph(),
     * both of which Observer implements.
     * @type {LogicalTraversal}
     */
    this.traverse = new LogicalTraversal(/** @type {import('../../WarpRuntime.js').default} */ (/** @type {unknown} */ (this)));
  }

  /**
   * Initializes observer identity and filter configuration.
   * @param {string} name
   * @param {{ match: string|string[], expose?: string[], redact?: string[] }} config
   * @private
   */
  _initIdentity(name, config) {
    /** @type {string} */
    this._name = name ?? 'observer';
    /** @type {string|string[]} */
    this._matchPattern = Array.isArray(config.match) ? [...config.match] : config.match;
    /** @type {string[]|undefined} */
    this._expose = config.expose ? [...config.expose] : undefined;
    /** @type {string[]|undefined} */
    this._redact = config.redact ? [...config.redact] : undefined;
  }

  /**
   * Initializes the backing graph, snapshot, and source state.
   * @param {import('../../WarpRuntime.js').default|undefined} graph
   * @param {{ state: import('../JoinReducer.ts').WarpState, stateHash: string }|undefined} snapshot
   * @param {import('../../types/WorldlineSelector.ts').default|import('../../../../index.js').WorldlineSource|undefined} source
   * @private
   */
  _initBacking(graph, snapshot, source) {
    /** @type {import('../../WarpRuntime.js').default|null} */
    this._graph = graph || null;
    /** @type {{ state: import('../JoinReducer.ts').WarpState, stateHash: string }|null} */
    this._snapshot = snapshot || null;
    /** @type {WorldlineSelector|null} */
    this._source = toSelector(/** @type {WorldlineSelector|{ kind: string, [key: string]: unknown }} */ (source || new LiveSelector()));
    /** @type {import('../../../../index.js').VisibleStateReaderV5|null} */
    this._stateReader = snapshot ? createStateReaderV5(snapshot.state) : null;
    /** @type {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }|null} */
    this._snapshotAdjacency = null;
  }

  /**
   * Gets the observer name.
   * @returns {string}
   */
  get name() {
    return /** @type {string} */ (this._name);
  }

  /**
   * Gets the effective pinned source for this observer.
   *
   * @returns {import('../../../../index.js').WorldlineSource|null}
   */
  get source() {
    return this._source ? /** @type {import('../../../../index.js').WorldlineSource} */ (this._source.toDTO()) : null;
  }

  /**
   * Gets the pinned snapshot hash when this observer is snapshot-backed.
   *
   * @returns {string|null}
   */
  get stateHash() {
    return this._snapshot ? this._snapshot.stateHash : null;
  }

  /**
   * Returns the live backing graph when this observer was created in delegate mode.
   *
   * @returns {import('../../WarpRuntime.js').default}
   * @private
   */
  _requireGraph() {
    if (!this._graph) {
      throw new QueryError(
        'Observer has no live backing graph',
        { code: 'E_OBSERVER_NO_GRAPH' },
      );
    }
    return this._graph;
  }

  /**
   * Builds a config snapshot from the current observer's filter state.
   * @returns {{ match: string|string[], expose?: string[], redact?: string[] }}
   * @private
   */
  _buildConfigSnapshot() {
    /** @type {{ match: string|string[], expose?: string[], redact?: string[] }} */
    const config = {
      match: Array.isArray(this._matchPattern) ? [...this._matchPattern] : /** @type {string|string[]} */ (this._matchPattern),
    };
    if (this._expose) { config.expose = [...this._expose]; }
    if (this._redact) { config.redact = [...this._redact]; }
    return config;
  }

  /**
   * Creates a new observer over the same aperture at a different source.
   *
   * When no explicit source is supplied, seek targets current live truth.
   *
   * @param {{ source?: { kind: 'live', ceiling?: number|null } | { kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null } | { kind: 'strand', strandId: string, ceiling?: number|null } }} [options]
   * @returns {Promise<Observer>}
   */
  async seek(options = undefined) {
    const graph = this._requireGraph();
    const config = this._buildConfigSnapshot();
    /** @type {WorldlineSelector} */
    const nextSource = options?.source
      ? WorldlineSelector.from(options.source).clone()
      : new LiveSelector();

     
    return await graph.observer(/** @type {string} */ (this._name), config, { source: /** @type {import('../../../../index.js').WorldlineSource} */ (nextSource.toDTO()) });
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
    if (this._snapshot) {
      if (!this._snapshotAdjacency) {
        this._snapshotAdjacency = buildAdjacencyFromEdges(this._snapshot.state, /** @type {string|string[]} */ (this._matchPattern));
      }
      return {
        state: this._snapshot.state,
        stateHash: this._snapshot.stateHash,
        adjacency: this._snapshotAdjacency,
      };
    }

    const graph = this._requireGraph();
    const materialized = await /** @type {{ _materializeGraph: () => Promise<{state: import('../JoinReducer.ts').WarpState, stateHash: string, provider?: import('../index/BitmapNeighborProvider.js').default, adjacency: {outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]>}}> }} */ (graph)._materializeGraph();
    const { state, stateHash } = materialized;

    /** @type {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }} */
    let adjacency;

    if (materialized.provider) {
      const visibleNodes = state.nodeAlive.elements()
        .filter((id) => matchGlob(/** @type {string|string[]} */ (this._matchPattern), id));
      adjacency = await buildAdjacencyViaProvider(materialized.provider, visibleNodes);
    } else {
      adjacency = buildAdjacencyFromEdges(state, /** @type {string|string[]} */ (this._matchPattern));
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
    if (!matchGlob(/** @type {string|string[]} */ (this._matchPattern), nodeId)) {
      return false;
    }
    if (this._stateReader) {
      return this._stateReader.hasNode(nodeId);
    }
    return await this._requireGraph().hasNode(nodeId);
  }

  /**
   * Gets all visible nodes that match the observer pattern.
   *
   * @returns {Promise<string[]>} Array of visible node IDs
   */
  async getNodes() {
    const allNodes = this._stateReader
      ? this._stateReader.getNodes()
      : await this._requireGraph().getNodes();
    return allNodes.filter((id) => matchGlob(/** @type {string|string[]} */ (this._matchPattern), id));
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
    if (!matchGlob(/** @type {string|string[]} */ (this._matchPattern), nodeId)) {
      return null;
    }
    const propsRecord = this._stateReader
      ? this._stateReader.getNodeProps(nodeId)
      : await this._requireGraph().getNodeProps(nodeId);
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
    const allEdges = this._stateReader
      ? this._stateReader.getEdges()
      : await this._requireGraph().getEdges();
    return allEdges
      .filter(
        (e) => matchGlob(/** @type {string|string[]} */ (this._matchPattern), e.from) && matchGlob(/** @type {string|string[]} */ (this._matchPattern), e.to)
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
     * Observer implements all three: getNodes() at line ~254, getNodeProps() at line ~268,
     * _materializeGraph() at line ~214.
     */
    return new QueryBuilder(/** @type {import('../../WarpRuntime.js').default} */ (/** @type {unknown} */ (this)));
  }
}
