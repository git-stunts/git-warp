/**
 * QueryBuilder - Fluent query builder for materialized WARP state.
 *
 * Supports deterministic, multi-hop traversal over the logical graph.
 */

import QueryError from '../errors/QueryError.js';

const DEFAULT_PATTERN = '*';

/**
 * @typedef {Object} QueryNodeSnapshot
 * @property {string} id
 * @property {Record<string, unknown>} props
 * @property {Array<{label: string, to: string}>} edgesOut
 * @property {Array<{label: string, from: string}>} edgesIn
 */

function assertMatchPattern(pattern) {
  if (typeof pattern !== 'string') {
    throw new QueryError('match() expects a string pattern', {
      code: 'E_QUERY_MATCH_TYPE',
      context: { receivedType: typeof pattern },
    });
  }
}

function assertPredicate(fn) {
  if (typeof fn !== 'function' && !isPlainObject(fn)) {
    throw new QueryError('where() expects a predicate function or object', {
      code: 'E_QUERY_WHERE_TYPE',
      context: { receivedType: typeof fn },
    });
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitive(value) {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

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

function sortIds(ids) {
  return [...ids].sort();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPattern(nodeId, pattern) {
  if (pattern === DEFAULT_PATTERN) {
    return true;
  }
  if (pattern.includes('*')) {
    const regex = new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, '.*')}$`);
    return regex.test(nodeId);
  }
  return nodeId === pattern;
}

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

function buildPropsSnapshot(propsMap) {
  const props = {};
  const keys = [...propsMap.keys()].sort();
  for (const key of keys) {
    props[key] = cloneValue(propsMap.get(key));
  }
  return deepFreeze(props);
}

function buildEdgesSnapshot(edges, directionKey) {
  const list = edges.map((edge) => ({
    label: edge.label,
    [directionKey]: edge.neighborId ?? edge[directionKey],
  }));
  list.sort((a, b) => {
    if (a.label !== b.label) {
      return a.label < b.label ? -1 : 1;
    }
    const aPeer = a[directionKey];
    const bPeer = b[directionKey];
    return aPeer < bPeer ? -1 : aPeer > bPeer ? 1 : 0;
  });
  return deepFreeze(list);
}

function createNodeSnapshot({ id, propsMap, edgesOut, edgesIn }) {
  const props = buildPropsSnapshot(propsMap);
  const edgesOutSnapshot = buildEdgesSnapshot(edgesOut, 'to');
  const edgesInSnapshot = buildEdgesSnapshot(edgesIn, 'from');

  return deepFreeze({
    id,
    props,
    edgesOut: edgesOutSnapshot,
    edgesIn: edgesInSnapshot,
  });
}

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
    this._pattern = null;
    this._operations = [];
    this._select = null;
    this._aggregate = null;
  }

  /**
   * Sets the match pattern (string only).
   * @param {string} pattern
   * @returns {QueryBuilder}
   */
  match(pattern) {
    assertMatchPattern(pattern);
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
   * @param {((node: QueryNodeSnapshot) => boolean) | Record<string, unknown>} fn
   * @returns {QueryBuilder}
   */
  where(fn) {
    assertPredicate(fn);
    const predicate = isPlainObject(fn) ? objectToPredicate(fn) : fn;
    this._operations.push({ type: 'where', fn: predicate });
    return this;
  }

  /**
   * Traverses outgoing edges.
   *
   * @param {string} [label] - Edge label filter (undefined = all labels)
   * @param {{ depth?: number | [number, number] }} [options] - Traversal options
   * @returns {QueryBuilder}
   * @throws {QueryError} If called after aggregate()
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
   * Traverses incoming edges.
   *
   * @param {string} [label] - Edge label filter (undefined = all labels)
   * @param {{ depth?: number | [number, number] }} [options] - Traversal options
   * @returns {QueryBuilder}
   * @throws {QueryError} If called after aggregate()
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
   * Selects fields for the result.
   * @param {string[]} [fields]
   * @returns {QueryBuilder}
   * @throws {QueryError} If called after aggregate()
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
   * This is a terminal operation — calling `select()`, `outgoing()`, or `incoming()` after
   * `aggregate()` throws. The result of `run()` will contain aggregation values instead of nodes.
   *
   * @param {{ count?: boolean, sum?: string, avg?: string, min?: string, max?: string }} spec
   * @returns {QueryBuilder}
   * @throws {QueryError} If spec is not a plain object
   */
  aggregate(spec) {
    if (!isPlainObject(spec)) {
      throw new QueryError('aggregate() expects an object', {
        code: 'E_QUERY_AGGREGATE_TYPE',
        context: { receivedType: typeof spec },
      });
    }
    const numericKeys = ['sum', 'avg', 'min', 'max'];
    for (const key of numericKeys) {
      if (spec[key] !== undefined && typeof spec[key] !== 'string') {
        throw new QueryError(`aggregate() expects ${key} to be a string path`, {
          code: 'E_QUERY_AGGREGATE_TYPE',
          context: { key, receivedType: typeof spec[key] },
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
   * Runs the query and returns matching nodes with their state hash.
   *
   * @returns {Promise<{stateHash: string, nodes: Array<{id?: string, props?: Record<string, unknown>}>}>}
   * @throws {QueryError} If an unknown select field is specified
   */
  async run() {
    const materialized = await this._graph._materializeGraph();
    const { adjacency, stateHash } = materialized;
    const allNodes = sortIds(await this._graph.getNodes());

    const pattern = this._pattern ?? DEFAULT_PATTERN;

    let workingSet;
    workingSet = allNodes.filter((nodeId) => matchesPattern(nodeId, pattern));

    for (const op of this._operations) {
      if (op.type === 'where') {
        const snapshots = await Promise.all(
          workingSet.map(async (nodeId) => {
            const propsMap = (await this._graph.getNodeProps(nodeId)) || new Map();
            const edgesOut = adjacency.outgoing.get(nodeId) || [];
            const edgesIn = adjacency.incoming.get(nodeId) || [];
            return {
              nodeId,
              snapshot: createNodeSnapshot({ id: nodeId, propsMap, edgesOut, edgesIn }),
            };
          })
        );
        const filtered = snapshots
          .filter(({ snapshot }) => op.fn(snapshot))
          .map(({ nodeId }) => nodeId);
        workingSet = sortIds(filtered);
        continue;
      }

      if (op.type === 'outgoing' || op.type === 'incoming') {
        const [minD, maxD] = op.depth;
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
            depth: op.depth,
          });
        }
      }
    }

    if (this._aggregate) {
      return await this._runAggregate(workingSet, stateHash);
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

    const nodes = await Promise.all(
      workingSet.map(async (nodeId) => {
        const entry = {};
        if (includeId) {
          entry.id = nodeId;
        }
        if (includeProps) {
          const propsMap = (await this._graph.getNodeProps(nodeId)) || new Map();
          const props = buildPropsSnapshot(propsMap);
          if (selectFields || Object.keys(props).length > 0) {
            entry.props = props;
          }
        }
        return entry;
      })
    );

    return { stateHash, nodes };
  }

  /** @private */
  async _runAggregate(workingSet, stateHash) {
    const spec = this._aggregate;
    const result = { stateHash };

    if (spec.count) {
      result.count = workingSet.length;
    }

    const numericAggs = ['sum', 'avg', 'min', 'max'];
    const activeAggs = numericAggs.filter((key) => spec[key]);

    if (activeAggs.length > 0) {
      const propsByAgg = new Map();
      for (const key of activeAggs) {
        propsByAgg.set(key, {
          segments: spec[key].replace(/^props\./, '').split('.'),
          values: [],
        });
      }

      for (const nodeId of workingSet) {
        const propsMap = (await this._graph.getNodeProps(nodeId)) || new Map();
        for (const { segments, values } of propsByAgg.values()) {
          let value = propsMap.get(segments[0]);
          for (let i = 1; i < segments.length; i++) {
            if (value && typeof value === 'object') {
              value = value[segments[i]];
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
          result.sum = values.length > 0 ? values.reduce((a, b) => a + b, 0) : 0;
        } else if (key === 'avg') {
          result.avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        } else if (key === 'min') {
          result.min =
            values.length > 0 ? values.reduce((m, v) => (v < m ? v : m), Infinity) : 0;
        } else if (key === 'max') {
          result.max =
            values.length > 0 ? values.reduce((m, v) => (v > m ? v : m), -Infinity) : 0;
        }
      }
    }

    return result;
  }
}
