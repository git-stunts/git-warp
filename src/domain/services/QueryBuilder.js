/**
 * QueryBuilder - Fluent query builder for materialized WARP state.
 *
 * Supports deterministic, multi-hop traversal over the logical graph.
 */

import QueryError from '../errors/QueryError.js';
import { matchGlob } from '../utils/matchGlob.js';

const DEFAULT_PATTERN = '*';

/**
 * Processes items in batches with bounded concurrency.
 *
 * @template T, R
 * @param {T[]} items - Items to process
 * @param {(item: T) => Promise<R>} fn - Async function to apply to each item
 * @param {number} [limit=100] - Maximum concurrent operations per batch
 * @returns {Promise<R[]>} Results in input order
 */
async function batchMap(items, fn, limit = 100) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(fn));
    for (const r of batchResults) {
      results.push(r);
    }
  }
  return results;
}

/**
 * @typedef {Object} QueryNodeSnapshot
 * @property {string} id - The unique identifier of the node
 * @property {Record<string, unknown>} props - Frozen snapshot of node properties
 * @property {ReadonlyArray<{label: string, to?: string, from?: string}>} edgesOut - Outgoing edges sorted by label then target
 * @property {ReadonlyArray<{label: string, to?: string, from?: string}>} edgesIn - Incoming edges sorted by label then source
 */

/**
 * @typedef {Object} AdjacencyMaps
 * @property {Map<string, Array<{label: string, neighborId: string}>>} outgoing - Map of node ID to outgoing edges
 * @property {Map<string, Array<{label: string, neighborId: string}>>} incoming - Map of node ID to incoming edges
 */

/**
 * @typedef {Object} AggregateSpec
 * @property {boolean} [count] - If true, include count of matched nodes
 * @property {string} [sum] - Property path to sum (e.g., "props.price" or "price")
 * @property {string} [avg] - Property path to average
 * @property {string} [min] - Property path to find minimum
 * @property {string} [max] - Property path to find maximum
 */

/**
 * @typedef {Object} QueryResult
 * @property {string} stateHash - Hash of the materialized state at query time
 * @property {Array<{id?: string, props?: Record<string, unknown>}>} nodes - Matched nodes (absent when aggregating)
 */

/**
 * @typedef {Object} AggregateResult
 * @property {string} stateHash - Hash of the materialized state at query time
 * @property {number} [count] - Count of matched nodes (if requested)
 * @property {number} [sum] - Sum of property values (if requested)
 * @property {number} [avg] - Average of property values (if requested)
 * @property {number} [min] - Minimum property value (if requested)
 * @property {number} [max] - Maximum property value (if requested)
 */

/**
 * Asserts that a match pattern is a string or array of strings.
 *
 * @param {unknown} pattern - The pattern to validate
 * @throws {QueryError} If pattern is not a string or array of strings (code: E_QUERY_MATCH_TYPE)
 * @private
 */
function assertMatchPattern(pattern) {
  const isString = typeof pattern === 'string';
  const isStringArray = Array.isArray(pattern) && pattern.every((p) => typeof p === 'string');

  if (!isString && !isStringArray) {
    throw new QueryError('match() expects a string pattern or array of string patterns', {
      code: 'E_QUERY_MATCH_TYPE',
      context: { receivedType: typeof pattern },
    });
  }
}

/**
 * Asserts that a predicate is either a function or a plain object.
 *
 * @param {unknown} fn - The predicate to validate
 * @throws {QueryError} If fn is neither a function nor a plain object (code: E_QUERY_WHERE_TYPE)
 * @private
 */
function assertPredicate(fn) {
  if (typeof fn !== 'function' && !isPlainObject(fn)) {
    throw new QueryError('where() expects a predicate function or object', {
      code: 'E_QUERY_WHERE_TYPE',
      context: { receivedType: typeof fn },
    });
  }
}

/**
 * Checks whether a value is a plain JavaScript object (not null, not an array).
 *
 * @param {unknown} value - The value to check
 * @returns {boolean} True if value is a non-null, non-array object
 * @private
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks whether a value is a JavaScript primitive (null, string, number, boolean, symbol, bigint, or undefined).
 *
 * @param {unknown} value - The value to check
 * @returns {boolean} True if value is null or not an object/function
 * @private
 */
function isPrimitive(value) {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

/**
 * Converts a plain object to a predicate function for use in where() clauses.
 *
 * The returned predicate checks that all key-value pairs in the object match
 * the corresponding properties in a node's props. Uses strict equality (===).
 *
 * @param {Record<string, unknown>} obj - Object with property constraints (all values must be primitives)
 * @returns {(node: QueryNodeSnapshot) => boolean} Predicate function that returns true if all constraints match
 * @throws {QueryError} If any value in obj is not a primitive (code: E_QUERY_WHERE_VALUE_TYPE)
 * @private
 */
function objectToPredicate(obj) {
  const entries = Object.entries(obj);
  for (const [key, value] of entries) {
    if (!isPrimitive(value)) {
      throw new QueryError(
        'where() object shorthand only accepts primitive property values',
        {
          code: 'E_QUERY_WHERE_VALUE_TYPE',
          context: { key, receivedType: typeof value },
        }
      );
    }
  }
  return ({ props }) => {
    for (const [key, value] of entries) {
      if (!(key in props) || props[key] !== value) {
        return false;
      }
    }
    return true;
  };
}

/**
 * Asserts that an edge label is either undefined or a string.
 *
 * @param {unknown} label - The label to validate
 * @throws {QueryError} If label is defined but not a string (code: E_QUERY_LABEL_TYPE)
 * @private
 */
function assertLabel(label) {
  if (label === undefined) {
    return;
  }
  if (typeof label !== 'string') {
    throw new QueryError('label must be a string', {
      code: 'E_QUERY_LABEL_TYPE',
      context: { receivedType: typeof label },
    });
  }
}

/**
 * Sorts an iterable of node IDs lexicographically for deterministic output.
 *
 * @param {Iterable<string>} ids - The node IDs to sort
 * @returns {string[]} New sorted array of IDs
 * @private
 */
function sortIds(ids) {
  return [...ids].sort();
}

/**
 * Recursively freezes an object and all nested objects/arrays.
 *
 * Already-frozen objects are skipped to avoid redundant work.
 * Non-objects and null values are returned unchanged.
 *
 * @template T
 * @param {T} obj - The object to freeze
 * @returns {T} The same object, now deeply frozen
 * @private
 */
function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object' || Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepFreeze(item);
    }
  } else {
    for (const value of Object.values(obj)) {
      deepFreeze(value);
    }
  }
  return obj;
}

/**
 * Creates a deep clone of a value.
 *
 * Results are deep-frozen to prevent accidental mutation of cached state.
 * structuredClone is preferred; JSON round-trip is the fallback for
 * environments without structuredClone support.
 *
 * Attempts structuredClone first (Node 17+ / modern browsers), falls back
 * to JSON round-trip, and returns the original value if both fail (e.g.,
 * for values containing functions or circular references).
 *
 * Primitives are returned as-is without cloning.
 *
 * @template T
 * @param {T} value - The value to clone
 * @returns {T} A deep clone of the value, or the original if cloning fails
 * @private
 */
function cloneValue(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // fall through to JSON clone
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

/**
 * Builds a frozen, deterministic snapshot of node properties from a Record.
 *
 * Keys are sorted lexicographically for deterministic iteration order.
 * Values are deep-cloned to prevent mutation of the original state.
 *
 * @param {Record<string, unknown>} propsRecord - Object of property names to values
 * @returns {Readonly<Record<string, unknown>>} Frozen object with sorted keys and cloned values
 * @private
 */
function buildPropsSnapshot(propsRecord) {
  /** @type {Record<string, unknown>} */
  const props = Object.create(null);
  const keys = Object.keys(propsRecord).sort();
  for (const key of keys) {
    props[key] = cloneValue(propsRecord[key]);
  }
  return deepFreeze(props);
}

/**
 * Builds a frozen, sorted snapshot of edges for a node.
 *
 * Edges are sorted first by label (lexicographically), then by peer node ID.
 * This ensures deterministic ordering for query results.
 *
 * @param {Array<{label: string, neighborId?: string, to?: string, from?: string}>} edges - Array of edge objects
 * @param {'to' | 'from'} directionKey - The key to use for the peer node ID in the output
 * @returns {ReadonlyArray<{label: string, to?: string, from?: string}>} Frozen array of edge snapshots
 * @private
 */
function buildEdgesSnapshot(edges, directionKey) {
  const list = edges.map((edge) => ({
    label: edge.label,
    [directionKey]: edge.neighborId ?? edge[directionKey],
  }));
  list.sort((a, b) => {
    if (a.label !== b.label) {
      return a.label < b.label ? -1 : 1;
    }
    const aPeer = /** @type {string} */ (a[directionKey]);
    const bPeer = /** @type {string} */ (b[directionKey]);
    return aPeer < bPeer ? -1 : aPeer > bPeer ? 1 : 0;
  });
  return deepFreeze(list);
}

/**
 * Creates a complete frozen snapshot of a node for use in query predicates.
 *
 * The snapshot includes the node's ID, properties, outgoing edges, and incoming edges.
 * All data is deeply frozen to prevent mutation.
 *
 * @param {{ id: string, propsRecord: Record<string, unknown>, edgesOut: Array<{label: string, neighborId: string}>, edgesIn: Array<{label: string, neighborId: string}> }} params - Node data
 * @returns {Readonly<QueryNodeSnapshot>} Frozen node snapshot
 * @private
 */
function createNodeSnapshot({ id, propsRecord, edgesOut, edgesIn }) {
  const props = buildPropsSnapshot(propsRecord);
  const edgesOutSnapshot = buildEdgesSnapshot(edgesOut, 'to');
  const edgesInSnapshot = buildEdgesSnapshot(edgesIn, 'from');

  return deepFreeze({
    id,
    props,
    edgesOut: edgesOutSnapshot,
    edgesIn: edgesInSnapshot,
  });
}

/**
 * Normalizes a depth specification into a [min, max] tuple.
 *
 * Accepts:
 * - undefined: defaults to [1, 1] (single hop)
 * - number n: normalized to [n, n] (exactly n hops)
 * - [min, max]: used as-is (range of hops)
 *
 * @param {number | [number, number] | undefined} depth - The depth specification
 * @returns {[number, number]} Tuple of [minDepth, maxDepth]
 * @throws {QueryError} If depth is not a non-negative integer (code: E_QUERY_DEPTH_TYPE)
 * @throws {QueryError} If depth array values are not non-negative integers (code: E_QUERY_DEPTH_TYPE)
 * @throws {QueryError} If min > max in a depth array (code: E_QUERY_DEPTH_RANGE)
 * @throws {QueryError} If depth is neither a number nor a valid [min, max] array (code: E_QUERY_DEPTH_TYPE)
 * @private
 */
function normalizeDepth(depth) {
  if (depth === undefined) {
    return [1, 1];
  }
  if (typeof depth === 'number') {
    if (!Number.isInteger(depth) || depth < 0) {
      throw new QueryError('depth must be a non-negative integer', {
        code: 'E_QUERY_DEPTH_TYPE',
        context: { value: depth },
      });
    }
    return [depth, depth];
  }
  if (Array.isArray(depth) && depth.length === 2) {
    const [min, max] = depth;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 0) {
      throw new QueryError('depth values must be non-negative integers', {
        code: 'E_QUERY_DEPTH_TYPE',
        context: { value: depth },
      });
    }
    if (min > max) {
      throw new QueryError('depth min must be <= max', {
        code: 'E_QUERY_DEPTH_RANGE',
        context: { min, max },
      });
    }
    return [min, max];
  }
  throw new QueryError('depth must be a number or [min, max] array', {
    code: 'E_QUERY_DEPTH_TYPE',
    context: { receivedType: typeof depth, value: depth },
  });
}

/**
 * Applies a single-hop traversal from a working set of nodes.
 *
 * Collects all neighbors reachable via one edge in the specified direction,
 * optionally filtered by edge label.
 *
 * @param {{ direction: 'outgoing' | 'incoming', label: string | undefined, workingSet: string[], adjacency: AdjacencyMaps }} params - Traversal parameters
 * @returns {string[]} Sorted array of neighbor node IDs
 * @private
 */
function applyHop({ direction, label, workingSet, adjacency }) {
  const next = new Set();
  const source = direction === 'outgoing' ? adjacency.outgoing : adjacency.incoming;
  const labelFilter = label === undefined ? null : label;

  for (const nodeId of workingSet) {
    const edges = source.get(nodeId) || [];
    for (const edge of edges) {
      if (labelFilter && edge.label !== labelFilter) {
        continue;
      }
      next.add(edge.neighborId);
    }
  }

  return sortIds(next);
}

/**
 * Applies a multi-hop BFS traversal from a working set of nodes.
 *
 * Performs breadth-first traversal up to maxDepth hops, collecting nodes
 * that fall within the [minDepth, maxDepth] range. Each node is visited
 * at most once (cycle-safe).
 *
 * If minDepth is 0, the starting nodes themselves are included in the result.
 *
 * @param {{ direction: 'outgoing' | 'incoming', label: string | undefined, workingSet: string[], adjacency: AdjacencyMaps, depth: [number, number] }} params - Traversal parameters
 * @returns {string[]} Sorted array of reachable node IDs within the depth range
 * @private
 */
function applyMultiHop({ direction, label, workingSet, adjacency, depth }) {
  const [minDepth, maxDepth] = depth;
  const source = direction === 'outgoing' ? adjacency.outgoing : adjacency.incoming;
  const labelFilter = label === undefined ? null : label;

  const result = new Set();
  let currentLevel = new Set(workingSet);
  const visited = new Set(workingSet);

  if (minDepth === 0) {
    for (const nodeId of workingSet) {
      result.add(nodeId);
    }
  }

  for (let hop = 1; hop <= maxDepth; hop++) {
    const nextLevel = new Set();
    for (const nodeId of currentLevel) {
      const edges = source.get(nodeId) || [];
      for (const edge of edges) {
        if (labelFilter && edge.label !== labelFilter) {
          continue;
        }
        const neighbor = edge.neighborId;
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        nextLevel.add(neighbor);
        if (hop >= minDepth) {
          result.add(neighbor);
        }
      }
    }
    currentLevel = nextLevel;
    if (currentLevel.size === 0) {
      break;
    }
  }

  return sortIds(result);
}

/**
 * Fluent query builder for materialized WARP state.
 *
 * Supports pattern matching, predicate filtering, multi-hop traversal
 * over outgoing/incoming edges, and field selection.
 *
 * @throws {QueryError} On invalid match patterns, where predicates, label types, or select fields
 */
export default class QueryBuilder {
  /**
   * Creates a new QueryBuilder.
   *
   * @param {import('../WarpGraph.js').default} graph - The WarpGraph instance to query
   */
  constructor(graph) {
    this._graph = graph;
    /** @type {string|string[]|null} */
    this._pattern = null;
    /** @type {Array<{type: string, fn?: (node: QueryNodeSnapshot) => boolean, label?: string, depth?: [number, number]}>} */
    this._operations = [];
    /** @type {string[]|null} */
    this._select = null;
    /** @type {AggregateSpec|null} */
    this._aggregate = null;
  }

  /**
   * Sets the match pattern(s) for filtering nodes by ID.
   *
   * Supports glob-style patterns:
   * - `*` matches all nodes
   * - `user:*` matches all nodes starting with "user:"
   * - `*:admin` matches all nodes ending with ":admin"
   * - Array of patterns: `['campaign:*', 'milestone:*']` (OR semantics)
   *
   * @param {string|string[]} pattern - Glob pattern or array of patterns to match node IDs against
   * @returns {QueryBuilder} This builder for chaining
   * @throws {QueryError} If pattern is not a string or array of strings (code: E_QUERY_MATCH_TYPE)
   */
  match(pattern) {
    assertMatchPattern(pattern);
    /** @type {string|string[]|null} */
    this._pattern = pattern;
    return this;
  }

  /**
   * Filters nodes by predicate function or object shorthand.
   *
   * Object form: `where({ role: 'admin' })` filters nodes where `props.role === 'admin'`.
   * Multiple properties in the object = AND semantics.
   * Function form: `where(n => n.props.age > 18)` for arbitrary predicates.
   *
   * @param {((node: QueryNodeSnapshot) => boolean) | Record<string, unknown>} fn - Predicate function or object with property constraints
   * @returns {QueryBuilder} This builder for chaining
   * @throws {QueryError} If fn is neither a function nor a plain object (code: E_QUERY_WHERE_TYPE)
   * @throws {QueryError} If object shorthand contains non-primitive values (code: E_QUERY_WHERE_VALUE_TYPE)
   */
  where(fn) {
    assertPredicate(fn);
    const predicate = isPlainObject(fn) ? objectToPredicate(/** @type {Record<string, unknown>} */ (fn)) : /** @type {(node: QueryNodeSnapshot) => boolean} */ (fn);
    this._operations.push({ type: 'where', fn: predicate });
    return this;
  }

  /**
   * Traverses outgoing edges from the current working set.
   *
   * Replaces the working set with all nodes reachable via outgoing edges.
   * Use the depth option for multi-hop traversal.
   *
   * @param {string} [label] - Edge label filter (undefined = all labels)
   * @param {{ depth?: number | [number, number] }} [options] - Traversal options. depth can be a number (exactly N hops) or [min, max] range
   * @returns {QueryBuilder} This builder for chaining
   * @throws {QueryError} If called after aggregate() (code: E_QUERY_AGGREGATE_TERMINAL)
   * @throws {QueryError} If label is defined but not a string (code: E_QUERY_LABEL_TYPE)
   * @throws {QueryError} If depth is invalid (code: E_QUERY_DEPTH_TYPE or E_QUERY_DEPTH_RANGE)
   */
  outgoing(label, options) {
    if (this._aggregate) {
      throw new QueryError('outgoing() cannot be called after aggregate()', {
        code: 'E_QUERY_AGGREGATE_TERMINAL',
      });
    }
    assertLabel(label);
    const depth = normalizeDepth(options?.depth);
    this._operations.push({ type: 'outgoing', label, depth });
    return this;
  }

  /**
   * Traverses incoming edges to the current working set.
   *
   * Replaces the working set with all nodes that have edges pointing to nodes in the current set.
   * Use the depth option for multi-hop traversal.
   *
   * @param {string} [label] - Edge label filter (undefined = all labels)
   * @param {{ depth?: number | [number, number] }} [options] - Traversal options. depth can be a number (exactly N hops) or [min, max] range
   * @returns {QueryBuilder} This builder for chaining
   * @throws {QueryError} If called after aggregate() (code: E_QUERY_AGGREGATE_TERMINAL)
   * @throws {QueryError} If label is defined but not a string (code: E_QUERY_LABEL_TYPE)
   * @throws {QueryError} If depth is invalid (code: E_QUERY_DEPTH_TYPE or E_QUERY_DEPTH_RANGE)
   */
  incoming(label, options) {
    if (this._aggregate) {
      throw new QueryError('incoming() cannot be called after aggregate()', {
        code: 'E_QUERY_AGGREGATE_TERMINAL',
      });
    }
    assertLabel(label);
    const depth = normalizeDepth(options?.depth);
    this._operations.push({ type: 'incoming', label, depth });
    return this;
  }

  /**
   * Selects which fields to include in the result nodes.
   *
   * Available fields: `id`, `props`. If not called or called with undefined,
   * all fields are included. Empty arrays behave the same as undefined.
   *
   * @param {string[]} [fields] - Array of field names to include (e.g., ['id', 'props'])
   * @returns {QueryBuilder} This builder for chaining
   * @throws {QueryError} If called after aggregate() (code: E_QUERY_AGGREGATE_TERMINAL)
   * @throws {QueryError} If fields is not an array (code: E_QUERY_SELECT_TYPE)
   * @throws {QueryError} If fields contains unknown field names (code: E_QUERY_SELECT_FIELD) - thrown at run() time
   */
  select(fields) {
    if (this._aggregate) {
      throw new QueryError('select() cannot be called after aggregate()', {
        code: 'E_QUERY_AGGREGATE_TERMINAL',
      });
    }
    if (fields === undefined) {
      this._select = null;
      return this;
    }
    if (!Array.isArray(fields)) {
      throw new QueryError('select() expects an array of fields', {
        code: 'E_QUERY_SELECT_TYPE',
        context: { receivedType: typeof fields },
      });
    }
    this._select = fields;
    return this;
  }

  /**
   * Computes aggregations over the matched nodes.
   *
   * This is a terminal operation - calling `select()`, `outgoing()`, or `incoming()` after
   * `aggregate()` throws. The result of `run()` will contain aggregation values instead of nodes.
   *
   * Numeric aggregations (sum, avg, min, max) accept property paths like "price" or "nested.value".
   * The "props." prefix is optional and will be stripped automatically.
   *
   * @param {AggregateSpec} spec - Aggregation specification
   * @returns {QueryBuilder} This builder for chaining
   * @throws {QueryError} If spec is not a plain object (code: E_QUERY_AGGREGATE_TYPE)
   * @throws {QueryError} If numeric aggregation keys are not strings (code: E_QUERY_AGGREGATE_TYPE)
   * @throws {QueryError} If count is not a boolean (code: E_QUERY_AGGREGATE_TYPE)
   */
  aggregate(spec) {
    if (!isPlainObject(spec)) {
      throw new QueryError('aggregate() expects an object', {
        code: 'E_QUERY_AGGREGATE_TYPE',
        context: { receivedType: typeof spec },
      });
    }
    const numericKeys = ['sum', 'avg', 'min', 'max'];
    const specAny = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (spec));
    for (const key of numericKeys) {
      if (specAny[key] !== undefined && typeof specAny[key] !== 'string') {
        throw new QueryError(`aggregate() expects ${key} to be a string path`, {
          code: 'E_QUERY_AGGREGATE_TYPE',
          context: { key, receivedType: typeof specAny[key] },
        });
      }
    }
    if (spec.count !== undefined && typeof spec.count !== 'boolean') {
      throw new QueryError('aggregate() expects count to be boolean', {
        code: 'E_QUERY_AGGREGATE_TYPE',
        context: { key: 'count', receivedType: typeof spec.count },
      });
    }
    this._aggregate = spec;
    return this;
  }

  /**
   * Executes the query and returns matching nodes or aggregation results.
   *
   * The returned stateHash can be used to detect if the graph has changed
   * between queries. Results are deterministically ordered by node ID.
   *
   * @returns {Promise<QueryResult | AggregateResult>} Query results with stateHash. Contains `nodes` array for regular queries, or aggregation values (count, sum, avg, min, max) if aggregate() was called.
   * @throws {QueryError} If an unknown select field is specified (code: E_QUERY_SELECT_FIELD)
   */
  async run() {
    const materialized = await /** @type {{ _materializeGraph: () => Promise<{adjacency: AdjacencyMaps, stateHash: string}> }} */ (this._graph)._materializeGraph();
    const { adjacency, stateHash } = materialized;
    const allNodes = sortIds(await this._graph.getNodes());

    const pattern = this._pattern ?? DEFAULT_PATTERN;

    // Per-run props memo to avoid redundant getNodeProps calls
    /** @type {Map<string, Record<string, unknown>>} */
    const propsMemo = new Map();
    const getProps = async (/** @type {string} */ nodeId) => {
      const cached = propsMemo.get(nodeId);
      if (cached !== undefined) {
        return cached;
      }
      const propsRecord = (await this._graph.getNodeProps(nodeId)) || {};
      propsMemo.set(nodeId, propsRecord);
      return propsRecord;
    };

    let workingSet;
    workingSet = allNodes.filter((nodeId) => matchGlob(pattern, nodeId));

    for (const op of this._operations) {
      if (op.type === 'where') {
        const snapshots = await batchMap(workingSet, async (nodeId) => {
          const propsRecord = await getProps(nodeId);
          const edgesOut = adjacency.outgoing.get(nodeId) || [];
          const edgesIn = adjacency.incoming.get(nodeId) || [];
          return {
            nodeId,
            snapshot: createNodeSnapshot({ id: nodeId, propsRecord, edgesOut, edgesIn }),
          };
        });
        const predicate = /** @type {(node: QueryNodeSnapshot) => boolean} */ (op.fn);
        const filtered = snapshots
          .filter(({ snapshot }) => predicate(snapshot))
          .map(({ nodeId }) => nodeId);
        workingSet = sortIds(filtered);
        continue;
      }

      if (op.type === 'outgoing' || op.type === 'incoming') {
        const [minD, maxD] = /** @type {[number, number]} */ (op.depth);
        if (minD === 1 && maxD === 1) {
          workingSet = applyHop({
            direction: op.type,
            label: op.label,
            workingSet,
            adjacency,
          });
        } else {
          workingSet = applyMultiHop({
            direction: op.type,
            label: op.label,
            workingSet,
            adjacency,
            depth: /** @type {[number, number]} */ (op.depth),
          });
        }
      }
    }

    if (this._aggregate) {
      return await this._runAggregate(workingSet, stateHash, getProps);
    }

    const selected = this._select;
    const selectFields = Array.isArray(selected) && selected.length > 0 ? selected : null;
    const allowedFields = new Set(['id', 'props']);
    if (selectFields) {
      for (const field of selectFields) {
        if (!allowedFields.has(field)) {
          throw new QueryError(`Unknown select field: ${field}`, {
            code: 'E_QUERY_SELECT_FIELD',
            context: { field },
          });
        }
      }
    }

    const includeId = !selectFields || selectFields.includes('id');
    const includeProps = !selectFields || selectFields.includes('props');

    const nodes = await batchMap(workingSet, async (nodeId) => {
      const entry = {};
      if (includeId) {
        entry.id = nodeId;
      }
      if (includeProps) {
        const propsRecord = await getProps(nodeId);
        const props = buildPropsSnapshot(propsRecord);
        if (selectFields || Object.keys(props).length > 0) {
          entry.props = props;
        }
      }
      return entry;
    });

    return { stateHash, nodes };
  }

  /**
   * Executes aggregate computations over the matched node set.
   *
   * Supports count, sum, avg, min, and max aggregations. Numeric aggregations
   * (sum, avg, min, max) operate on property paths like "price" or "props.nested.value".
   * Non-numeric values are silently ignored in numeric aggregations.
   *
   * @param {string[]} workingSet - Array of matched node IDs
   * @param {string} stateHash - Hash of the materialized state
   * @param {(nodeId: string) => Promise<Record<string, unknown>>} getProps - Memoized props fetcher
   * @returns {Promise<AggregateResult>} Object containing stateHash and requested aggregation values
   * @private
   */
  async _runAggregate(workingSet, stateHash, getProps) {
    const spec = /** @type {AggregateSpec} */ (this._aggregate);
    /** @type {AggregateResult} */
    const result = { stateHash };
    const specRec = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (spec));

    if (spec.count) {
      result.count = workingSet.length;
    }

    const numericAggs = ['sum', 'avg', 'min', 'max'];
    const activeAggs = numericAggs.filter((key) => specRec[key]);

    if (activeAggs.length > 0) {
      /** @type {Map<string, {segments: string[], values: number[]}>} */
      const propsByAgg = new Map();
      for (const key of activeAggs) {
        propsByAgg.set(key, {
          segments: /** @type {string} */ (specRec[key]).replace(/^props\./, '').split('.'),
          values: [],
        });
      }

      // Pre-fetch all props with bounded concurrency
      const propsList = await batchMap(workingSet, getProps);

      for (const propsRecord of propsList) {
        for (const { segments, values } of propsByAgg.values()) {
          /** @type {unknown} */
          let value = propsRecord[segments[0]];
          for (let i = 1; i < segments.length; i++) {
            if (value && typeof value === 'object') {
              value = /** @type {Record<string, unknown>} */ (value)[segments[i]];
            } else {
              value = undefined;
              break;
            }
          }
          if (typeof value === 'number' && !Number.isNaN(value)) {
            values.push(value);
          }
        }
      }

      for (const [key, { values }] of propsByAgg) {
        if (key === 'sum') {
          result.sum = values.length > 0 ? values.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) : 0;
        } else if (key === 'avg') {
          result.avg = values.length > 0 ? values.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / values.length : 0;
        } else if (key === 'min') {
          result.min =
            values.length > 0 ? values.reduce((/** @type {number} */ m, /** @type {number} */ v) => (v < m ? v : m), Infinity) : 0;
        } else if (key === 'max') {
          result.max =
            values.length > 0 ? values.reduce((/** @type {number} */ m, /** @type {number} */ v) => (v > m ? v : m), -Infinity) : 0;
        }
      }
    }

    return result;
  }
}
