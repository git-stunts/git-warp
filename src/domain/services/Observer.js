/**
 * Observer - Read-only filtered view of a materialized WarpRuntime.
 *
 * Provides an observer that sees only nodes matching a glob pattern,
 * with property visibility controlled by expose/redact lists.
 * Edges are only visible when both endpoints pass the match filter.
 *
 * @module domain/services/Observer
 * @see Paper IV, Section 3 -- Observers as resource-bounded functors
 */

import QueryBuilder from './QueryBuilder.js';
import LogicalTraversal from './LogicalTraversal.js';
import { createStateReaderV5 } from './StateReaderV5.js';
import { orsetContains, orsetElements } from '../crdt/ORSet.js';
import { decodeEdgeKey } from './KeyCodec.js';
import { matchGlob } from '../utils/matchGlob.js';
/** @typedef {import('../../../index.js').WorldlineSource} WorldlineSource */

/**
 * Clones an observer worldline source descriptor, producing an independent copy.
 * @param {{
 *   kind: 'live',
 *   ceiling?: number|null
 * } | {
 *   kind: 'coordinate',
 *   frontier: Map<string, string>|Record<string, string>,
 *   ceiling?: number|null
 * } | {
 *   kind: 'strand',
 *   strandId: string,
 *   ceiling?: number|null
 * } | {
 *   kind: 'strand',
 *   strandId: string,
 *   ceiling?: number|null
 * } | null | undefined} source
 * @returns {{
 *   kind: 'live',
 *   ceiling?: number|null
 * } | {
 *   kind: 'coordinate',
 *   frontier: Map<string, string>|Record<string, string>,
 *   ceiling?: number|null
 * } | {
 *   kind: 'strand',
 *   strandId: string,
 *   ceiling?: number|null
 * } | null}
 */
function cloneObserverSource(source) {
  if (source === null || source === undefined) {
    return null;
  }
  return cloneNonNullSource(source);
}

/**
 * Clones a live source descriptor.
 * @param {{ ceiling?: number|null }} source
 * @returns {{ kind: 'live', ceiling?: number|null }}
 */
function cloneLiveSource(source) {
  return 'ceiling' in source
    ? { kind: 'live', ceiling: source.ceiling ?? null }
    : { kind: 'live' };
}

/**
 * Clones a coordinate source descriptor, deep-copying the frontier.
 * @param {{ frontier?: Map<string, string>|Record<string, string>, ceiling?: number|null }} source
 * @returns {{ kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling: number|null }}
 */
function cloneCoordinateSource(source) {
  return {
    kind: 'coordinate',
    frontier: source.frontier instanceof Map
      ? new Map(source.frontier)
      : { .../** @type {Record<string, string>} */ (source.frontier) },
    ceiling: source.ceiling ?? null,
  };
}

/**
 * Clones a non-null observer source descriptor.
 * @param {{
 *   kind: 'live' | 'coordinate' | 'strand',
 *   ceiling?: number|null,
 *   frontier?: Map<string, string>|Record<string, string>,
 *   strandId?: string
 * }} source
 * @returns {{
 *   kind: 'live',
 *   ceiling?: number|null
 * } | {
 *   kind: 'coordinate',
 *   frontier: Map<string, string>|Record<string, string>,
 *   ceiling?: number|null
 * } | {
 *   kind: 'strand',
 *   strandId: string,
 *   ceiling?: number|null
 * }}
 */
function cloneNonNullSource(source) {
  if (source.kind === 'live') {
    return cloneLiveSource(source);
  }
  if (source.kind === 'coordinate') {
    return cloneCoordinateSource(source);
  }
  return {
    kind: 'strand',
    strandId: /** @type {string} */ (source.strandId),
    ceiling: source.ceiling ?? null,
  };
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
 * @param {{ state: import('./JoinReducer.js').WarpStateV5, pattern: string|string[] }} ctx
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function isVisibleEdge(ctx, from, to) {
  return orsetContains(ctx.state.nodeAlive, from) &&
    orsetContains(ctx.state.nodeAlive, to) &&
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
 * @param {import('./JoinReducer.js').WarpStateV5} state
 * @param {string|string[]} pattern
 * @returns {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }}
 */
function buildAdjacencyFromEdges(state, pattern) {
  const outgoing = /** @type {Map<string, NeighborEntry[]>} */ (new Map());
  const incoming = /** @type {Map<string, NeighborEntry[]>} */ (new Map());
  const ctx = { state, pattern };

  for (const edgeKey of orsetElements(state.edgeAlive)) {
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
 * Read-only observer view of a materialized WarpRuntime state.
 *
 * Provides the same query/traverse API as WarpRuntime, but filtered
 * by observer configuration (match pattern, expose, redact).
 */
export default class Observer {
  /**
   * Creates a new Observer.
   *
   * @param {{ name: string, config: { match: string|string[], expose?: string[], redact?: string[] }, graph?: import('../WarpRuntime.js').default, snapshot?: { state: import('./JoinReducer.js').WarpStateV5, stateHash: string }, source?: { kind: 'live', ceiling?: number|null } | { kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null } | { kind: 'strand', strandId: string, ceiling?: number|null } }} options
   */
  constructor({ name, config, graph, snapshot, source }) {
    this._preInitFields();
    this._initIdentity(name, config);
    this._initBacking(graph, snapshot, source);

    /**
     * Cast safety: LogicalTraversal requires hasNode() and _materializeGraph(),
     * both of which Observer implements.
     * @type {LogicalTraversal}
     */
    this.traverse = new LogicalTraversal(/** @type {import('../WarpRuntime.js').default} */ (/** @type {unknown} */ (this)));
    // Reference: LogicalTraversal calls _materializeGraph() on the cast-to-WarpRuntime object.
    void this._materializeGraph;
  }

  /**
   * Pre-initializes all instance fields so TSC can infer definite assignment
   * even though final values are set in _initIdentity and _initBacking.
   * @private
   */
  _preInitFields() {
    /** @type {string} */
    this._name = 'observer';
    /** @type {string|string[]} */
    this._matchPattern = '*';
    /** @type {string[]|undefined} */
    this._expose = undefined;
    /** @type {string[]|undefined} */
    this._redact = undefined;
    /** @type {import('../WarpRuntime.js').default|null} */
    this._graph = null;
    /** @type {{ state: import('./JoinReducer.js').WarpStateV5, stateHash: string }|null} */
    this._snapshot = null;
    /** @type {{ kind: 'live', ceiling?: number|null } | { kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null } | { kind: 'strand', strandId: string, ceiling?: number|null } | null} */
    this._source = null;
    /** @type {import('../../../index.js').VisibleStateReaderV5|null} */
    this._stateReader = null;
    /** @type {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }|null} */
    this._snapshotAdjacency = null;
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
   * @param {import('../WarpRuntime.js').default|undefined} graph
   * @param {{ state: import('./JoinReducer.js').WarpStateV5, stateHash: string }|undefined} snapshot
   * @param {{ kind: 'live', ceiling?: number|null } | { kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null } | { kind: 'strand', strandId: string, ceiling?: number|null } | undefined} source
   * @private
   */
  _initBacking(graph, snapshot, source) {
    /** @type {import('../WarpRuntime.js').default|null} */
    this._graph = graph || null;
    /** @type {{ state: import('./JoinReducer.js').WarpStateV5, stateHash: string }|null} */
    this._snapshot = snapshot || null;
    /** @type {{ kind: 'live', ceiling?: number|null } | { kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null } | { kind: 'strand', strandId: string, ceiling?: number|null } | null} */
    this._source = cloneObserverSource(source || { kind: 'live' });
    /** @type {import('../../../index.js').VisibleStateReaderV5|null} */
    this._stateReader = snapshot ? createStateReaderV5(snapshot.state) : null;
    /** @type {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }|null} */
    this._snapshotAdjacency = null;
  }

  /**
   * Gets the observer name.
   * @returns {string}
   */
  get name() {
    return this._name ?? 'observer';
  }

  /**
   * Gets the effective pinned source for this observer.
   *
   * @returns {{ kind: 'live', ceiling?: number|null } | { kind: 'coordinate', frontier: Map<string, string>|Record<string, string>, ceiling?: number|null } | { kind: 'strand', strandId: string, ceiling?: number|null } | null}
   */
  get source() {
    return cloneObserverSource(this._source);
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
   * @returns {import('../WarpRuntime.js').default}
   * @private
   */
  _requireGraph() {
    if (!this._graph) {
      throw new Error('Observer has no live backing graph');
    }
    return this._graph;
  }

  /**
   * Returns the match pattern, guaranteed non-undefined.
   * @returns {string|string[]}
   * @private
   */
  _getPattern() {
    return this._matchPattern ?? '*';
  }

  /**
   * Builds a config snapshot from the current observer's filter state.
   * @returns {{ match: string|string[], expose?: string[], redact?: string[] }}
   * @private
   */
  _buildConfigSnapshot() {
    /** @type {{ match: string|string[], expose?: string[], redact?: string[] }} */
    const config = {
      match: Array.isArray(this._matchPattern) ? [...this._matchPattern] : (this._matchPattern ?? '*'),
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
    /** @type {WorldlineSource|null} */
    const nextSource = options?.source
      ? cloneObserverSource(/** @type {WorldlineSource} */ (options.source))
      : { kind: 'live' };
    if (nextSource === null) {
      throw new Error('observer seek requires a non-null source');
    }

    return await graph.observer(this.name, config, { source: nextSource });
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
        this._snapshotAdjacency = buildAdjacencyFromEdges(this._snapshot.state, this._getPattern());
      }
      return {
        state: this._snapshot.state,
        stateHash: this._snapshot.stateHash,
        adjacency: this._snapshotAdjacency,
      };
    }

    const graph = this._requireGraph();
    const materialized = await /** @type {{ _materializeGraph: () => Promise<{state: import('./JoinReducer.js').WarpStateV5, stateHash: string, provider?: import('./BitmapNeighborProvider.js').default, adjacency: {outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]>}}> }} */ (graph)._materializeGraph();
    const { state, stateHash } = materialized;

    /** @type {{ outgoing: Map<string, NeighborEntry[]>, incoming: Map<string, NeighborEntry[]> }} */
    let adjacency;

    if (materialized.provider) {
      const visibleNodes = orsetElements(state.nodeAlive)
        .filter((id) => matchGlob(this._getPattern(), id));
      adjacency = await buildAdjacencyViaProvider(materialized.provider, visibleNodes);
    } else {
      adjacency = buildAdjacencyFromEdges(state, this._getPattern());
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
    if (!matchGlob(this._getPattern(), nodeId)) {
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
    return allNodes.filter((id) => matchGlob(this._getPattern(), id));
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
    if (!matchGlob(this._getPattern(), nodeId)) {
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
        (e) => matchGlob(this._getPattern(), e.from) && matchGlob(this._getPattern(), e.to)
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
    return new QueryBuilder(/** @type {import('../WarpRuntime.js').default} */ (/** @type {unknown} */ (this)));
  }
}
