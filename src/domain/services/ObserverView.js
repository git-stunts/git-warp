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

/**
 * Tests whether a string matches a glob-style pattern.
 *
 * Supports `*` as a wildcard matching zero or more characters.
 * A lone `*` matches everything.
 *
 * @param {string} pattern - Glob pattern (e.g. 'user:*', '*:admin', '*')
 * @param {string} str - The string to test
 * @returns {boolean} True if the string matches the pattern
 */
function matchGlob(pattern, str) {
  if (pattern === '*') {
    return true;
  }
  if (!pattern.includes('*')) {
    return pattern === str;
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
  return regex.test(str);
}

/**
 * Filters a properties Map based on expose and redact lists.
 *
 * - If `redact` contains a key, it is excluded (highest priority).
 * - If `expose` is provided and non-empty, only keys in `expose` are included.
 * - If `expose` is absent/empty, all non-redacted keys are included.
 *
 * @param {Map<string, *>} propsMap - The full properties Map
 * @param {string[]|undefined} expose - Whitelist of property keys to include
 * @param {string[]|undefined} redact - Blacklist of property keys to exclude
 * @returns {Map<string, *>} Filtered properties Map
 */
function filterProps(propsMap, expose, redact) {
  const redactSet = redact && redact.length > 0 ? new Set(redact) : null;
  const exposeSet = expose && expose.length > 0 ? new Set(expose) : null;

  const filtered = new Map();
  for (const [key, value] of propsMap) {
    // Redact takes precedence
    if (redactSet && redactSet.has(key)) {
      continue;
    }
    // If expose is specified, only include listed keys
    if (exposeSet && !exposeSet.has(key)) {
      continue;
    }
    filtered.set(key, value);
  }
  return filtered;
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
   * @param {Object} options
   * @param {string} options.name - Observer name
   * @param {Object} options.config - Observer configuration
   * @param {string} options.config.match - Glob pattern for visible nodes
   * @param {string[]} [options.config.expose] - Property keys to include
   * @param {string[]} [options.config.redact] - Property keys to exclude (takes precedence over expose)
   * @param {import('../WarpGraph.js').default} options.graph - The source WarpGraph instance
   */
  constructor({ name, config, graph }) {
    /** @type {string} */
    this._name = name;

    /** @type {string} */
    this._matchPattern = config.match;

    /** @type {string[]|undefined} */
    this._expose = config.expose;

    /** @type {string[]|undefined} */
    this._redact = config.redact;

    /** @type {import('../WarpGraph.js').default} */
    this._graph = graph;

    /** @type {LogicalTraversal} */
    this.traverse = new LogicalTraversal(/** @type {*} */ (this)); // TODO(ts-cleanup): type observer cast
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
   * where both endpoints pass the match filter.
   *
   * @returns {Promise<{state: *, stateHash: string, adjacency: {outgoing: Map<string, *[]>, incoming: Map<string, *[]>}}>}
   * @private
   */
  async _materializeGraph() {
    const materialized = await /** @type {*} */ (this._graph)._materializeGraph(); // TODO(ts-cleanup): narrow port type
    const { state, stateHash } = materialized;

    // Build filtered adjacency: only edges where both endpoints match
    const outgoing = new Map();
    const incoming = new Map();

    for (const edgeKey of orsetElements(state.edgeAlive)) {
      const { from, to, label } = decodeEdgeKey(edgeKey);

      // Both endpoints must be alive
      if (!orsetContains(state.nodeAlive, from) || !orsetContains(state.nodeAlive, to)) {
        continue;
      }

      // Both endpoints must match the observer pattern
      if (!matchGlob(this._matchPattern, from) || !matchGlob(this._matchPattern, to)) {
        continue;
      }

      if (!outgoing.has(from)) {
        outgoing.set(from, []);
      }
      if (!incoming.has(to)) {
        incoming.set(to, []);
      }

      outgoing.get(from).push({ neighborId: to, label });
      incoming.get(to).push({ neighborId: from, label });
    }

    const sortNeighbors = (/** @type {{ neighborId: string, label: string }[]} */ list) => {
      list.sort((/** @type {{ neighborId: string, label: string }} */ a, /** @type {{ neighborId: string, label: string }} */ b) => {
        if (a.neighborId !== b.neighborId) {
          return a.neighborId < b.neighborId ? -1 : 1;
        }
        return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
      });
    };

    for (const list of outgoing.values()) {
      sortNeighbors(list);
    }
    for (const list of incoming.values()) {
      sortNeighbors(list);
    }

    return { state, stateHash, adjacency: { outgoing, incoming } };
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
   * @returns {Promise<Map<string, *>|null>} Filtered properties Map, or null
   */
  async getNodeProps(nodeId) {
    if (!matchGlob(this._matchPattern, nodeId)) {
      return null;
    }
    const propsMap = await this._graph.getNodeProps(nodeId);
    if (!propsMap) {
      return null;
    }
    return filterProps(propsMap, this._expose, this._redact);
  }

  // ===========================================================================
  // Edge API
  // ===========================================================================

  /**
   * Gets all visible edges.
   *
   * An edge is visible only when both endpoints match the observer pattern.
   *
   * @returns {Promise<Array<{from: string, to: string, label: string, props: Record<string, *>}>>}
   */
  async getEdges() {
    const allEdges = await this._graph.getEdges();
    return allEdges
      .filter(
        (e) => matchGlob(this._matchPattern, e.from) && matchGlob(this._matchPattern, e.to)
      )
      .map((e) => {
        const propsMap = new Map(Object.entries(e.props));
        const filtered = filterProps(propsMap, this._expose, this._redact);
        const filteredObj = Object.fromEntries(filtered);
        return { ...e, props: filteredObj };
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
    return new QueryBuilder(/** @type {*} */ (this)); // TODO(ts-cleanup): type observer cast
  }
}
